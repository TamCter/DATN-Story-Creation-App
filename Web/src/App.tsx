import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudOff,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  Sun,
} from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { LeftSidebar } from './components/LeftSidebar';
import { RightAssistantPanel } from './components/RightAssistantPanel';
import { ApiError, webApi } from './services/api';
import { webStorage } from './services/storage';
import type {
  AuthUser,
  DailyGoalState,
  EditorFont,
  EditorPreferences,
  EditorTheme,
  PageWidthMode,
  StoryChapter,
  StoryLink,
  StoryNode,
  StoryProject,
} from './types/story';
import { countParagraphs, countWords, estimateReadingMinutes } from './utils/text';

type SaveStatus = 'saved' | 'saving' | 'local' | 'error';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<StoryNode[]>([]);
  const [links, setLinks] = useState<StoryLink[]>([]);

  const [prefs, setPrefs] = useState<EditorPreferences>(() => webStorage.getPrefs());
  const [dailyGoal, setDailyGoal] = useState<DailyGoalState>(() => webStorage.getDailyGoal());
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [showDescBox, setShowDescBox] = useState(false);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [toast, setToast] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastWordCountRef = useRef<number>(0);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // Apply theme attribute to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.theme);
    webStorage.savePrefs(prefs);
  }, [prefs]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) || null,
    [chapters, activeChapterId]
  );

  // Keep baseline word count synced when switching chapters
  useEffect(() => {
    lastWordCountRef.current = countWords(activeChapter?.content || '');
  }, [activeChapterId]);

  const loadLocalWorkspace = useCallback(() => {
    const localProjects = webStorage.getLocalProjects();
    setProjects(localProjects);
    const { projectId, chapterId } = webStorage.getLastSelection();
    const chosenProj = localProjects.find((p) => p.id === projectId) || localProjects[0] || null;
    setActiveProjectId(chosenProj?.id || null);
    if (chosenProj) {
      const localChapters = webStorage.getLocalChapters(chosenProj.id);
      setChapters(localChapters);
      const chosenCh = localChapters.find((c) => c.id === chapterId) || localChapters[0] || null;
      setActiveChapterId(chosenCh?.id || null);
    } else {
      setChapters([]);
      setActiveChapterId(null);
    }
    setNodes([]);
    setLinks([]);
    setSaveStatus('local');
  }, []);

  const loadProjectData = useCallback(
    async (project: StoryProject, isLoggedIn: boolean) => {
      if (!isLoggedIn || project.isLocalOnly) {
        const localChs = webStorage.getLocalChapters(project.id);
        setChapters(localChs);
        const { chapterId } = webStorage.getLastSelection();
        const chosen = localChs.find((c) => c.id === chapterId) || localChs[0] || null;
        setActiveChapterId(chosen?.id || null);
        setNodes([]);
        setLinks([]);
        setSaveStatus('local');
        return;
      }

      try {
        const [chRes, graphRes] = await Promise.all([
          webApi.getChapters(project.id),
          webApi.getProjectGraph(project.id).catch(() => null),
        ]);

        let loadedChapters: StoryChapter[] = (chRes.data || []).map((c) => {
          const draft = webStorage.getChapterDraft(c.id);
          if (draft && draft.dirty && draft.updatedAt >= (c.updatedAt || 0)) {
            return {
              ...c,
              title: draft.title,
              desc: draft.desc,
              content: draft.content,
              dirty: true,
            };
          }
          return { ...c, content: c.content || '', dirty: false };
        });

        if (loadedChapters.length === 0) {
          const created = await webApi.createChapter(project.id, {
            chapterNumber: 1,
            title: 'Chương 1',
            content: '',
          });
          if (created.data) {
            loadedChapters = [{ ...created.data, content: created.data.content || '', dirty: false }];
          }
        }

        loadedChapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
        setChapters(loadedChapters);
        const { chapterId } = webStorage.getLastSelection();
        const chosen = loadedChapters.find((c) => c.id === chapterId) || loadedChapters[0] || null;
        setActiveChapterId(chosen?.id || null);

        setNodes(graphRes?.data?.nodes || []);
        setLinks(graphRes?.data?.links || []);
        setSaveStatus(chosen?.dirty ? 'local' : 'saved');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu dự án.';
        notify(msg);
        setSaveStatus('local');
      }
    },
    [notify]
  );

  const loadRemoteWorkspace = useCallback(
    async (authedUser: AuthUser) => {
      try {
        const res = await webApi.getProjects();
        let list = res.data || [];
        if (list.length === 0) {
          const created = await webApi.createProject({
            title: 'Truyện mới của ' + authedUser.penName,
            genre: 'Tự do',
          });
          if (created.data) list = [created.data];
        }
        setProjects(list);
        const { projectId } = webStorage.getLastSelection();
        const chosenProj = list.find((p) => p.id === projectId) || list[0] || null;
        setActiveProjectId(chosenProj?.id || null);
        if (chosenProj) {
          await loadProjectData(chosenProj, true);
        }
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          webApi.setToken(null);
          webStorage.setAuth(null, null);
          setUser(null);
          loadLocalWorkspace();
          notify('Phiên đăng nhập đã hết hạn. Đang chuyển về chế độ cục bộ.');
          return;
        }
        loadLocalWorkspace();
        notify('Không thể kết nối máy chủ. Đang mở bản thảo cục bộ.');
      }
    },
    [loadLocalWorkspace, loadProjectData, notify]
  );

  // Bootstrap on mount
  useEffect(() => {
    const { token, user: cachedUser } = webStorage.getAuth();
    if (token && cachedUser) {
      webApi.setToken(token);
      setUser(cachedUser);
      void loadRemoteWorkspace(cachedUser);
    } else {
      loadLocalWorkspace();
    }
  }, [loadLocalWorkspace, loadRemoteWorkspace]);

  // Persist last selection
  useEffect(() => {
    webStorage.saveLastSelection(activeProjectId, activeChapterId);
  }, [activeProjectId, activeChapterId]);

  // Sync a single chapter to backend
  const syncChapterToServer = useCallback(
    async (chapter: StoryChapter) => {
      if (!user || chapter.isLocalOnly) {
        setSaveStatus('local');
        return;
      }
      setSaveStatus('saving');
      try {
        await webApi.updateChapter(chapter.id, {
          title: chapter.title,
          desc: chapter.desc || '',
          content: chapter.content || '',
        });
        webStorage.clearChapterDraft(chapter.id);
        setChapters((prev) =>
          prev.map((c) => (c.id === chapter.id ? { ...c, dirty: false, updatedAt: Date.now() } : c))
        );
        setSaveStatus('saved');
      } catch {
        webStorage.saveChapterDraft(chapter.id, {
          title: chapter.title,
          desc: chapter.desc || '',
          content: chapter.content || '',
          updatedAt: Date.now(),
          dirty: true,
        });
        setSaveStatus('local');
      }
    },
    [user]
  );

  // Edit chapter fields (immediate local persistence + debounced server sync)
  const updateActiveChapter = useCallback(
    (patch: Partial<Pick<StoryChapter, 'title' | 'desc' | 'content'>>) => {
      if (!activeChapter || !activeProject) return;

      const nextChapter: StoryChapter = {
        ...activeChapter,
        ...patch,
        updatedAt: Date.now(),
        dirty: Boolean(user && !activeChapter.isLocalOnly),
      };

      // Update daily words written if content grew
      if (patch.content !== undefined) {
        const nextWords = countWords(patch.content);
        const delta = nextWords - lastWordCountRef.current;
        lastWordCountRef.current = nextWords;
        if (delta > 0) {
          setDailyGoal(webStorage.addWordsWrittenToday(delta));
        }
      }

      setChapters((prev) => {
        const nextList = prev.map((c) => (c.id === nextChapter.id ? nextChapter : c));
        if (!user || activeProject.isLocalOnly) {
          webStorage.saveLocalChapters(activeProject.id, nextList);
        }
        return nextList;
      });

      if (!user || activeProject.isLocalOnly) {
        setSaveStatus('local');
        return;
      }

      // Save local draft immediately so zero keystrokes are ever lost
      webStorage.saveChapterDraft(nextChapter.id, {
        title: nextChapter.title,
        desc: nextChapter.desc || '',
        content: nextChapter.content || '',
        updatedAt: Date.now(),
        dirty: true,
      });

      setSaveStatus('saving');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void syncChapterToServer(nextChapter);
      }, 1100);
    },
    [activeChapter, activeProject, syncChapterToServer, user]
  );

  // Keyboard shortcuts: Ctrl+S, Ctrl+Shift+F, Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeChapter) {
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          void syncChapterToServer(activeChapter);
          notify(user && !activeChapter.isLocalOnly ? 'Đã lưu lên máy chủ.' : 'Đã lưu bản thảo cục bộ.');
        }
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFocusMode((v) => !v);
      } else if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeChapter, focusMode, notify, syncChapterToServer, user]);

  // Project & Chapter actions
  const handleSelectProject = async (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    setActiveProjectId(proj.id);
    await loadProjectData(proj, Boolean(user));
  };

  const handleCreateProject = async (title: string) => {
    if (user) {
      try {
        const res = await webApi.createProject({ title, genre: 'Tự do' });
        if (res.data) {
          const nextProjects = [res.data, ...projects];
          setProjects(nextProjects);
          setActiveProjectId(res.data.id);
          await loadProjectData(res.data, true);
          notify(`Đã tạo dự án "${title}"`);
          return;
        }
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : 'Không thể tạo dự án trên máy chủ.');
        return;
      }
    }

    const localProj: StoryProject = {
      id: `local-proj-${Date.now()}`,
      title,
      genre: 'Tự do',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isLocalOnly: true,
    };
    const starterChapter: StoryChapter = {
      id: `local-ch-${Date.now()}`,
      projectId: localProj.id,
      chapterNumber: 1,
      code: 'C1',
      title: 'Chương 1',
      desc: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isLocalOnly: true,
    };
    const nextProjects = [localProj, ...projects];
    webStorage.saveLocalProjects(nextProjects);
    webStorage.saveLocalChapters(localProj.id, [starterChapter]);
    setProjects(nextProjects);
    setActiveProjectId(localProj.id);
    setChapters([starterChapter]);
    setActiveChapterId(starterChapter.id);
    notify(`Đã tạo bản thảo cục bộ "${title}"`);
  };

  const handleCreateChapter = async () => {
    if (!activeProject) return;
    const nextNum =
      chapters.length > 0 ? Math.max(...chapters.map((c) => c.chapterNumber || 0)) + 1 : 1;
    const defaultTitle = `Chương ${nextNum}`;

    if (user && !activeProject.isLocalOnly) {
      try {
        const res = await webApi.createChapter(activeProject.id, {
          chapterNumber: nextNum,
          title: defaultTitle,
          content: '',
        });
        if (res.data) {
          const created = { ...res.data, content: res.data.content || '', dirty: false };
          setChapters((prev) => [...prev, created]);
          setActiveChapterId(created.id);
          notify(`Đã thêm ${defaultTitle}`);
          return;
        }
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : 'Không thể tạo chương mới.');
        return;
      }
    }

    const localCh: StoryChapter = {
      id: `local-ch-${Date.now()}`,
      projectId: activeProject.id,
      chapterNumber: nextNum,
      code: `C${nextNum}`,
      title: defaultTitle,
      desc: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isLocalOnly: true,
    };
    const nextList = [...chapters, localCh];
    webStorage.saveLocalChapters(activeProject.id, nextList);
    setChapters(nextList);
    setActiveChapterId(localCh.id);
    notify(`Đã thêm ${defaultTitle}`);
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!activeProject) return;
    const target = chapters.find((c) => c.id === chapterId);
    if (!target) return;

    if (user && !target.isLocalOnly) {
      try {
        await webApi.deleteChapter(chapterId);
      } catch (err: unknown) {
        notify(err instanceof Error ? err.message : 'Không thể xóa chương trên máy chủ.');
        return;
      }
    }

    webStorage.clearChapterDraft(chapterId);
    const remaining = chapters.filter((c) => c.id !== chapterId);
    if (!user || activeProject.isLocalOnly) {
      webStorage.saveLocalChapters(activeProject.id, remaining);
    }
    setChapters(remaining);
    if (activeChapterId === chapterId) {
      setActiveChapterId(remaining[0]?.id || null);
    }
    notify('Đã xóa chương.');
  };

  const handleAuthenticated = (token: string, authedUser: AuthUser) => {
    webApi.setToken(token);
    webStorage.setAuth(token, authedUser);
    setUser(authedUser);
    notify(`Chào mừng ${authedUser.penName}! Đang đồng bộ dữ liệu...`);
    void loadRemoteWorkspace(authedUser);
  };

  const handleLogout = () => {
    webApi.setToken(null);
    webStorage.setAuth(null, null);
    setUser(null);
    loadLocalWorkspace();
    notify('Đã đăng xuất. Chuyển về chế độ lưu cục bộ.');
  };

  // Insert text at cursor position in manuscript textarea
  const handleInsertText = (textToInsert: string) => {
    if (!activeChapter) return;
    const el = textareaRef.current;
    const current = activeChapter.content || '';
    if (!el) {
      updateActiveChapter({ content: current + textToInsert });
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + textToInsert + current.slice(end);
    updateActiveChapter({ content: next });
    window.requestAnimationFrame(() => {
      el.focus();
      const pos = start + textToInsert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleReplaceQuote = (quote: string, replacement: string): boolean => {
    if (!activeChapter) return false;
    const current = activeChapter.content || '';
    if (!current.includes(quote)) return false;
    updateActiveChapter({ content: current.replace(quote, replacement) });
    return true;
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && prefs.tabIndent) {
      e.preventDefault();
      handleInsertText('    ');
    }
  };

  const words = countWords(activeChapter?.content || '');
  const chars = (activeChapter?.content || '').length;
  const paragraphs = countParagraphs(activeChapter?.content || '');
  const readMins = estimateReadingMinutes(words);

  const cycleTheme = () => {
    const order: EditorTheme[] = ['sepia', 'light', 'dark'];
    const next = order[(order.indexOf(prefs.theme) + 1) % order.length];
    setPrefs((p) => ({ ...p, theme: next }));
  };

  const cycleFont = () => {
    const order: EditorFont[] = ['serif', 'sans', 'mono'];
    const next = order[(order.indexOf(prefs.font) + 1) % order.length];
    setPrefs((p) => ({ ...p, font: next }));
  };

  const cycleWidth = () => {
    const order: PageWidthMode[] = ['narrow', 'medium', 'wide'];
    const next = order[(order.indexOf(prefs.pageWidth) + 1) % order.length];
    setPrefs((p) => ({ ...p, pageWidth: next }));
  };

  const themeLabel: Record<EditorTheme, string> = {
    sepia: 'Giấy vàng',
    light: 'Sáng',
    dark: 'Tối',
  };

  const fontLabel: Record<EditorFont, string> = {
    serif: 'Serif',
    sans: 'Sans',
    mono: 'Mono',
  };

  return (
    <div className="studio-shell">
      {!focusMode && showLeft && (
        <LeftSidebar
          user={user}
          projects={projects}
          activeProject={activeProject}
          chapters={chapters}
          activeChapterId={activeChapterId}
          dailyGoal={dailyGoal}
          onSelectProject={(id) => void handleSelectProject(id)}
          onCreateProject={handleCreateProject}
          onSelectChapter={setActiveChapterId}
          onCreateChapter={handleCreateChapter}
          onDeleteChapter={handleDeleteChapter}
          onUpdateGoalTarget={(targetWords) => {
            const next = { ...dailyGoal, targetWords };
            setDailyGoal(next);
            webStorage.saveDailyGoal(next);
          }}
          onOpenAuth={() => setAuthModalOpen(true)}
          onLogout={handleLogout}
        />
      )}

      {/* CENTER WRITING COLUMN */}
      <main className="editor-column">
        <header className="editor-topbar">
          <div className="topbar-group">
            {!focusMode && (
              <button
                className={`icon-btn ${showLeft ? 'active' : ''}`}
                title="Ẩn/hiện danh sách chương"
                onClick={() => setShowLeft((v) => !v)}
              >
                <PanelLeft size={16} />
              </button>
            )}

            <button
              className="icon-btn"
              title="Đổi giao diện (Giấy vàng / Sáng / Tối)"
              onClick={cycleTheme}
            >
              {prefs.theme === 'dark' ? (
                <Moon size={15} />
              ) : prefs.theme === 'light' ? (
                <Sun size={15} />
              ) : (
                <ScrollText size={15} />
              )}
              <span>{themeLabel[prefs.theme]}</span>
            </button>

            <button className="icon-btn" title="Đổi kiểu chữ" onClick={cycleFont}>
              <span>{fontLabel[prefs.font]}</span>
            </button>

            <div className="topbar-divider" />

            <button
              className="icon-btn"
              title="Giảm cỡ chữ"
              onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.max(14, p.fontSize - 1) }))}
            >
              <Minus size={13} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 26, textAlign: 'center' }}>
              {prefs.fontSize}
            </span>
            <button
              className="icon-btn"
              title="Tăng cỡ chữ"
              onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.min(26, p.fontSize + 1) }))}
            >
              <Plus size={13} />
            </button>

            <button
              className="icon-btn"
              title="Đổi độ rộng trang giấy"
              onClick={cycleWidth}
            >
              <span>
                {prefs.pageWidth === 'narrow' ? 'Hẹp' : prefs.pageWidth === 'medium' ? 'Vừa' : 'Rộng'}
              </span>
            </button>
          </div>

          <div className="topbar-group">
            <span
              className={`save-pill ${
                saveStatus === 'saved' ? 'saved' : saveStatus === 'local' ? 'offline' : ''
              }`}
              title="Trạng thái lưu bản thảo (Ctrl+S để lưu ngay)"
            >
              {saveStatus === 'saved' && (
                <>
                  <Check size={13} /> Đã lưu
                </>
              )}
              {saveStatus === 'saving' && (
                <>
                  <RefreshCw size={12} className="spin" /> Đang lưu...
                </>
              )}
              {saveStatus === 'local' && (
                <>
                  <CloudOff size={13} /> Nháp cục bộ
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <Cloud size={13} /> Lỗi lưu
                </>
              )}
            </span>

            {activeChapter && (
              <button
                className="icon-btn bordered"
                title="Lưu ngay (Ctrl+S)"
                onClick={() => {
                  if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
                  void syncChapterToServer(activeChapter);
                  notify(
                    user && !activeChapter.isLocalOnly
                      ? 'Đã đồng bộ lên máy chủ.'
                      : 'Đã lưu bản thảo cục bộ.'
                  );
                }}
              >
                <Save size={14} />
              </button>
            )}

            <button
              className={`icon-btn ${focusMode ? 'active' : ''}`}
              title="Chế độ tập trung (Ctrl+Shift+F)"
              onClick={() => setFocusMode((v) => !v)}
            >
              {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{focusMode ? 'Thoát Focus' : 'Focus'}</span>
            </button>

            {!focusMode && (
              <button
                className={`icon-btn ${showRight ? 'active' : ''}`}
                title="Ẩn/hiện Trợ lý AI & Thế giới"
                onClick={() => setShowRight((v) => !v)}
              >
                <PanelRight size={16} />
              </button>
            )}
          </div>
        </header>

        <div className="editor-scroll-area">
          {activeChapter ? (
            <article className={`paper-sheet width-${prefs.pageWidth}`}>
              <div className="chapter-eyebrow">
                <span>
                  {activeProject?.title} · Chương {activeChapter.chapterNumber}
                </span>
                <button
                  className="icon-btn"
                  style={{ height: 24, fontSize: 11.5 }}
                  onClick={() => setShowDescBox((v) => !v)}
                >
                  {showDescBox ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span>Ghi chú / Tóm tắt</span>
                </button>
              </div>

              <input
                className={`chapter-title-input font-${prefs.font}`}
                value={activeChapter.title}
                onChange={(e) => updateActiveChapter({ title: e.target.value })}
                placeholder="Nhập tiêu đề chương..."
              />

              {showDescBox && (
                <div className="chapter-desc-box">
                  <textarea
                    className="chapter-desc-input"
                    rows={2}
                    value={activeChapter.desc || ''}
                    onChange={(e) => updateActiveChapter({ desc: e.target.value })}
                    placeholder="Ghi chú nhanh dàn ý, mục tiêu hoặc tóm tắt chương này..."
                  />
                </div>
              )}

              <textarea
                ref={textareaRef}
                className={`manuscript-textarea font-${prefs.font}`}
                style={{
                  fontSize: `${prefs.fontSize}px`,
                  lineHeight: prefs.lineHeight,
                }}
                value={activeChapter.content || ''}
                onChange={(e) => updateActiveChapter({ content: e.target.value })}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Bắt đầu viết câu chuyện của bạn tại đây... (Nhấn Tab để thụt đầu dòng, Ctrl+S để lưu, Ctrl+Shift+F để bật chế độ tập trung)"
                spellCheck
              />
            </article>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>Chưa có chương nào được chọn.</p>
              <button className="primary-btn" onClick={() => void handleCreateChapter()}>
                Tạo chương đầu tiên
              </button>
            </div>
          )}
        </div>

        <footer className="editor-statusbar">
          <div className="statusbar-stats">
            <span>
              <strong>{words.toLocaleString('vi-VN')}</strong> từ
            </span>
            <span>{chars.toLocaleString('vi-VN')} ký tự</span>
            <span>{paragraphs} đoạn</span>
            <span>~{readMins} phút đọc</span>
          </div>
          <div>
            <span>Ctrl+S lưu · Ctrl+Shift+F tập trung</span>
          </div>
        </footer>
      </main>

      {!focusMode && showRight && (
        <RightAssistantPanel
          user={user}
          activeProject={activeProject}
          activeChapter={activeChapter}
          chapters={chapters}
          nodes={nodes}
          links={links}
          onInsertText={handleInsertText}
          onReplaceQuote={handleReplaceQuote}
          onOpenAuth={() => setAuthModalOpen(true)}
          onNotify={notify}
        />
      )}

      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
