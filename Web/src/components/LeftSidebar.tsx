import React, { useState } from 'react';
import {
  BookOpen,
  Download,
  Feather,
  LogIn,
  LogOut,
  Plus,
  Target,
  Trash2,
} from 'lucide-react';
import type { AuthUser, DailyGoalState, StoryChapter, StoryProject } from '../types/story';
import { getTodayKey } from '../services/storage';
import { countWords, exportFullProject, exportSingleChapter } from '../utils/text';

interface LeftSidebarProps {
  user: AuthUser | null;
  projects: StoryProject[];
  activeProject: StoryProject | null;
  chapters: StoryChapter[];
  activeChapterId: string | null;
  dailyGoal: DailyGoalState;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (title: string) => Promise<void>;
  onSelectChapter: (chapterId: string) => void;
  onCreateChapter: () => Promise<void>;
  onDeleteChapter: (chapterId: string) => Promise<void>;
  onUpdateGoalTarget: (targetWords: number) => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  user,
  projects,
  activeProject,
  chapters,
  activeChapterId,
  dailyGoal,
  onSelectProject,
  onCreateProject,
  onSelectChapter,
  onCreateChapter,
  onDeleteChapter,
  onUpdateGoalTarget,
  onOpenAuth,
  onLogout,
}) => {
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(dailyGoal.targetWords));
  const [showExportMenu, setShowExportMenu] = useState(false);

  const todayWords = dailyGoal.history[getTodayKey()] || 0;
  const goalPct = Math.min(100, Math.round((todayWords / Math.max(1, dailyGoal.targetWords)) * 100));
  const activeChapter = chapters.find((c) => c.id === activeChapterId) || null;
  const totalProjectWords = chapters.reduce((acc, ch) => acc + countWords(ch.content || ''), 0);

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProjectTitle.trim();
    if (!trimmed) return;
    await onCreateProject(trimmed);
    setNewProjectTitle('');
    setCreatingProject(false);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Math.max(50, Math.min(50000, Number(goalInput) || 1000));
    onUpdateGoalTarget(parsed);
    setEditingGoal(false);
  };

  return (
    <aside className="sidebar-left">
      <div className="sidebar-section">
        <div className="brand-row">
          <div className="brand-title">
            <Feather size={17} color="var(--accent)" />
            <span style={{ fontFamily: "'Playfair Display', 'Lora', serif", fontSize: 16 }}>
              Tơ Lòng
            </span>
          </div>
          <span className="brand-badge">{user ? 'Đã đồng bộ App' : 'Ngoại tuyến'}</span>
        </div>

        <div className="project-select-row">
          <select
            className="select-input"
            value={activeProject?.id || ''}
            onChange={(e) => onSelectProject(e.target.value)}
            aria-label="Chọn dự án truyện"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button
            className="icon-btn bordered"
            title="Tạo dự án mới"
            onClick={() => setCreatingProject((v) => !v)}
          >
            <Plus size={15} />
          </button>
        </div>

        {creatingProject && (
          <form onSubmit={handleAddProject} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              className="text-input"
              style={{ height: 32, fontSize: 12.5 }}
              placeholder="Tên truyện mới..."
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              autoFocus
            />
            <button className="primary-btn" type="submit" style={{ height: 32, padding: '0 10px' }}>
              Tạo
            </button>
          </form>
        )}
      </div>

      {/* Daily Writing Goal */}
      <div className="sidebar-section">
        <div className="goal-card">
          <div className="goal-header">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <Target size={13} color="var(--accent)" />
              Mục tiêu hôm nay
            </span>
            <button
              className="icon-btn"
              style={{ height: 22, padding: '0 6px', fontSize: 11.5 }}
              onClick={() => {
                setGoalInput(String(dailyGoal.targetWords));
                setEditingGoal((v) => !v);
              }}
            >
              {editingGoal ? 'Đóng' : 'Đặt mục tiêu'}
            </button>
          </div>

          {editingGoal ? (
            <form onSubmit={handleSaveGoal} style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input
                className="text-input"
                type="number"
                min={50}
                max={50000}
                step={50}
                style={{ height: 30, fontSize: 12 }}
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
              />
              <button className="primary-btn" type="submit" style={{ height: 30, fontSize: 12 }}>
                Lưu
              </button>
            </form>
          ) : (
            <>
              <div className="goal-bar-track">
                <div
                  className={`goal-bar-fill ${goalPct >= 100 ? 'done' : ''}`}
                  style={{ width: `${goalPct}%` }}
                />
              </div>
              <div className="goal-meta">
                <span>
                  <strong>{todayWords.toLocaleString('vi-VN')}</strong> /{' '}
                  {dailyGoal.targetWords.toLocaleString('vi-VN')} từ
                </span>
                <span>{goalPct >= 100 ? 'Hoàn thành!' : `${goalPct}%`}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chapters List */}
      <div className="chapter-list-header">
        <span>
          Chương ({chapters.length}) · {totalProjectWords.toLocaleString('vi-VN')} từ
        </span>
        <button
          className="icon-btn"
          style={{ height: 24, padding: '0 6px', fontSize: 12 }}
          onClick={onCreateChapter}
          title="Thêm chương mới"
        >
          <Plus size={13} /> Mới
        </button>
      </div>

      <div className="chapter-list">
        {chapters.map((ch) => {
          const words = countWords(ch.content || '');
          const isActive = ch.id === activeChapterId;
          return (
            <div
              key={ch.id}
              className={`chapter-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectChapter(ch.id)}
            >
              <div className="chapter-item-main">
                <div className="chapter-item-title">{ch.title || `Chương ${ch.chapterNumber}`}</div>
                <div className="chapter-item-meta">
                  <span>{words.toLocaleString('vi-VN')} từ</span>
                  {ch.dirty && <span className="dirty-dot" title="Có thay đổi chưa đồng bộ lên máy chủ" />}
                </div>
              </div>
              {chapters.length > 1 && (
                <button
                  className="chapter-delete-btn"
                  title="Xóa chương"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Xóa "${ch.title || `Chương ${ch.chapterNumber}`}"?`)) {
                      void onDeleteChapter(ch.id);
                    }
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: Export & Account */}
      <div className="sidebar-footer">
        <div style={{ position: 'relative' }}>
          <button
            className="icon-btn bordered"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setShowExportMenu((v) => !v)}
          >
            <Download size={14} />
            <span>Xuất bản thảo (.md / .txt)</span>
          </button>

          {showExportMenu && activeProject && (
            <div
              className="card"
              style={{
                position: 'absolute',
                bottom: 38,
                left: 0,
                right: 0,
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                boxShadow: 'var(--shadow-modal)',
              }}
            >
              {activeChapter && (
                <>
                  <button
                    className="icon-btn"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => {
                      exportSingleChapter(activeProject.title, activeChapter, 'md');
                      setShowExportMenu(false);
                    }}
                  >
                    <BookOpen size={13} /> Chương hiện tại (.md)
                  </button>
                  <button
                    className="icon-btn"
                    style={{ justifyContent: 'flex-start' }}
                    onClick={() => {
                      exportSingleChapter(activeProject.title, activeChapter, 'txt');
                      setShowExportMenu(false);
                    }}
                  >
                    <BookOpen size={13} /> Chương hiện tại (.txt)
                  </button>
                </>
              )}
              <button
                className="icon-btn"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => {
                  exportFullProject(activeProject, chapters, 'md');
                  setShowExportMenu(false);
                }}
              >
                <Download size={13} /> Toàn bộ truyện (.md)
              </button>
              <button
                className="icon-btn"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => {
                  exportFullProject(activeProject, chapters, 'txt');
                  setShowExportMenu(false);
                }}
              >
                <Download size={13} /> Toàn bộ truyện (.txt)
              </button>
            </div>
          )}
        </div>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.penName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
              </div>
            </div>
            <button className="icon-btn" title="Đăng xuất" onClick={onLogout}>
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            className="primary-btn"
            style={{ width: '100%' }}
            onClick={onOpenAuth}
          >
            <LogIn size={14} />
            <span>Đăng nhập / Đăng ký</span>
          </button>
        )}
      </div>
    </aside>
  );
};
