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
  StoryNodeType,
  StoryProject,
} from './types/story';
import { countParagraphs, countWords, estimateReadingMinutes } from './utils/text';

type SaveStatus = 'saved' | 'saving' | 'local' | 'error';

interface MentionPopupState {
  start: number;
  end: number;
  query: string;
  top: number;
  left: number;
}

const MENTION_TYPE_LABELS: Record<StoryNodeType, string> = {
  character: 'Nhân vật',
  faction: 'Tổ chức',
  location: 'Địa điểm',
  item: 'Vật phẩm',
  event: 'Sự kiện',
};

const MENTION_TYPE_COLORS: Record<StoryNodeType, string> = {
  character: 'var(--node-character)',
  faction: 'var(--node-faction)',
  location: 'var(--node-location)',
  item: 'var(--node-item)',
  event: 'var(--node-event)',
};

function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function getCaretViewportCoords(
  textarea: HTMLTextAreaElement,
  position: number
): { top: number; left: number } {
  const rect = textarea.getBoundingClientRect();
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.padding = style.padding;
  mirror.style.boxSizing = style.boxSizing;

  mirror.textContent = textarea.value.slice(0, position);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerTop = marker.offsetTop;
  const markerLeft = marker.offsetLeft;
  const lineHeightPx = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.6 || 28;
  document.body.removeChild(mirror);

  const rawTop = rect.top + markerTop - textarea.scrollTop + lineHeightPx + 6;
  const rawLeft = rect.left + markerLeft - textarea.scrollLeft;
  const popoverWidth = Math.min(320, window.innerWidth - 32);
  const popoverHeight = 260;

  const left = Math.max(16, Math.min(rawLeft, window.innerWidth - popoverWidth - 16));
  const top =
    rawTop + popoverHeight > window.innerHeight - 16
      ? Math.max(16, rect.top + markerTop - textarea.scrollTop - popoverHeight - 8)
      : Math.max(16, rawTop);

  return { top, left };
}

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
  const [isAnalyzingChapter, setIsAnalyzingChapter] = useState(false);
  const [mentionState, setMentionState] = useState<MentionPopupState | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const inFlightSavesRef = useRef<
    Map<string, { promise: Promise<'saved' | 'local' | 'error'>; sessionGen: number }>
  >(new Map());
  const queuedSavesRef = useRef<
    Map<string, { chapter: StoryChapter; rev: number; sessionGen: number }>
  >(new Map());
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
    queuedSavesRef.current.clear();
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

  // Sync a single chapter to backend, serialized per chapter so older saves never overwrite newer ones
  const syncChapterToServer = useCallback(
    async (
      chapter: StoryChapter,
      sentRev: number,
      expectedSessionGen: number
    ): Promise<'saved' | 'local' | 'error'> => {
      if (!user || chapter.isLocalOnly) {
        return 'local';
      }

      const existingEntry = inFlightSavesRef.current.get(chapter.id);
      if (existingEntry && existingEntry.sessionGen === expectedSessionGen) {
        queuedSavesRef.current.set(chapter.id, {
          chapter,
          rev: sentRev,
          sessionGen: expectedSessionGen,
        });
        return existingEntry.promise;
      }

      const entry: { promise: Promise<'saved' | 'local' | 'error'>; sessionGen: number } = {
        promise: Promise.resolve('local'),
        sessionGen: expectedSessionGen,
      };

      const runner = (async (): Promise<'saved' | 'local' | 'error'> => {
        let current = { chapter, rev: sentRev, sessionGen: expectedSessionGen };
        let lastOutcome: 'saved' | 'local' | 'error' = 'local';

        while (true) {
          if (sessionGenRef.current !== current.sessionGen) {
            return 'local';
          }
          setSaveStatus('saving');
          try {
            await webApi.updateChapter(current.chapter.id, {
              title: current.chapter.title,
              desc: current.chapter.desc || '',
              content: current.chapter.content || '',
            });
            if (sessionGenRef.current !== current.sessionGen) {
              return 'local';
            }
            lastOutcome = 'saved';
            const latestRev = chapterEditRevRef.current[current.chapter.id] || 0;
            const queuedForChapter = queuedSavesRef.current.get(current.chapter.id);
            const hasQueuedForSession =
              Boolean(queuedForChapter) && queuedForChapter!.sessionGen === current.sessionGen;
            if (latestRev === current.rev && !hasQueuedForSession) {
              webStorage.clearChapterDraft(current.chapter.id);
              setChapters((prev) =>
                prev.map((c) =>
                  c.id === current.chapter.id ? { ...c, dirty: false, updatedAt: Date.now() } : c
                )
              );
              setSaveStatus('saved');
            }
          } catch {
            if (sessionGenRef.current !== current.sessionGen) {
              return 'local';
            }
            lastOutcome = 'error';
            const latestRev = chapterEditRevRef.current[current.chapter.id] || 0;
            const queuedForChapter = queuedSavesRef.current.get(current.chapter.id);
            const hasQueuedForSession =
              Boolean(queuedForChapter) && queuedForChapter!.sessionGen === current.sessionGen;
            if (latestRev === current.rev && !hasQueuedForSession) {
              webStorage.saveChapterDraft(current.chapter.id, {
                title: current.chapter.title,
                desc: current.chapter.desc || '',
                content: current.chapter.content || '',
                updatedAt: Date.now(),
                dirty: true,
              });
              setSaveStatus('local');
            }
          }

          const nextQueued = queuedSavesRef.current.get(chapter.id);
          if (!nextQueued || nextQueued.sessionGen !== expectedSessionGen) break;
          queuedSavesRef.current.delete(chapter.id);
          current = nextQueued;
        }

        return lastOutcome;
      })().finally(() => {
        if (inFlightSavesRef.current.get(chapter.id) === entry) {
          inFlightSavesRef.current.delete(chapter.id);
        }
      });

      entry.promise = runner;
      inFlightSavesRef.current.set(chapter.id, entry);
      return runner;
    },
    [user]
  );

  useEffect(() => {
    if (isAnalyzingChapter) {
      setMentionState(null);
    }
  }, [isAnalyzingChapter]);

  // Edit chapter fields (immediate local persistence + per-chapter debounced server sync)
  const updateActiveChapter = useCallback(
    (patch: Partial<Pick<StoryChapter, 'title' | 'desc' | 'content'>>) => {
      if (!activeChapter || !activeProject || isAnalyzingChapter) return;

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
    [activeChapter, activeProject, isAnalyzingChapter, syncChapterToServer, user]
  );

  const handleManualSave = useCallback(async () => {
    if (!activeChapter || !activeProject) return;
    const isLocalWorkspace = !user || Boolean(activeProject.isLocalOnly) || Boolean(activeChapter.isLocalOnly);
    if (isLocalWorkspace) {
      const persisted = webStorage.saveLocalChapters(activeProject.id, chaptersRef.current);
      if (persisted) {
        setSaveStatus('local');
        notify('Đã lưu bản thảo cục bộ.');
      } else {
        setSaveStatus('error');
        notify('Không thể lưu vào bộ nhớ trình duyệt (bộ nhớ đầy hoặc bị chặn).');
      }
      return;
    }

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
  }, [activeChapter, activeProject, notify, syncChapterToServer, user]);

  // Keyboard shortcuts: Ctrl+S, Ctrl+Shift+F, Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleManualSave();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFocusMode((v) => !v);
      } else if (e.key === 'Escape' && focusMode && !mentionState) {
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode, handleManualSave, mentionState]);

  // Project & Chapter actions
  const handleSelectProject = async (projectId: string) => {
    if (isAnalyzingChapter) {
      notify('Đang phân tích chương, vui lòng chờ hoàn tất trước khi chuyển dự án.');
      return;
    }
    const proj = projects.find((p) => p.id === projectId);
    if (!proj || proj.id === activeProjectId) return;
    await loadProjectData(proj, Boolean(user), sessionGenRef.current);
  };

  const handleCreateProject = async (title: string) => {
    if (isAnalyzingChapter) {
      notify('Đang phân tích chương, vui lòng chờ hoàn tất.');
      return;
    }
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
    if (isAnalyzingChapter) {
      notify('Đang phân tích chương, vui lòng chờ hoàn tất.');
      return;
    }
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
    const nextList = [...chaptersRef.current, localCh];
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
    if (isAnalyzingChapter) {
      notify('Đang phân tích chương, vui lòng chờ hoàn tất.');
      return;
    }
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
    if (isAnalyzingChapter) {
      notify('Đang phân tích chương, vui lòng chờ hoàn tất.');
      return;
    }
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
    if (!user || syncingFromApp || isAnalyzingChapter) return;
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

  const handleRefreshGraphOnly = useCallback(async () => {
    if (!user || !activeProject || activeProject.isLocalOnly) return;
    const targetProjectId = activeProject.id;
    const capturedSessionGen = sessionGenRef.current;
    try {
      const graphRes = await webApi.getProjectGraph(targetProjectId);
      if (
        sessionGenRef.current !== capturedSessionGen ||
        activeProjectIdRef.current !== targetProjectId
      ) {
        return;
      }
      setNodes(graphRes?.data?.nodes || []);
      setLinks(graphRes?.data?.links || []);
    } catch {
      // Ignore transient graph refresh error
    }
  }, [activeProject, user]);

  // Insert text at cursor position in manuscript textarea (guarded by chapter ID & analysis lock)
  const handleInsertText = (textToInsert: string, expectedChapterId?: string) => {
    if (!activeChapter || isAnalyzingChapter) return;
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
    if (!activeChapter || isAnalyzingChapter) return false;
    if (expectedChapterId && activeChapter.id !== expectedChapterId) return false;
    const current = activeChapter.content || '';
    if (!current.includes(quote)) return false;
    updateActiveChapter({ content: current.replace(quote, () => replacement) });
    return true;
  };

  const mentionMatches = useMemo(() => {
    if (!mentionState) return [];
    const q = mentionState.query.trim();
    const qLower = q.toLowerCase();
    const qNorm = stripDiacritics(q);
    const list = nodes.filter((node) => {
      if (!q) return true;
      const nameLower = node.name.trim().toLowerCase();
      if (nameLower.startsWith(qLower)) return true;
      return stripDiacritics(node.name.trim()).startsWith(qNorm);
    });
    return list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [mentionState, nodes]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionState?.query, mentionState?.start]);

  useEffect(() => {
    setMentionState(null);
  }, [activeChapterId, activeProjectId]);

  const updateMentionFromCaret = useCallback(
    (el: HTMLTextAreaElement, value: string) => {
      if (nodes.length === 0) {
        setMentionState(null);
        return;
      }
      const caret = el.selectionStart ?? value.length;
      const before = value.slice(0, caret);
      const atIdx = before.lastIndexOf('@');
      if (atIdx < 0) {
        setMentionState(null);
        return;
      }
      if (atIdx > 0 && !/[\s([{“"'\-–—]/.test(before[atIdx - 1])) {
        setMentionState(null);
        return;
      }
      const query = before.slice(atIdx + 1);
      if (query.includes('\n') || query.includes('@') || query.length > 40) {
        setMentionState(null);
        return;
      }
      const coords = getCaretViewportCoords(el, caret);
      setMentionState({
        start: atIdx,
        end: caret,
        query,
        top: coords.top,
        left: coords.left,
      });
    },
    [nodes.length]
  );

  const selectMentionNode = useCallback(
    (node: StoryNode) => {
      if (!activeChapter || !mentionState) return;
      const current = activeChapter.content || '';
      const before = current.slice(0, mentionState.start);
      const after = current.slice(mentionState.end);
      const needsTrailingSpace = after.length === 0 || !/^[\s.,!?;:)\]”"']/.test(after);
      const inserted = needsTrailingSpace ? `${node.name} ` : node.name;
      const nextContent = `${before}${inserted}${after}`;
      const nextCaret = mentionState.start + inserted.length;
      setMentionState(null);
      updateActiveChapter({ content: nextContent });
      window.requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(nextCaret, nextCaret);
        }
      });
    },
    [activeChapter, mentionState, updateActiveChapter]
  );

  // Preserve native Tab / Shift+Tab focus navigation; handle @mention navigation and Ctrl+] indent
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMentionState(null);
        return;
      }
      if (mentionMatches.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((i) => (i + 1) % mentionMatches.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const chosen = mentionMatches[Math.min(mentionIndex, mentionMatches.length - 1)];
          if (chosen) selectMentionNode(chosen);
          return;
        }
      }
    }
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
            if (isAnalyzingChapter) {
              notify('Đang phân tích chương, vui lòng chờ hoàn tất trước khi chuyển chương.');
              return;
            }
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
          locked={isAnalyzingChapter}
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
                disabled={syncingFromApp || isAnalyzingChapter}
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

              {isAnalyzingChapter && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--border-gold)',
                    color: 'var(--accent)',
                    fontSize: 12.5,
                    fontWeight: 500,
                  }}
                >
                  Đang phân tích chương — tạm khóa chỉnh sửa và chuyển chương cho đến khi hoàn tất.
                </div>
              )}

              <input
                className={`chapter-title-input font-${prefs.font}`}
                value={activeChapter.title}
                readOnly={isAnalyzingChapter}
                onChange={(e) => updateActiveChapter({ title: e.target.value })}
                placeholder="Nhập tiêu đề chương..."
              />

              {showDescBox && (
                <div className="chapter-desc-box">
                  <textarea
                    className="chapter-desc-input"
                    rows={2}
                    readOnly={isAnalyzingChapter}
                    value={activeChapter.desc || ''}
                    onChange={(e) => updateActiveChapter({ desc: e.target.value })}
                    placeholder="Ghi chú nhanh dàn ý, mục tiêu hoặc tóm tắt chương này..."
                  />
                </div>
              )}

              <div className="manuscript-wrap">
                <textarea
                  ref={textareaRef}
                  className={`manuscript-textarea font-${prefs.font}`}
                  style={{
                    fontSize: `${prefs.fontSize}px`,
                    lineHeight: prefs.lineHeight,
                    opacity: isAnalyzingChapter ? 0.72 : 1,
                  }}
                  readOnly={isAnalyzingChapter}
                  value={activeChapter.content || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateActiveChapter({ content: val });
                    updateMentionFromCaret(e.currentTarget, val);
                  }}
                  onClick={(e) => updateMentionFromCaret(e.currentTarget, e.currentTarget.value)}
                  onKeyUp={(e) => {
                    if (
                      e.key === 'ArrowLeft' ||
                      e.key === 'ArrowRight' ||
                      e.key === 'Home' ||
                      e.key === 'End'
                    ) {
                      updateMentionFromCaret(e.currentTarget, e.currentTarget.value);
                    }
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setMentionState(null), 120);
                  }}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder="Bắt đầu viết câu chuyện của bạn tại đây... (Gõ @ để ping nhân vật/địa điểm, Ctrl+] thụt đầu dòng, Ctrl+S lưu)"
                  spellCheck
                />
              </div>
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
            <span>@tên ping thực thể · Ctrl+] thụt dòng · Ctrl+S lưu · Ctrl+Shift+F tập trung</span>
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
          onRefreshGraph={handleRefreshGraphOnly}
          onAnalyzingChange={setIsAnalyzingChapter}
          onOpenAuth={() => setAuthModalOpen(true)}
          onNotify={notify}
          onClose={() => setShowRight(false)}
        />
      )}

      {mentionState && (
        <div
          className="mention-popover"
          style={{ top: mentionState.top, left: mentionState.left }}
          role="listbox"
          aria-label="Gợi ý thực thể để chèn"
        >
          <div className="mention-header">
            <span>
              Ping thực thể{mentionState.query ? `: @${mentionState.query}` : ''}
            </span>
            <span>↑↓ · Enter</span>
          </div>
          {mentionMatches.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--text-muted)' }}>
              Không có thực thể bắt đầu bằng “{mentionState.query}”
            </div>
          ) : (
            mentionMatches.map((node, idx) => (
              <button
                key={node.id}
                type="button"
                role="option"
                aria-selected={idx === mentionIndex}
                className={`mention-item ${idx === mentionIndex ? 'active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setMentionIndex(idx)}
                onClick={() => selectMentionNode(node)}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="mention-item-name">{node.name}</div>
                  {node.role && <div className="mention-item-role">{node.role}</div>}
                </div>
                <span
                  className="node-pill"
                  style={{ color: MENTION_TYPE_COLORS[node.type] }}
                >
                  {MENTION_TYPE_LABELS[node.type]}
                </span>
              </button>
            ))
          )}
        </div>
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
