import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Compass,
  FileEdit,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { webApi } from '../services/api';
import { EMPTY_CHAPTER_OUTLINE } from '../services/storage';
import type {
  AuthUser,
  ChapterOutline,
  OutlineScene,
  ProjectOutline,
  StoryChapter,
  StoryNode,
  StoryProject,
} from '../types/story';

interface OutlineViewProps {
  user: AuthUser | null;
  project: StoryProject | null;
  chapters: StoryChapter[];
  nodes: StoryNode[];
  activeChapterId: string | null;
  outline: ProjectOutline;
  onUpdateProjectOutline: (patch: Partial<Omit<ProjectOutline, 'chapters'>>) => void;
  onUpdateChapterOutline: (chapterId: string, patch: Partial<ChapterOutline>) => void;
  onRenameChapter: (chapterId: string, newTitle: string) => void;
  onCreateChapter: () => Promise<void>;
  onOpenChapterDraft: (chapterId: string) => void;
  onOpenChapterManuscript: (chapterId: string) => void;
  onOpenAuth: () => void;
  onNotify: (msg: string) => void;
  locked?: boolean;
}

function parseJsonFromAI<T>(raw: string): T | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const OutlineView: React.FC<OutlineViewProps> = ({
  user,
  project,
  chapters,
  nodes,
  activeChapterId,
  outline,
  onUpdateProjectOutline,
  onUpdateChapterOutline,
  onRenameChapter,
  onCreateChapter,
  onOpenChapterDraft,
  onOpenChapterManuscript,
  onOpenAuth,
  onNotify,
  locked = false,
}) => {
  const [showMasterOutline, setShowMasterOutline] = useState(true);
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});
  const [storyAiPrompt, setStoryAiPrompt] = useState('');
  const [generatingStoryOutline, setGeneratingStoryOutline] = useState(false);
  const [chapterAiPrompts, setChapterAiPrompts] = useState<Record<string, string>>({});
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);

  if (!project) {
    return (
      <div className="editor-scroll-area">
        <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
          Chưa có dự án nào được chọn.
        </div>
      </div>
    );
  }

  const toggleChapterCard = (chapterId: string) => {
    setCollapsedChapters((prev) => ({ ...prev, [chapterId]: !prev[chapterId] }));
  };

  const getChapterScenes = (chOutline: ChapterOutline): OutlineScene[] => {
    if (Array.isArray(chOutline.scenes) && chOutline.scenes.length > 0) {
      return chOutline.scenes;
    }
    return [];
  };

  const handleAddScene = (chapterId: string, chOutline: ChapterOutline) => {
    const current = getChapterScenes(chOutline);
    const nextScene: OutlineScene = {
      id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `Cảnh ${current.length + 1}`,
      summary: '',
    };
    onUpdateChapterOutline(chapterId, { scenes: [...current, nextScene] });
  };

  const handleUpdateScene = (
    chapterId: string,
    chOutline: ChapterOutline,
    sceneId: string,
    patch: Partial<Pick<OutlineScene, 'title' | 'summary'>>
  ) => {
    const current = getChapterScenes(chOutline);
    onUpdateChapterOutline(chapterId, {
      scenes: current.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
    });
  };

  const handleMoveScene = (
    chapterId: string,
    chOutline: ChapterOutline,
    index: number,
    direction: -1 | 1
  ) => {
    const current = [...getChapterScenes(chOutline)];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= current.length) return;
    [current[index], current[targetIdx]] = [current[targetIdx], current[index]];
    onUpdateChapterOutline(chapterId, { scenes: current });
  };

  const handleDeleteScene = (
    chapterId: string,
    chOutline: ChapterOutline,
    sceneId: string
  ) => {
    const current = getChapterScenes(chOutline);
    onUpdateChapterOutline(chapterId, {
      scenes: current.filter((s) => s.id !== sceneId),
    });
  };

  const handleGenerateStoryOutline = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (generatingStoryOutline || locked) return;
    setGeneratingStoryOutline(true);
    try {
      const existingSummary = [
        outline.worldSetting && `Bối cảnh hiện có: ${outline.worldSetting}`,
        outline.writingStyle && `Văn phong hiện có: ${outline.writingStyle}`,
        outline.storyFramework && `Khung cốt truyện hiện có: ${outline.storyFramework}`,
        outline.storyLogic && `Logic hiện có: ${outline.storyLogic}`,
        outline.characterOverview && `Nhân vật hiện có: ${outline.characterOverview}`,
      ]
        .filter(Boolean)
        .join('\n');

      const prompt = [
        `Dự án truyện: "${project.title}"`,
        existingSummary ? `\nThông tin dàn ý đã có:\n${existingSummary}` : '',
        storyAiPrompt.trim()
          ? `\nÝ tưởng / Yêu cầu của tác giả: ${storyAiPrompt.trim()}`
          : '\nHãy dựa trên tên truyện và hồ sơ thế giới hiện có để xây dựng đầy đủ khung & logic tổng thể cho câu chuyện.',
      ]
        .filter(Boolean)
        .join('\n');

      const res = await webApi.chatWithAI({
        mode: 'web_outline_story',
        messages: [{ role: 'user', content: prompt }],
        projectContext: {
          projectId: project.isLocalOnly ? undefined : project.id,
          projectTitle: project.title,
          nodes: nodes.slice(0, 60),
        },
      });

      const parsed = parseJsonFromAI<{
        worldSetting?: string;
        writingStyle?: string;
        storyFramework?: string;
        storyLogic?: string;
        characterOverview?: string;
      }>(res.data?.message || '');

      if (!parsed) {
        onNotify('AI trả về định dạng chưa chuẩn JSON. Hãy thử bấm lại.');
        return;
      }

      onUpdateProjectOutline({
        ...(parsed.worldSetting ? { worldSetting: parsed.worldSetting } : {}),
        ...(parsed.writingStyle ? { writingStyle: parsed.writingStyle } : {}),
        ...(parsed.storyFramework ? { storyFramework: parsed.storyFramework } : {}),
        ...(parsed.storyLogic ? { storyLogic: parsed.storyLogic } : {}),
        ...(parsed.characterOverview ? { characterOverview: parsed.characterOverview } : {}),
      });
      setStoryAiPrompt('');
      onNotify('AI đã lập xong khung & logic tổng thể câu chuyện.');
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Không thể gọi AI lập dàn ý tổng thể.');
    } finally {
      setGeneratingStoryOutline(false);
    }
  };

  const handleGenerateChapterOutline = async (ch: StoryChapter) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (generatingChapterId || locked) return;
    setGeneratingChapterId(ch.id);
    try {
      const chOutline: ChapterOutline = {
        ...EMPTY_CHAPTER_OUTLINE,
        ...(outline.chapters[ch.id] || {}),
      };
      const prevChaptersSummary = chapters
        .filter((c) => c.chapterNumber < ch.chapterNumber)
        .slice(-3)
        .map((c) => {
          const prevOut = outline.chapters[c.id];
          const prevScenes = (prevOut?.scenes || [])
            .map((s) => s.title)
            .filter(Boolean)
            .join(' → ');
          return `- ${c.title || `Chương ${c.chapterNumber}`}${prevScenes ? `: ${prevScenes}` : ''}`;
        })
        .join('\n');

      const masterBlock = [
        outline.worldSetting && `Bối cảnh thế giới: ${outline.worldSetting}`,
        outline.writingStyle && `Văn phong chủ đạo: ${outline.writingStyle}`,
        outline.storyFramework && `Khung cốt truyện: ${outline.storyFramework}`,
        outline.storyLogic && `Logic & quy tắc: ${outline.storyLogic}`,
        outline.characterOverview && `Nhân vật chính: ${outline.characterOverview}`,
      ]
        .filter(Boolean)
        .join('\n');

      const customNote = (chapterAiPrompts[ch.id] || '').trim();
      const prompt = [
        `Hãy lập khung dàn ý và chia từng cảnh cho ${ch.title || `Chương ${ch.chapterNumber}`} (Chương số ${ch.chapterNumber}).`,
        masterBlock ? `\n[Dàn ý tổng thể]\n${masterBlock}` : '',
        prevChaptersSummary ? `\n[Các chương trước]\n${prevChaptersSummary}` : '',
        chOutline.setting ? `\nBối cảnh chương tác giả đã ghi: ${chOutline.setting}` : '',
        customNote
          ? `\nÝ tưởng / Yêu cầu riêng cho chương này: ${customNote}`
          : '\nHãy đề xuất bối cảnh, văn phong, nhân vật, móc nối logic và chia thành 3–5 cảnh cụ thể.',
      ]
        .filter(Boolean)
        .join('\n');

      const res = await webApi.chatWithAI({
        mode: 'web_outline_chapter',
        messages: [{ role: 'user', content: prompt }],
        projectContext: {
          projectId: project.isLocalOnly ? undefined : project.id,
          projectTitle: project.title,
          chapterNumber: ch.chapterNumber,
          chapterTitle: ch.title,
          nodes: nodes.slice(0, 60),
        },
      });

      const parsed = parseJsonFromAI<{
        title?: string;
        setting?: string;
        style?: string;
        characters?: string;
        logicNotes?: string;
        scenes?: Array<{ title?: string; summary?: string }>;
      }>(res.data?.message || '');

      if (!parsed) {
        onNotify('AI trả về định dạng chưa chuẩn JSON. Hãy thử bấm lại.');
        return;
      }

      const mappedScenes: OutlineScene[] = Array.isArray(parsed.scenes)
        ? parsed.scenes
            .filter((s) => s && (s.title || s.summary))
            .map((s, idx) => ({
              id: `sc-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
              title: String(s.title || `Cảnh ${idx + 1}`).trim(),
              summary: String(s.summary || '').trim(),
            }))
        : getChapterScenes(chOutline);

      onUpdateChapterOutline(ch.id, {
        ...(parsed.setting ? { setting: parsed.setting } : {}),
        ...(parsed.style ? { style: parsed.style } : {}),
        ...(parsed.characters ? { characters: parsed.characters } : {}),
        ...(parsed.logicNotes ? { logicNotes: parsed.logicNotes } : {}),
        scenes: mappedScenes,
      });

      // Nếu tên chương hiện tại vẫn là tên mặc định ("Chương X") thì tự điền tên gợi ý từ AI
      if (parsed.title?.trim() && /^chương\s*\d+\s*$/i.test((ch.title || '').trim())) {
        onRenameChapter(ch.id, parsed.title.trim());
      }

      setChapterAiPrompts((prev) => ({ ...prev, [ch.id]: '' }));
      onNotify(`AI đã lập dàn ý và chia ${mappedScenes.length} cảnh cho chương.`);
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Không thể gọi AI lập dàn ý chương.');
    } finally {
      setGeneratingChapterId(null);
    }
  };

  return (
    <div className="editor-scroll-area">
      <div className="outline-container">
        {/* MASTER STORY OUTLINE & LOGIC */}
        <section className="outline-section-card">
          <button
            type="button"
            className="outline-section-header"
            onClick={() => setShowMasterOutline((v) => !v)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Compass size={17} color="var(--accent)" />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Khung & Logic toàn bộ câu chuyện — {project.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Bối cảnh tổng thể, văn phong chủ đạo, tuyến nhân vật và hệ thống logic xuyên suốt
                </div>
              </div>
            </div>
            {showMasterOutline ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {showMasterOutline && (
            <>
              <div className="ai-outline-bar">
                <input
                  className="text-input"
                  style={{ flex: 1, minWidth: 200 }}
                  value={storyAiPrompt}
                  disabled={generatingStoryOutline || locked}
                  onChange={(e) => setStoryAiPrompt(e.target.value)}
                  placeholder="Nhập ý tưởng cốt lõi để AI lập khung & logic toàn truyện (tùy chọn)..."
                />
                <button
                  type="button"
                  className="primary-btn"
                  disabled={generatingStoryOutline || locked}
                  onClick={() => void handleGenerateStoryOutline()}
                >
                  {generatingStoryOutline ? (
                    <>
                      <Loader2 size={14} className="spin" /> Đang lập khung...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> AI lập khung truyện
                    </>
                  )}
                </button>
              </div>

              <div className="outline-grid">
                <div className="outline-field">
                  <label className="outline-label">Bối cảnh thế giới</label>
                  <textarea
                    className="outline-textarea"
                    rows={3}
                    readOnly={locked}
                    value={outline.worldSetting}
                    onChange={(e) => onUpdateProjectOutline({ worldSetting: e.target.value })}
                    placeholder="Thời đại, không gian, quy luật xã hội/phép thuật/công nghệ, bầu không khí chung của truyện..."
                  />
                </div>

                <div className="outline-field">
                  <label className="outline-label">Văn phong & Giọng kể</label>
                  <textarea
                    className="outline-textarea"
                    rows={3}
                    readOnly={locked}
                    value={outline.writingStyle}
                    onChange={(e) => onUpdateProjectOutline({ writingStyle: e.target.value })}
                    placeholder="VD: Ngôi thứ ba hạn tri, giọng văn trầm lắng, giàu chi tiết giác quan, nhịp đối thoại sắc gọn..."
                  />
                </div>

                <div className="outline-field">
                  <label className="outline-label">Khung cốt truyện chính (3 hồi / tuyến truyện)</label>
                  <textarea
                    className="outline-textarea"
                    rows={4}
                    readOnly={locked}
                    value={outline.storyFramework}
                    onChange={(e) => onUpdateProjectOutline({ storyFramework: e.target.value })}
                    placeholder="Mở đầu — Xung đột chính — Cao trào — Nút thắt — Hướng kết cục của toàn truyện..."
                  />
                </div>

                <div className="outline-field">
                  <label className="outline-label">Logic & Quy tắc bất biến</label>
                  <textarea
                    className="outline-textarea"
                    rows={4}
                    readOnly={locked}
                    value={outline.storyLogic}
                    onChange={(e) => onUpdateProjectOutline({ storyLogic: e.target.value })}
                    placeholder="Các quy tắc nhân quả, giới hạn sức mạnh, mốc thời gian quan trọng không được mâu thuẫn..."
                  />
                </div>

                <div className="outline-field outline-field-full">
                  <label className="outline-label">Ghi chú tuyến nhân vật tổng quan</label>
                  <textarea
                    className="outline-textarea"
                    rows={3}
                    readOnly={locked}
                    value={outline.characterOverview}
                    onChange={(e) => onUpdateProjectOutline({ characterOverview: e.target.value })}
                    placeholder="Nhân vật chính, đối trọng, động cơ cốt lõi và hướng phát triển tâm lý qua các hồi..."
                  />
                </div>
              </div>
            </>
          )}
        </section>

        {/* CHAPTER OUTLINE FRAMES */}
        <div className="outline-chapters-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={16} color="var(--accent)" />
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              Khung dàn ý theo từng chương ({chapters.length})
            </span>
          </div>
          <button
            type="button"
            className="primary-btn"
            disabled={locked}
            onClick={() => void onCreateChapter()}
          >
            <Plus size={14} /> Thêm khung chương mới
          </button>
        </div>

        <div className="outline-chapter-list">
          {chapters.map((ch) => {
            const chOutline: ChapterOutline = {
              ...EMPTY_CHAPTER_OUTLINE,
              ...(outline.chapters[ch.id] || {}),
            };
            const scenes = getChapterScenes(chOutline);
            const isCollapsed = Boolean(collapsedChapters[ch.id]);
            const isCurrent = ch.id === activeChapterId;
            const isGeneratingThis = generatingChapterId === ch.id;

            return (
              <article
                key={ch.id}
                className={`outline-chapter-card ${isCurrent ? 'active' : ''}`}
              >
                <div className="outline-chapter-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 200 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ height: 28, padding: '0 4px' }}
                      onClick={() => toggleChapterCard(ch.id)}
                      aria-label={isCollapsed ? 'Mở rộng khung chương' : 'Thu gọn khung chương'}
                    >
                      {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <span className="outline-chapter-badge">C{ch.chapterNumber}</span>
                    <input
                      className="outline-chapter-title-input"
                      value={ch.title}
                      readOnly={locked}
                      onChange={(e) => onRenameChapter(ch.id, e.target.value)}
                      placeholder={`Chương ${ch.chapterNumber}...`}
                      aria-label={`Tên chương ${ch.chapterNumber}`}
                    />
                    {scenes.length > 0 && (
                      <span className="brand-badge" style={{ flexShrink: 0 }}>
                        {scenes.length} cảnh
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="icon-btn bordered"
                      disabled={locked}
                      onClick={() => onOpenChapterDraft(ch.id)}
                      title="Mở phòng viết nháp (AI v1 → v2 → Lưu bản chính) cho chương này"
                    >
                      <Sparkles size={13} color="var(--accent)" />
                      <span>Viết nháp</span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn bordered"
                      disabled={locked}
                      onClick={() => onOpenChapterManuscript(ch.id)}
                      title="Mở bản thảo chính thức của chương này"
                    >
                      <BookOpen size={13} />
                      <span>Bản chính</span>
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    <div className="ai-outline-bar" style={{ marginTop: 12 }}>
                      <input
                        className="text-input"
                        style={{ flex: 1, minWidth: 180, height: 32, fontSize: 12.5 }}
                        value={chapterAiPrompts[ch.id] || ''}
                        disabled={Boolean(generatingChapterId) || locked}
                        onChange={(e) =>
                          setChapterAiPrompts((prev) => ({ ...prev, [ch.id]: e.target.value }))
                        }
                        placeholder="Ý tưởng nhanh cho chương này để AI lập dàn ý & chia cảnh..."
                      />
                      <button
                        type="button"
                        className="icon-btn bordered"
                        style={{ height: 32, color: 'var(--accent)', borderColor: 'var(--border-gold)' }}
                        disabled={Boolean(generatingChapterId) || locked}
                        onClick={() => void handleGenerateChapterOutline(ch)}
                      >
                        {isGeneratingThis ? (
                          <>
                            <Loader2 size={13} className="spin" /> Đang lập...
                          </>
                        ) : (
                          <>
                            <Sparkles size={13} /> AI lập dàn ý & chia cảnh
                          </>
                        )}
                      </button>
                    </div>

                    <div className="outline-grid" style={{ marginTop: 12 }}>
                      <div className="outline-field">
                        <label className="outline-label">Bối cảnh chương</label>
                        <textarea
                          className="outline-textarea"
                          rows={2}
                          readOnly={locked}
                          value={chOutline.setting}
                          onChange={(e) =>
                            onUpdateChapterOutline(ch.id, { setting: e.target.value })
                          }
                          placeholder="Thời điểm, địa điểm, thời tiết, không khí mở màn chương..."
                        />
                      </div>

                      <div className="outline-field">
                        <label className="outline-label">Văn phong / Nhịp điệu chương</label>
                        <textarea
                          className="outline-textarea"
                          rows={2}
                          readOnly={locked}
                          value={chOutline.style}
                          onChange={(e) => onUpdateChapterOutline(ch.id, { style: e.target.value })}
                          placeholder="VD: Căng thẳng dồn dập, hoặc chậm rãi sâu lắng, tập trung nội tâm..."
                        />
                      </div>

                      <div className="outline-field">
                        <label className="outline-label">Nhân vật xuất hiện</label>
                        <textarea
                          className="outline-textarea"
                          rows={2}
                          readOnly={locked}
                          value={chOutline.characters}
                          onChange={(e) =>
                            onUpdateChapterOutline(ch.id, { characters: e.target.value })
                          }
                          placeholder="Danh sách nhân vật xuất hiện và vai trò/tâm trạng của họ trong chương..."
                        />
                      </div>

                      <div className="outline-field">
                        <label className="outline-label">Móc nối logic & Mục tiêu chương</label>
                        <textarea
                          className="outline-textarea"
                          rows={2}
                          readOnly={locked}
                          value={chOutline.logicNotes}
                          onChange={(e) =>
                            onUpdateChapterOutline(ch.id, { logicNotes: e.target.value })
                          }
                          placeholder="Chi tiết cần gieo (foreshadowing), manh mối nối sang chương sau..."
                        />
                      </div>

                      {/* PER-SCENE BUILDER */}
                      <div className="outline-field outline-field-full">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <label className="outline-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Clapperboard size={13} color="var(--accent)" />
                            Sự kiện thô theo từng cảnh ({scenes.length})
                          </label>
                          <button
                            type="button"
                            className="icon-btn bordered"
                            style={{ height: 26, fontSize: 12 }}
                            disabled={locked}
                            onClick={() => handleAddScene(ch.id, chOutline)}
                          >
                            <Plus size={12} /> Thêm cảnh
                          </button>
                        </div>

                        {scenes.length === 0 ? (
                          <div className="scene-empty-box">
                            Chưa có cảnh nào. Bấm <strong>+ Thêm cảnh</strong> hoặc dùng{' '}
                            <strong>AI lập dàn ý & chia cảnh</strong> ở trên để tạo từng cảnh cho chương.
                          </div>
                        ) : (
                          <div className="scene-list">
                            {scenes.map((scene, idx) => (
                              <div key={scene.id} className="scene-card">
                                <div className="scene-card-head">
                                  <span className="scene-index-badge">Cảnh {idx + 1}</span>
                                  <input
                                    className="scene-title-input"
                                    value={scene.title}
                                    readOnly={locked}
                                    onChange={(e) =>
                                      handleUpdateScene(ch.id, chOutline, scene.id, {
                                        title: e.target.value,
                                      })
                                    }
                                    placeholder={`Tên cảnh ${idx + 1}...`}
                                  />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      style={{ height: 24, padding: '0 4px' }}
                                      disabled={locked || idx === 0}
                                      title="Đẩy cảnh lên"
                                      onClick={() => handleMoveScene(ch.id, chOutline, idx, -1)}
                                    >
                                      <ArrowUp size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      style={{ height: 24, padding: '0 4px' }}
                                      disabled={locked || idx === scenes.length - 1}
                                      title="Đẩy cảnh xuống"
                                      onClick={() => handleMoveScene(ch.id, chOutline, idx, 1)}
                                    >
                                      <ArrowDown size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      style={{ height: 24, padding: '0 4px', color: 'var(--danger)' }}
                                      disabled={locked}
                                      title="Xóa cảnh"
                                      onClick={() => handleDeleteScene(ch.id, chOutline, scene.id)}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                                <textarea
                                  className="outline-textarea"
                                  rows={2}
                                  readOnly={locked}
                                  value={scene.summary}
                                  onChange={(e) =>
                                    handleUpdateScene(ch.id, chOutline, scene.id, {
                                      summary: e.target.value,
                                    })
                                  }
                                  placeholder="Diễn biến, hành động, xung đột và kết quả của cảnh này..."
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })}

          {chapters.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
              <FileEdit size={24} style={{ marginBottom: 8, opacity: 0.6 }} />
              <div>Chưa có chương nào. Bấm “Thêm khung chương mới” để bắt đầu lập dàn ý.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
