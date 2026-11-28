import React, { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Compass,
  FileEdit,
  Layers,
  Plus,
  Sparkles,
} from 'lucide-react';
import { EMPTY_CHAPTER_OUTLINE } from '../services/storage';
import type {
  ChapterOutline,
  ProjectOutline,
  StoryChapter,
  StoryProject,
} from '../types/story';

interface OutlineViewProps {
  project: StoryProject | null;
  chapters: StoryChapter[];
  activeChapterId: string | null;
  outline: ProjectOutline;
  onUpdateProjectOutline: (patch: Partial<Omit<ProjectOutline, 'chapters'>>) => void;
  onUpdateChapterOutline: (chapterId: string, patch: Partial<ChapterOutline>) => void;
  onCreateChapter: () => Promise<void>;
  onOpenChapterDraft: (chapterId: string) => void;
  onOpenChapterManuscript: (chapterId: string) => void;
  locked?: boolean;
}

export const OutlineView: React.FC<OutlineViewProps> = ({
  project,
  chapters,
  activeChapterId,
  outline,
  onUpdateProjectOutline,
  onUpdateChapterOutline,
  onCreateChapter,
  onOpenChapterDraft,
  onOpenChapterManuscript,
  locked = false,
}) => {
  const [showMasterOutline, setShowMasterOutline] = useState(true);
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});

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
            const isCollapsed = Boolean(collapsedChapters[ch.id]);
            const isCurrent = ch.id === activeChapterId;
            const hasOutlineContent = Boolean(
              chOutline.setting.trim() ||
                chOutline.style.trim() ||
                chOutline.characters.trim() ||
                chOutline.roughEvents.trim() ||
                chOutline.logicNotes.trim()
            );

            return (
              <article
                key={ch.id}
                className={`outline-chapter-card ${isCurrent ? 'active' : ''}`}
              >
                <div className="outline-chapter-head">
                  <button
                    type="button"
                    className="outline-chapter-toggle"
                    onClick={() => toggleChapterCard(ch.id)}
                  >
                    {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    <span className="outline-chapter-badge">C{ch.chapterNumber}</span>
                    <strong style={{ fontSize: 14.5 }}>
                      {ch.title || `Chương ${ch.chapterNumber}`}
                    </strong>
                    {hasOutlineContent && (
                      <span className="brand-badge" style={{ marginLeft: 4 }}>
                        Đã lập khung
                      </span>
                    )}
                  </button>

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
                  <div className="outline-grid" style={{ paddingTop: 12 }}>
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

                    <div className="outline-field outline-field-full">
                      <label className="outline-label">Sự kiện thô / Diễn biến từng cảnh</label>
                      <textarea
                        className="outline-textarea"
                        rows={4}
                        readOnly={locked}
                        value={chOutline.roughEvents}
                        onChange={(e) =>
                          onUpdateChapterOutline(ch.id, { roughEvents: e.target.value })
                        }
                        placeholder="- Cảnh 1: ...\n- Cảnh 2: ...\n- Cao trào / Kết chương: ..."
                      />
                    </div>
                  </div>
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
