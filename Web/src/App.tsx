import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudOff,
  FileText,
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
  PaperStyle,
  StoryChapter,
  StoryLink,
  StoryNode,
  StoryProject,
} from './types/story';
import { countParagraphs, countWords, estimateReadingMinutes } from './utils/text';

type SaveStatus = 'saved' | 'saving' | 'local' | 'error';

const isNarrowViewport = () =>
  typeof window !== 'undefined' && window.innerWidth <= 820;

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [guestDismissedAuth, setGuestDismissedAuth] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [syncingFromApp, setSyncingFromApp] = useState(false);

  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<StoryNode[]>([]);
  const [links, setLinks] = useState<StoryLink[]>([]);

  const [prefs, setPrefs] = useState<EditorPreferences>(() => webStorage.getPrefs());
  const [dailyGoal, setDailyGoal] = useState<DailyGoalState>(() => webStorage.getDailyGoal());
  const [showLeft, setShowLeft] = useState<boolean>(() => !isNarrowViewport());
  const [showRight, setShowRight] = useState<boolean>(() => !isNarrowViewport());
  const [focusMode, setFocusMode] = useState(false);
  const [showDescBox, setShowDescBox] = useState(false);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [toast, setToast] = useState<string | null>(null);
  const [baselineSyncVersion, setBaselineSyncVersion] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const toastTimerRef = useRef<number | null>(null);
  const lastWordCountRef = useRef<number>(0);

  // Concurrency, session, and revision tracking refs
  const bootstrappedRef = useRef(false);
  const sessionGenRef = useRef(0);
  const projectLoadGenRef = useRef(0);
  const chapterEditRevRef = useRef<Record<string, number>>({});
  const activeProjectIdRef = useRef<string | null>(null);
  activeProjectIdRef.current = activeProjectId;
  const chaptersRef = useRef<StoryChapter[]>([]);
  chaptersRef.current = chapters;

  const clearAllSaveTimers = useCallback(() => {
    saveTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    saveTimersRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      clearAllSaveTimers();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [clearAllSaveTimers]);

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

  // Keep baseline word count synced when switching chapters or when a loader replaces text
  useEffect(() => {
    lastWordCountRef.current = countWords(activeChapter?.content || '');
  }, [activeChapterId, baselineSyncVersion]);

  const loadLocalWorkspace = useCallback(() => {
    projectLoadGenRef.current += 1;
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
      lastWordCountRef.current = countWords(chosenCh?.content || '');
    } else {
      setChapters([]);
      setActiveChapterId(null);
      lastWordCountRef.current = 0;
    }
    setBaselineSyncVersion((v) => v + 1);
    setNodes([]);
    setLinks([]);
    setSaveStatus('local');
  }, []);

  const loadProjectData = useCallback(
    async (project: StoryProject, isLoggedIn: boolean, expectedSessionGen: number): Promise<boolean> => {
      const loadGen = ++projectLoadGenRef.current;

      if (!isLoggedIn || project.isLocalOnly) {
        if (sessionGenRef.current !== expectedSessionGen || projectLoadGenRef.current !== loadGen) {
          return false;
        }
        const localChs = webStorage.getLocalChapters(project.id);
        setActiveProjectId(project.id);
        setChapters(localChs);
        const { chapterId } = webStorage.getLastSelection();
        const chosen = localChs.find((c) => c.id === chapterId) || localChs[0] || null;
        setActiveChapterId(chosen?.id || null);
        lastWordCountRef.current = countWords(chosen?.content || '');
        setBaselineSyncVersion((v) => v + 1);
        setNodes([]);
        setLinks([]);
        setSaveStatus('local');
        return true;
      }

      const editRevsAtStart = { ...chapterEditRevRef.current };
      try {
        const [chRes, graphRes] = await Promise.all([
          webApi.getChapters(project.id),
          webApi.getProjectGraph(project.id).catch(() => null),
        ]);

        if (sessionGenRef.current !== expectedSessionGen || projectLoadGenRef.current !== loadGen) {
          return false;
        }

        const currentById = new Map(chaptersRef.current.map((c) => [c.id, c]));
        let loadedChapters: StoryChapter[] = (chRes.data || []).map((c) => {
          const startedRev = editRevsAtStart[c.id] || 0;
          const currentRev = chapterEditRevRef.current[c.id] || 0;
          if (currentRev > startedRev) {
            const newerLocal = currentById.get(c.id);
            if (newerLocal) return newerLocal;
          }
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
          if (sessionGenRef.current !== expectedSessionGen || projectLoadGenRef.current !== loadGen) {
            return false;
          }
          if (created.data) {
            loadedChapters = [{ ...created.data, content: created.data.content || '', dirty: false }];
          }
        }

        loadedChapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
        setActiveProjectId(project.id);
        setChapters(loadedChapters);
        const { chapterId } = webStorage.getLastSelection();
        const chosen = loadedChapters.find((c) => c.id === chapterId) || loadedChapters[0] || null;
        setActiveChapterId(chosen?.id || null);
        lastWordCountRef.current = countWords(chosen?.content || '');
        setBaselineSyncVersion((v) => v + 1);

        setNodes(graphRes?.data?.nodes || []);
        setLinks(graphRes?.data?.links || []);
        setSaveStatus(chosen?.dirty ? 'local' : 'saved');
        return true;
      } catch (err: unknown) {
        if (sessionGenRef.current !== expectedSessionGen || projectLoadGenRef.current !== loadGen) {
          return false;
        }
        const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu dự án.';
        notify(msg);
        setSaveStatus('local');
        return false;
      }
    },
    [notify]
  );

  const loadRemoteWorkspace = useCallback(
    async (authedUser: AuthUser, expectedSessionGen: number): Promise<boolean> => {
      try {
        const res = await webApi.getProjects();
        if (sessionGenRef.current !== expectedSessionGen) return false;
        let list = res.data || [];
        if (list.length === 0) {
          const created = await webApi.createProject({
            title: 'Truyện mới của ' + authedUser.penName,
            genre: 'Tự do',
          });
          if (sessionGenRef.current !== expectedSessionGen) return false;
          if (created.data) list = [created.data];
        }
        setProjects(list);
        const { projectId } = webStorage.getLastSelection();
        const chosenProj = list.find((p) => p.id === projectId) || list[0] || null;
        if (chosenProj) {
          return await loadProjectData(chosenProj, true, expectedSessionGen);
        }
        setActiveProjectId(null);
        setChapters([]);
        setActiveChapterId(null);
        return true;
      } catch (err: unknown) {
        if (sessionGenRef.current !== expectedSessionGen) return false;
        if (err instanceof ApiError && err.status === 401) {
          clearAllSaveTimers();
          sessionGenRef.current += 1;
          webApi.setToken(null);
          webStorage.setAuth(null, null);
          setUser(null);
          loadLocalWorkspace();
          notify('Phiên đăng nhập đã hết hạn. Đang chuyển về chế độ cục bộ.');
          return false;
        }
        loadLocalWorkspace();
        notify('Không thể kết nối máy chủ. Đang mở bản thảo cục bộ.');
        return false;
      }
    },
    [clearAllSaveTimers, loadLocalWorkspace, loadProjectData, notify]
  );

  // Bootstrap on mount (guarded against React StrictMode double invocation)
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const { token, user: cachedUser } = webStorage.getAuth();
    if (token && cachedUser) {
      const gen = ++sessionGenRef.current;
      webApi.setToken(token);
      setUser(cachedUser);
      void loadRemoteWorkspace(cachedUser, gen).finally(() => setAuthChecked(true));
    } else {
      loadLocalWorkspace();
      setAuthChecked(true);
    }
  }, [loadLocalWorkspace, loadRemoteWorkspace]);

  // Persist last selection only after initial workspace restoration completes
  useEffect(() => {
    if (!authChecked) return;
    webStorage.saveLastSelection(activeProjectId, activeChapterId);
  }, [authChecked, activeProjectId, activeChapterId]);

  // Sync a single chapter to backend, checking revision & session to avoid clobbering newer edits
  const syncChapterToServer = useCallback(
    async (
      chapter: StoryChapter,
      sentRev: number,
      expectedSessionGen: number
    ): Promise<'saved' | 'local' | 'error'> => {
      if (!user || chapter.isLocalOnly) {
        setSaveStatus('local');
        return 'local';
      }
      setSaveStatus('saving');
      try {
        await webApi.updateChapter(chapter.id, {
          title: chapter.title,
          desc: chapter.desc || '',
          content: chapter.content || '',
        });
        if (sessionGenRef.current !== expectedSessionGen) {
          return 'local';
        }
        const currentRev = chapterEditRevRef.current[chapter.id] || 0;
        if (currentRev === sentRev) {
          webStorage.clearChapterDraft(chapter.id);
          setChapters((prev) =>
            prev.map((c) => (c.id === chapter.id ? { ...c, dirty: false, updatedAt: Date.now() } : c))
          );
          setSaveStatus('saved');
        }
        return 'saved';
      } catch {
        if (sessionGenRef.current !== expectedSessionGen) {
          return 'local';
        }
        const currentRev = chapterEditRevRef.current[chapter.id] || 0;
        if (currentRev === sentRev) {
          webStorage.saveChapterDraft(chapter.id, {
            title: chapter.title,
            desc: chapter.desc || '',
            content: chapter.content || '',
            updatedAt: Date.now(),
            dirty: true,
          });
          setSaveStatus('local');
        }
        return 'error';
      }
    },
    [user]
  );

  // Edit chapter fields (immediate local persistence + per-chapter debounced server sync)
  const updateActiveChapter = useCallback(
    (patch: Partial<Pick<StoryChapter, 'title' | 'desc' | 'content'>>) => {
      if (!activeChapter || !activeProject) return;

      const nextRev = (chapterEditRevRef.current[activeChapter.id] || 0) + 1;
      chapterEditRevRef.current[activeChapter.id] = nextRev;

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

      const targetProjectId = activeProject.id;
      const isLocalTarget = !user || Boolean(activeProject.isLocalOnly);

      setChapters((prev) => {
        const nextList = prev.map((c) => (c.id === nextChapter.id ? nextChapter : c));
        if (isLocalTarget) {
          const ok = webStorage.saveLocalChapters(targetProjectId, nextList);
          setSaveStatus(ok ? 'local' : 'error');
        }
        return nextList;
      });

      if (isLocalTarget) {
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

      const capturedSessionGen = sessionGenRef.current;
      setSaveStatus('saving');
      const existingTimer = saveTimersRef.current.get(nextChapter.id);
      if (existingTimer) window.clearTimeout(existingTimer);
      const timerId = window.setTimeout(() => {
        saveTimersRef.current.delete(nextChapter.id);
        void syncChapterToServer(nextChapter, nextRev, capturedSessionGen);
      }, 1100);
      saveTimersRef.current.set(nextChapter.id, timerId);
    },
    [activeChapter, activeProject, syncChapterToServer, user]
  );

  const handleManualSave = useCallback(async () => {
    if (!activeChapter) return;
    const existingTimer = saveTimersRef.current.get(activeChapter.id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      saveTimersRef.current.delete(activeChapter.id);
    }
    const rev = chapterEditRevRef.current[activeChapter.id] || 0;
    const outcome = await syncChapterToServer(activeChapter, rev, sessionGenRef.current);
    if (outcome === 'saved') {
      notify('Đã đồng bộ lên máy chủ.');
    } else if (outcome === 'error') {
      notify('Không thể đồng bộ máy chủ — đã lưu bản thảo cục bộ.');
    } else {
      notify('Đã lưu bản thảo cục bộ.');
    }
  }, [activeChapter, notify, syncChapterToServer]);

  // Keyboard shortcuts: Ctrl+S, Ctrl+Shift+F, Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleManualSave();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFocusMode((v) => !v);
      } else if (e.key === 'Escape' && focusMode) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode, handleManualSave]);

  // Project & Chapter actions
  const handleSelectProject = async (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj || proj.id === activeProjectId) return;
    await loadProjectData(proj, Boolean(user), sessionGenRef.current);
  };

  const handleCreateProject = async (title: string) => {
    const originSessionGen = sessionGenRef.current;
    if (user) {
      try {
        const res = await webApi.createProject({ title, genre: 'Tự do' });
        if (sessionGenRef.current !== originSessionGen) return;
        if (res.data) {
          setProjects((prev) => [res.data, ...prev]);
          await loadProjectData(res.data, true, originSessionGen);
          notify(`Đã tạo dự án "${title}"`);
          return;
        }
      } catch (err: unknown) {
        if (sessionGenRef.current !== originSessionGen) return;
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
    const okProj = webStorage.saveLocalProjects(nextProjects);
    const okCh = webStorage.saveLocalChapters(localProj.id, [starterChapter]);
    setProjects(nextProjects);
    setActiveProjectId(localProj.id);
    setChapters([starterChapter]);
    setActiveChapterId(starterChapter.id);
    lastWordCountRef.current = 0;
    setBaselineSyncVersion((v) => v + 1);
    if (!okProj || !okCh) {
      setSaveStatus('error');
      notify('Không thể lưu dự án mới vào bộ nhớ trình duyệt.');
    } else {
      notify(`Đã tạo bản thảo cục bộ "${title}"`);
    }
  };

  const handleCreateChapter = async () => {
    if (!activeProject) return;
    const originProjectId = activeProject.id;
    const originIsLocal = Boolean(activeProject.isLocalOnly);
    const originSessionGen = sessionGenRef.current;
    const nextNum =
      chapters.length > 0 ? Math.max(...chapters.map((c) => c.chapterNumber || 0)) + 1 : 1;
    const defaultTitle = `Chương ${nextNum}`;

    if (user && !originIsLocal) {
      try {
        const res = await webApi.createChapter(originProjectId, {
          chapterNumber: nextNum,
          title: defaultTitle,
          content: '',
        });
        if (
          sessionGenRef.current !== originSessionGen ||
          activeProjectIdRef.current !== originProjectId
        ) {
          return;
        }
        if (res.data) {
          const created = { ...res.data, content: res.data.content || '', dirty: false };
          setChapters((prev) => [...prev, created]);
          setActiveChapterId(created.id);
          notify(`Đã thêm ${defaultTitle}`);
          return;
        }
      } catch (err: unknown) {
        if (sessionGenRef.current !== originSessionGen) return;
        notify(err instanceof Error ? err.message : 'Không thể tạo chương mới.');
        return;
      }
    }

    const localCh: StoryChapter = {
      id: `local-ch-${Date.now()}`,
      projectId: originProjectId,
      chapterNumber: nextNum,
      code: `C${nextNum}`,
      title: defaultTitle,
      desc: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isLocalOnly: true,
    };
    const nextList = [...webStorage.getLocalChapters(originProjectId), localCh];
    const persisted = webStorage.saveLocalChapters(originProjectId, nextList);
    if (
      sessionGenRef.current === originSessionGen &&
      activeProjectIdRef.current === originProjectId
    ) {
      setChapters(nextList);
      setActiveChapterId(localCh.id);
    }
    if (!persisted) {
      setSaveStatus('error');
      notify('Không thể lưu chương mới vào bộ nhớ trình duyệt.');
    } else {
      notify(`Đã thêm ${defaultTitle}`);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!activeProject) return;
    const originProjectId = activeProject.id;
    const originIsLocal = Boolean(activeProject.isLocalOnly);
    const originSessionGen = sessionGenRef.current;
    const target = chapters.find((c) => c.id === chapterId);
    if (!target) return;

    const pendingTimer = saveTimersRef.current.get(chapterId);
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      saveTimersRef.current.delete(chapterId);
    }

    if (user && !target.isLocalOnly) {
      try {
        await webApi.deleteChapter(chapterId);
      } catch (err: unknown) {
        if (sessionGenRef.current !== originSessionGen) return;
        notify(err instanceof Error ? err.message : 'Không thể xóa chương trên máy chủ.');
        return;
      }
    }

    webStorage.clearChapterDraft(chapterId);
    if (!user || originIsLocal) {
      const remainingLocal = webStorage
        .getLocalChapters(originProjectId)
        .filter((c) => c.id !== chapterId);
      webStorage.saveLocalChapters(originProjectId, remainingLocal);
    }

    if (
      sessionGenRef.current !== originSessionGen ||
      activeProjectIdRef.current !== originProjectId
    ) {
      return;
    }

    setChapters((prev) => {
      const remaining = prev.filter((c) => c.id !== chapterId);
      setActiveChapterId((curr) => (curr === chapterId ? remaining[0]?.id || null : curr));
      return remaining;
    });
    notify('Đã xóa chương.');
  };

  const handleAuthenticated = (token: string, authedUser: AuthUser) => {
    clearAllSaveTimers();
    const nextGen = ++sessionGenRef.current;
    webApi.setToken(token);
    webStorage.setAuth(token, authedUser);
    setUser(authedUser);
    setGuestDismissedAuth(true);
    notify(`Chào mừng ${authedUser.penName}! Đang đồng bộ dữ liệu từ App...`);
    void loadRemoteWorkspace(authedUser, nextGen);
  };

  const handleLogout = () => {
    clearAllSaveTimers();
    sessionGenRef.current += 1;
    projectLoadGenRef.current += 1;
    webApi.setToken(null);
    webStorage.setAuth(null, null);
    setUser(null);
    setGuestDismissedAuth(false);
    loadLocalWorkspace();
    notify('Đã đăng xuất.');
  };

  const handleRefreshFromApp = async () => {
    if (!user || syncingFromApp) return;
    const capturedSessionGen = sessionGenRef.current;
    setSyncingFromApp(true);
    try {
      const ok = await loadRemoteWorkspace(user, capturedSessionGen);
      if (ok && sessionGenRef.current === capturedSessionGen) {
        notify('Đã cập nhật dữ liệu mới nhất từ App.');
      }
    } finally {
      setSyncingFromApp(false);
    }
  };

  // Insert text at cursor position in manuscript textarea (guarded by chapter ID)
  const handleInsertText = (textToInsert: string, expectedChapterId?: string) => {
    if (!activeChapter) return;
    if (expectedChapterId && activeChapter.id !== expectedChapterId) return;
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

  const handleReplaceQuote = (
    quote: string,
    replacement: string,
    expectedChapterId?: string
  ): boolean => {
    if (!activeChapter) return false;
    if (expectedChapterId && activeChapter.id !== expectedChapterId) return false;
    const current = activeChapter.content || '';
    if (!current.includes(quote)) return false;
    updateActiveChapter({ content: current.replace(quote, () => replacement) });
    return true;
  };

  // Preserve native Tab / Shift+Tab focus navigation; use Ctrl+] to indent paragraphs
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ']' && prefs.tabIndent) {
      e.preventDefault();
      handleInsertText('    ', activeChapter?.id);
    }
  };

  const toggleLeftSidebar = () => {
    setShowLeft((prev) => {
      const next = !prev;
      if (next && isNarrowViewport()) setShowRight(false);
      return next;
    });
  };

  const toggleRightSidebar = () => {
    setShowRight((prev) => {
      const next = !prev;
      if (next && isNarrowViewport()) setShowLeft(false);
      return next;
    });
  };

  const words = countWords(activeChapter?.content || '');
  const chars = (activeChapter?.content || '').length;
  const paragraphs = countParagraphs(activeChapter?.content || '');
  const readMins = estimateReadingMinutes(words);

  const cycleTheme = () => {
    const order: EditorTheme[] = ['dark', 'sepia', 'light'];
    const next = order[(order.indexOf(prefs.theme) + 1) % order.length];
    setPrefs((p) => ({ ...p, theme: next }));
  };

  const cyclePaperStyle = () => {
    const order: PaperStyle[] = ['auto', 'white', 'sepia'];
    const next = order[(order.indexOf(prefs.paperStyle) + 1) % order.length];
    setPrefs((p) => ({ ...p, paperStyle: next }));
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
    dark: 'Nền đen',
    sepia: 'Giấy vàng',
    light: 'Sáng',
  };

  const paperLabel: Record<PaperStyle, string> = {
    auto: 'Giấy theo nền',
    white: 'Giấy trắng',
    sepia: 'Giấy vàng',
  };

  const fontLabel: Record<EditorFont, string> = {
    serif: 'Serif',
    sans: 'Sans',
    mono: 'Mono',
  };

  if (authChecked && !user && !guestDismissedAuth) {
    return (
      <AuthModal
        open
        variant="page"
        initialTab="login"
        onClose={() => setGuestDismissedAuth(true)}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

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
          onSelectChapter={(id) => {
            setActiveChapterId(id);
            if (isNarrowViewport()) setShowLeft(false);
          }}
          onCreateChapter={handleCreateChapter}
          onDeleteChapter={handleDeleteChapter}
          onUpdateGoalTarget={(targetWords) => {
            const next = { ...dailyGoal, targetWords };
            setDailyGoal(next);
            webStorage.saveDailyGoal(next);
          }}
          onOpenAuth={() => setAuthModalOpen(true)}
          onLogout={handleLogout}
          onClose={() => setShowLeft(false)}
        />
      )}

      {/* CENTER WRITING COLUMN */}
      <main className="editor-column">
        <header className="editor-topbar">
          <div className="topbar-group">
            {!focusMode && (
              <button
                type="button"
                className={`icon-btn ${showLeft ? 'active' : ''}`}
                title="Ẩn/hiện danh sách chương"
                onClick={toggleLeftSidebar}
              >
                <PanelLeft size={16} />
              </button>
            )}

            <button
              type="button"
              className="icon-btn"
              title="Đổi giao diện nền (Nền đen / Giấy vàng / Sáng)"
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

            <button
              type="button"
              className={`icon-btn ${prefs.paperStyle !== 'auto' ? 'active' : ''}`}
              title="Đổi màu trang giấy viết (Giấy theo nền / Giấy trắng / Giấy vàng)"
              onClick={cyclePaperStyle}
            >
              <FileText size={14} />
              <span>{paperLabel[prefs.paperStyle]}</span>
            </button>

            <button type="button" className="icon-btn" title="Đổi kiểu chữ" onClick={cycleFont}>
              <span>{fontLabel[prefs.font]}</span>
            </button>

            <div className="topbar-divider" />

            <button
              type="button"
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
              type="button"
              className="icon-btn"
              title="Tăng cỡ chữ"
              onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.min(26, p.fontSize + 1) }))}
            >
              <Plus size={13} />
            </button>

            <button
              type="button"
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

            {user ? (
              <button
                type="button"
                className="icon-btn bordered"
                title="Tải dữ liệu mới nhất từ App"
                disabled={syncingFromApp}
                onClick={() => void handleRefreshFromApp()}
              >
                <RefreshCw size={13} className={syncingFromApp ? 'spin' : undefined} />
                <span>Đồng bộ App</span>
              </button>
            ) : (
              <button
                type="button"
                className="primary-btn"
                style={{ height: 30, fontSize: 12, padding: '0 10px' }}
                onClick={() => setAuthModalOpen(true)}
              >
                Đăng nhập / Đăng ký
              </button>
            )}

            {activeChapter && (
              <button
                type="button"
                className="icon-btn bordered"
                title="Lưu ngay (Ctrl+S)"
                onClick={() => void handleManualSave()}
              >
                <Save size={14} />
              </button>
            )}

            <button
              type="button"
              className={`icon-btn ${focusMode ? 'active' : ''}`}
              title="Chế độ tập trung (Ctrl+Shift+F)"
              onClick={() => setFocusMode((v) => !v)}
            >
              {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              <span>{focusMode ? 'Thoát Focus' : 'Focus'}</span>
            </button>

            {!focusMode && (
              <button
                type="button"
                className={`icon-btn ${showRight ? 'active' : ''}`}
                title="Ẩn/hiện Trợ lý AI & Thế giới"
                onClick={toggleRightSidebar}
              >
                <PanelRight size={16} />
              </button>
            )}
          </div>
        </header>

        <div className="editor-scroll-area">
          {activeChapter ? (
            <article
              className={`paper-sheet width-${prefs.pageWidth}${
                prefs.paperStyle !== 'auto' ? ` paper-${prefs.paperStyle}` : ''
              }`}
            >
              <div className="chapter-eyebrow">
                <span>
                  {activeProject?.title} · Chương {activeChapter.chapterNumber}
                </span>
                <button
                  type="button"
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
                placeholder="Bắt đầu viết câu chuyện của bạn tại đây... (Ctrl+] thụt đầu dòng, Ctrl+S để lưu, Ctrl+Shift+F để bật chế độ tập trung)"
                spellCheck
              />
            </article>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>Chưa có chương nào được chọn.</p>
              <button
                type="button"
                className="primary-btn"
                onClick={() => void handleCreateChapter()}
              >
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
            <span>Ctrl+] thụt dòng · Ctrl+S lưu · Ctrl+Shift+F tập trung</span>
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
          onClose={() => setShowRight(false)}
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
