import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  GitBranch,
  History,
  Loader2,
  PenLine,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { webApi } from '../services/api';
import { EMPTY_CHAPTER_OUTLINE, webStorage } from '../services/storage';
import type {
  AuthUser,
  ChapterDraftStore,
  ChapterDraftVersion,
  ChapterOutline,
  EditorPreferences,
  ProjectOutline,
  StoryChapter,
  StoryNode,
  StoryProject,
} from '../types/story';
import { countWords } from '../utils/text';

interface DraftingViewProps {
  user: AuthUser | null;
  project: StoryProject | null;
  chapter: StoryChapter | null;
  nodes: StoryNode[];
  outline: ProjectOutline;
  prefs: EditorPreferences;
  locked?: boolean;
  onPublishToManuscript: (content: string, chapterId: string) => Promise<void>;
  onOpenOutline: () => void;
  onOpenAuth: () => void;
  onNotify: (msg: string) => void;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function buildOutlineContextBlock(
  project: StoryProject,
  chapter: StoryChapter,
  projectOutline: ProjectOutline,
  chapterOutline: ChapterOutline
): string {
  const parts: string[] = [];
  parts.push(`Dự án: ${project.title}`);
  parts.push(`Chương: ${chapter.title || `Chương ${chapter.chapterNumber}`}`);
  if (chapter.desc?.trim()) parts.push(`Tóm tắt chương: ${chapter.desc.trim()}`);

  const globalParts: string[] = [];
  if (projectOutline.worldSetting.trim())
    globalParts.push(`- Bối cảnh thế giới: ${projectOutline.worldSetting.trim()}`);
  if (projectOutline.writingStyle.trim())
    globalParts.push(`- Văn phong chủ đạo: ${projectOutline.writingStyle.trim()}`);
  if (projectOutline.storyFramework.trim())
    globalParts.push(`- Khung cốt truyện: ${projectOutline.storyFramework.trim()}`);
  if (projectOutline.storyLogic.trim())
    globalParts.push(`- Logic & quy tắc: ${projectOutline.storyLogic.trim()}`);
  if (projectOutline.characterOverview.trim())
    globalParts.push(`- Tuyến nhân vật: ${projectOutline.characterOverview.trim()}`);
  if (globalParts.length > 0) {
    parts.push(`\n[DÀN Ý TỔNG THỂ]\n${globalParts.join('\n')}`);
  }

  const chParts: string[] = [];
  if (chapterOutline.setting.trim()) chParts.push(`- Bối cảnh chương: ${chapterOutline.setting.trim()}`);
  if (chapterOutline.style.trim()) chParts.push(`- Văn phong/nhịp điệu chương: ${chapterOutline.style.trim()}`);
  if (chapterOutline.characters.trim()) chParts.push(`- Nhân vật xuất hiện: ${chapterOutline.characters.trim()}`);
  if (Array.isArray(chapterOutline.scenes) && chapterOutline.scenes.length > 0) {
    const scenesBlock = chapterOutline.scenes
      .map(
        (sc, idx) =>
          `  ${idx + 1}. ${sc.title || `Cảnh ${idx + 1}`}${sc.summary?.trim() ? `: ${sc.summary.trim()}` : ''}`
      )
      .join('\n');
    chParts.push(`- Danh sách từng cảnh theo thứ tự:\n${scenesBlock}`);
  } else if (chapterOutline.roughEvents.trim()) {
    chParts.push(`- Sự kiện thô / diễn biến:\n${chapterOutline.roughEvents.trim()}`);
  }
  if (chapterOutline.logicNotes.trim()) chParts.push(`- Móc nối logic & mục tiêu: ${chapterOutline.logicNotes.trim()}`);
  if (chParts.length > 0) {
    parts.push(`\n[DÀN Ý CHƯƠNG NÀY]\n${chParts.join('\n')}`);
  }

  return parts.join('\n');
}

export const DraftingView: React.FC<DraftingViewProps> = ({
  user,
  project,
  chapter,
  nodes,
  outline,
  prefs,
  locked = false,
  onPublishToManuscript,
  onOpenOutline,
  onOpenAuth,
  onNotify,
}) => {
  const chapterId = chapter?.id || null;
  const [draftStore, setDraftStore] = useState<ChapterDraftStore>({
    activeVersionId: null,
    versions: [],
  });
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showOutlinePreview, setShowOutlinePreview] = useState(true);

  const activeChapterIdRef = useRef<string | null>(chapterId);
  activeChapterIdRef.current = chapterId;
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Load saved versions for current chapter (resuming at latest version automatically)
  useEffect(() => {
    if (!chapterId) {
      setDraftStore({ activeVersionId: null, versions: [] });
      return;
    }
    const loaded = webStorage.getChapterDraftVersions(chapterId);
    // Always default to latest version when returning to a chapter so unfinished work resumes seamlessly
    const latestId =
      loaded.versions.length > 0 ? loaded.versions[loaded.versions.length - 1].id : null;
    setDraftStore({
      versions: loaded.versions,
      activeVersionId: latestId,
    });
    setAiPrompt('');
  }, [chapterId]);

  const persistStore = (targetChapterId: string, next: ChapterDraftStore) => {
    webStorage.saveChapterDraftVersions(targetChapterId, next);
    if (activeChapterIdRef.current === targetChapterId) {
      setDraftStore(next);
    }
  };

  const activeVersion = useMemo(
    () => draftStore.versions.find((v) => v.id === draftStore.activeVersionId) || null,
    [draftStore]
  );

  // Auto-grow draft textarea so text never overflows outside the paper sheet
  useEffect(() => {
    const el = draftTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(460, el.scrollHeight)}px`;
  }, [activeVersion?.id, activeVersion?.content, prefs.fontSize, prefs.lineHeight, prefs.pageWidth]);

  const nextVersionNumber = useMemo(() => {
    if (draftStore.versions.length === 0) return 1;
    return Math.max(...draftStore.versions.map((v) => v.versionNumber)) + 1;
  }, [draftStore.versions]);

  const chapterOutline: ChapterOutline = useMemo(
    () => ({
      ...EMPTY_CHAPTER_OUTLINE,
      ...(chapterId ? outline.chapters[chapterId] || {} : {}),
    }),
    [chapterId, outline.chapters]
  );

  const hasOutline = Boolean(
    chapterOutline.setting.trim() ||
      chapterOutline.style.trim() ||
      chapterOutline.characters.trim() ||
      (Array.isArray(chapterOutline.scenes) && chapterOutline.scenes.length > 0) ||
      chapterOutline.roughEvents.trim() ||
      chapterOutline.logicNotes.trim() ||
      outline.worldSetting.trim() ||
      outline.storyFramework.trim()
  );

  // Create manual Version 1 (empty or seeded from current manuscript)
  const handleCreateManualVersion = (seedFromManuscript: boolean) => {
    if (!chapter) return;
    const now = Date.now();
    const newVersion: ChapterDraftVersion = {
      id: `v-${now}-${Math.random().toString(36).slice(2, 6)}`,
      versionNumber: nextVersionNumber,
      label: seedFromManuscript
        ? `Version ${nextVersionNumber} — Lấy từ bản chính`
        : `Version ${nextVersionNumber} — Tự viết`,
      source: 'user',
      content: seedFromManuscript ? chapter.content || '' : activeVersion?.content || '',
      createdAt: now,
      updatedAt: now,
    };
    const nextStore: ChapterDraftStore = {
      activeVersionId: newVersion.id,
      versions: [...draftStore.versions, newVersion],
    };
    persistStore(chapter.id, nextStore);
    onNotify(`Đã tạo ${newVersion.label}.`);
  };

  // Auto-save edits directly to the currently opened version
  const handleEditActiveVersion = (nextContent: string) => {
    if (!chapter || !activeVersion || locked) return;
    const now = Date.now();
    const nextStore: ChapterDraftStore = {
      activeVersionId: activeVersion.id,
      versions: draftStore.versions.map((v) =>
        v.id === activeVersion.id ? { ...v, content: nextContent, updatedAt: now } : v
      ),
    };
    persistStore(chapter.id, nextStore);
  };

  // Ask AI to write Version 1 (from outline) OR rewrite current draft -> Version N+1
  const handleAIGenerateOrRewrite = async (mode: 'generate_v1' | 'rewrite') => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!project || !chapter || generating || locked) return;

    const targetChapterId = chapter.id;
    const baseVersion = activeVersion;
    const instruction = aiPrompt.trim();

    if (mode === 'rewrite' && !instruction) {
      onNotify('Hãy nhập phần bạn chưa hài lòng hoặc yêu cầu chỉnh sửa cho AI.');
      return;
    }

    setGenerating(true);
    try {
      const outlineBlock = buildOutlineContextBlock(project, chapter, outline, chapterOutline);
      let promptText = '';

      if (mode === 'generate_v1') {
        promptText =
          `${outlineBlock}\n\n` +
          `YÊU CẦU: Hãy dựa vào dàn ý và hồ sơ thế giới ở trên để viết bản nháp hoàn chỉnh (Version ${nextVersionNumber}) cho chương này.` +
          `${instruction ? `\nYêu cầu bổ sung của tác giả: ${instruction}` : ''}` +
          `\nHãy viết thẳng nội dung truyện hoàn chỉnh bằng tiếng Việt mượt mà, không thêm lời bình luận mở đầu hay kết thúc.`;
      } else {
        promptText =
          `${outlineBlock}\n\n` +
          `[BẢN NHÁP HIỆN TẠI — Version ${baseVersion?.versionNumber || 1}]\n"""\n${(baseVersion?.content || '').slice(0, 12000)}\n"""\n\n` +
          `YÊU CẦU VIẾT LẠI TỪ TÁC GIẢ: ${instruction}\n` +
          `Hãy viết lại toàn bộ bản nháp thành phiên bản mới hoàn chỉnh (giữ nguyên các đoạn đã ổn và sửa sâu những chỗ tác giả yêu cầu), trả thẳng nội dung chương truyện không rào đón.`;
      }

      const res = await webApi.chatWithAI({
        mode: mode === 'generate_v1' ? 'web_draft_write' : 'web_draft_rewrite',
        messages: [{ role: 'user', content: promptText }],
        projectContext: {
          projectId: project.isLocalOnly ? undefined : project.id,
          projectTitle: project.title,
          chapterNumber: chapter.chapterNumber,
          chapterTitle: chapter.title,
          chapterDesc: chapter.desc,
          nodes: nodes.slice(0, 60),
        },
      });

      const generatedText = (res.data?.message || '').trim();
      if (!generatedText) {
        onNotify('AI chưa trả về nội dung bản nháp. Vui lòng thử lại.');
        return;
      }

      const latestStore = webStorage.getChapterDraftVersions(targetChapterId);
      const nextNum =
        latestStore.versions.length > 0
          ? Math.max(...latestStore.versions.map((v) => v.versionNumber)) + 1
          : 1;
      const now = Date.now();
      const created: ChapterDraftVersion = {
        id: `v-${now}-${Math.random().toString(36).slice(2, 6)}`,
        versionNumber: nextNum,
        label:
          mode === 'generate_v1'
            ? `Version ${nextNum} — AI khởi tạo`
            : `Version ${nextNum} — AI viết lại`,
        source: mode === 'generate_v1' ? 'ai' : 'ai-rewrite',
        instruction: instruction || undefined,
        content: generatedText,
        createdAt: now,
        updatedAt: now,
      };
      const nextStore: ChapterDraftStore = {
        activeVersionId: created.id,
        versions: [...latestStore.versions, created],
      };
      persistStore(targetChapterId, nextStore);
      if (activeChapterIdRef.current === targetChapterId) {
        setAiPrompt('');
      }
      onNotify(`Đã tạo ${created.label} (${countWords(generatedText).toLocaleString('vi-VN')} từ).`);
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Không thể gọi AI viết nháp lúc này.');
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteVersion = (versionId: string) => {
    if (!chapter || locked) return;
    const remaining = draftStore.versions.filter((v) => v.id !== versionId);
    const nextActive =
      draftStore.activeVersionId === versionId
        ? remaining.length > 0
          ? remaining[remaining.length - 1].id
          : null
        : draftStore.activeVersionId;
    persistStore(chapter.id, { activeVersionId: nextActive, versions: remaining });
    onNotify('Đã xóa phiên bản nháp.');
  };

  const handlePublish = async () => {
    if (!chapter || !activeVersion || publishing || locked) return;
    if (!activeVersion.content.trim()) {
      onNotify('Bản nháp đang trống, chưa có nội dung để lưu vào bản chính.');
      return;
    }
    if (
      chapter.content.trim().length > 0 &&
      !window.confirm(
        `Ghi đè nội dung Bản chính của "${chapter.title || `Chương ${chapter.chapterNumber}`}" bằng Version ${activeVersion.versionNumber}?`
      )
    ) {
      return;
    }
    setPublishing(true);
    try {
      await onPublishToManuscript(activeVersion.content, chapter.id);
    } finally {
      setPublishing(false);
    }
  };

  if (!project || !chapter) {
    return (
      <div className="editor-scroll-area">
        <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
          Chưa có chương nào được chọn để viết nháp.
        </div>
      </div>
    );
  }

  const sourceBadge = (src: ChapterDraftVersion['source']) => {
    if (src === 'ai') return 'AI';
    if (src === 'ai-rewrite') return 'AI sửa';
    return 'Tự sửa';
  };

  return (
    <div className="editor-scroll-area">
      <div className={`draft-workspace width-${prefs.pageWidth}`}>
        {/* TOP HEADER & OUTLINE SUMMARY */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Phòng viết nháp · {chapter.title || `Chương ${chapter.chapterNumber}`}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                Tự động lưu phiên bản mới nhất khi bạn dừng giữa chừng. Khi hài lòng, bấm “Lưu vào bản chính”.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="icon-btn bordered"
                onClick={() => setShowOutlinePreview((v) => !v)}
              >
                {showOutlinePreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <span>Dàn ý chương</span>
              </button>
              <button type="button" className="icon-btn bordered" onClick={onOpenOutline}>
                <Compass size={14} /> Sửa dàn ý
              </button>
            </div>
          </div>

          {showOutlinePreview && (
            <div className="draft-outline-preview">
              {hasOutline ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {chapterOutline.setting && (
                    <div><strong>Bối cảnh:</strong> {chapterOutline.setting}</div>
                  )}
                  {chapterOutline.style && (
                    <div><strong>Văn phong:</strong> {chapterOutline.style}</div>
                  )}
                  {chapterOutline.characters && (
                    <div><strong>Nhân vật:</strong> {chapterOutline.characters}</div>
                  )}
                  {Array.isArray(chapterOutline.scenes) && chapterOutline.scenes.length > 0 ? (
                    <div>
                      <strong>Các cảnh ({chapterOutline.scenes.length}):</strong>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 3, paddingLeft: 8 }}>
                        {chapterOutline.scenes.map((sc, i) => (
                          <div key={sc.id}>
                            {i + 1}. <strong>{sc.title || `Cảnh ${i + 1}`}</strong>
                            {sc.summary ? ` — ${sc.summary}` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    chapterOutline.roughEvents && (
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        <strong>Sự kiện thô:</strong> {chapterOutline.roughEvents}
                      </div>
                    )
                  )}
                  {chapterOutline.logicNotes && (
                    <div><strong>Logic:</strong> {chapterOutline.logicNotes}</div>
                  )}
                  {!chapterOutline.setting &&
                    !chapterOutline.roughEvents &&
                    outline.storyFramework && (
                      <div><strong>Khung truyện:</strong> {outline.storyFramework}</div>
                    )}
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  Chưa có dàn ý cho chương này. Bạn có thể bấm “Sửa dàn ý” để điền bối cảnh, văn phong và sự kiện thô trước khi nhờ AI viết Version 1.
                </div>
              )}
            </div>
          )}
        </div>

        {/* VERSION HISTORY BAR */}
        <div className="draft-version-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
              <History size={13} /> Phiên bản:
            </span>
            {draftStore.versions.map((ver) => {
              const isSelected = ver.id === activeVersion?.id;
              return (
                <div key={ver.id} className={`version-pill ${isSelected ? 'active' : ''}`}>
                  <button
                    type="button"
                    className="version-pill-btn"
                    onClick={() =>
                      persistStore(chapter.id, { ...draftStore, activeVersionId: ver.id })
                    }
                  >
                    <strong>v{ver.versionNumber}</strong>
                    <span className="version-source-tag">{sourceBadge(ver.source)}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {countWords(ver.content)} từ · {formatTime(ver.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="version-del-btn"
                    title={`Xóa Version ${ver.versionNumber}`}
                    disabled={locked || generating}
                    onClick={() => {
                      if (window.confirm(`Xóa Version ${ver.versionNumber}?`)) {
                        handleDeleteVersion(ver.id);
                      }
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
            {draftStore.versions.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Chưa có bản nháp nào
              </span>
            )}
          </div>

          {activeVersion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                className="icon-btn bordered"
                disabled={locked || generating}
                title="Lưu bản chỉnh sửa hiện tại thành một phiên bản mới"
                onClick={() => handleCreateManualVersion(false)}
              >
                <GitBranch size={13} /> Chốt thành v{nextVersionNumber}
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={locked || generating || publishing}
                onClick={() => void handlePublish()}
              >
                {publishing ? (
                  <>
                    <Loader2 size={14} className="spin" /> Đang lưu...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Lưu vào bản chính
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* AI GENERATE V1 / AI REWRITE -> VN+1 BAR */}
        <div className="card" style={{ marginBottom: 14 }}>
          {!activeVersion ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                Bắt đầu Version 1 cho {chapter.title || `Chương ${chapter.chapterNumber}`}
              </div>
              <textarea
                className="outline-textarea"
                rows={2}
                value={aiPrompt}
                disabled={generating || locked}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ghi chú thêm cho AI (tùy chọn) — VD: Viết khoảng 1000 từ, mở đầu bằng cảnh đối thoại căng thẳng..."
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={generating || locked}
                  onClick={() => void handleAIGenerateOrRewrite('generate_v1')}
                >
                  {generating ? (
                    <>
                      <Loader2 size={14} className="spin" /> AI đang viết Version 1...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> Nhờ AI viết nháp (Version 1)
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="icon-btn bordered"
                  disabled={generating || locked}
                  onClick={() => handleCreateManualVersion(false)}
                >
                  <PenLine size={13} /> Tự viết Version 1
                </button>
                {chapter.content.trim().length > 0 && (
                  <button
                    type="button"
                    className="icon-btn bordered"
                    disabled={generating || locked}
                    onClick={() => handleCreateManualVersion(true)}
                  >
                    Lấy từ bản chính làm Version 1
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form
              style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
              onSubmit={(e) => {
                e.preventDefault();
                void handleAIGenerateOrRewrite('rewrite');
              }}
            >
              <input
                className="text-input"
                style={{ flex: 1, minWidth: 220 }}
                value={aiPrompt}
                disabled={generating || locked}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={`Chưa hài lòng chỗ nào ở v${activeVersion.versionNumber}? Nhập yêu cầu để AI viết lại thành v${nextVersionNumber}...`}
              />
              <button
                type="submit"
                className="primary-btn"
                disabled={generating || locked || !aiPrompt.trim()}
              >
                {generating ? (
                  <>
                    <Loader2 size={14} className="spin" /> Đang viết lại...
                  </>
                ) : (
                  <>
                    <Send size={13} /> AI viết lại → v{nextVersionNumber}
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* DRAFT PAPER EDITOR */}
        {activeVersion && (
          <article
            className={`paper-sheet width-${prefs.pageWidth}${
              prefs.paperStyle !== 'auto' ? ` paper-${prefs.paperStyle}` : ''
            }`}
            style={{ maxWidth: '100%', minHeight: 460 }}
          >
            <div className="chapter-eyebrow">
              <span>
                {activeVersion.label} · {countWords(activeVersion.content).toLocaleString('vi-VN')} từ
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>
                Tự động lưu nháp lúc {formatTime(activeVersion.updatedAt)}
              </span>
            </div>

            {activeVersion.instruction && (
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  marginBottom: 12,
                }}
              >
                <strong>Yêu cầu phiên bản này:</strong> {activeVersion.instruction}
              </div>
            )}

            <textarea
              ref={draftTextareaRef}
              className={`manuscript-textarea font-${prefs.font}`}
              style={{
                fontSize: `${prefs.fontSize}px`,
                lineHeight: prefs.lineHeight,
                opacity: generating ? 0.65 : 1,
              }}
              readOnly={locked || generating}
              value={activeVersion.content}
              onChange={(e) => handleEditActiveVersion(e.target.value)}
              placeholder="Chỉnh sửa trực tiếp bản nháp tại đây. Mọi thay đổi đều tự động lưu vào phiên bản hiện tại..."
              spellCheck
            />
          </article>
        )}
      </div>
    </div>
  );
};
