import type {
  AuthUser,
  DailyGoalState,
  EditorPreferences,
  StoryChapter,
  StoryProject,
} from '../types/story';

const KEYS = {
  AUTH_TOKEN: 'story_web_auth_token',
  AUTH_USER: 'story_web_auth_user',
  PREFS: 'story_web_editor_prefs_v2',
  GOAL: 'story_web_daily_goal',
  LOCAL_PROJECTS: 'story_web_local_projects',
  LOCAL_CHAPTERS_PREFIX: 'story_web_local_chapters_',
  DRAFTS_PREFIX: 'story_web_draft_',
  LAST_PROJECT_ID: 'story_web_last_project_id',
  LAST_CHAPTER_ID: 'story_web_last_chapter_id',
};

export const DEFAULT_PREFS: EditorPreferences = {
  theme: 'dark',
  font: 'serif',
  fontSize: 18,
  lineHeight: 1.85,
  pageWidth: 'medium',
  tabIndent: true,
};

export const DEFAULT_GOAL: DailyGoalState = {
  targetWords: 1000,
  history: {},
};

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function getTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const webStorage = {
  getAuth(): { token: string | null; user: AuthUser | null } {
    const token = window.localStorage.getItem(KEYS.AUTH_TOKEN);
    const user = safeRead<AuthUser | null>(KEYS.AUTH_USER, null);
    return { token, user };
  },

  setAuth(token: string | null, user: AuthUser | null) {
    if (token && user) {
      window.localStorage.setItem(KEYS.AUTH_TOKEN, token);
      safeWrite(KEYS.AUTH_USER, user);
    } else {
      window.localStorage.removeItem(KEYS.AUTH_TOKEN);
      window.localStorage.removeItem(KEYS.AUTH_USER);
    }
  },

  getPrefs(): EditorPreferences {
    return { ...DEFAULT_PREFS, ...safeRead<Partial<EditorPreferences>>(KEYS.PREFS, {}) };
  },

  savePrefs(prefs: EditorPreferences) {
    safeWrite(KEYS.PREFS, prefs);
  },

  getDailyGoal(): DailyGoalState {
    const stored = safeRead<Partial<DailyGoalState>>(KEYS.GOAL, {});
    return {
      targetWords: stored.targetWords || DEFAULT_GOAL.targetWords,
      history: stored.history || {},
    };
  },

  saveDailyGoal(goal: DailyGoalState) {
    safeWrite(KEYS.GOAL, goal);
  },

  addWordsWrittenToday(delta: number): DailyGoalState {
    const current = this.getDailyGoal();
    if (delta <= 0) return current;
    const today = getTodayKey();
    const updated: DailyGoalState = {
      ...current,
      history: {
        ...current.history,
        [today]: (current.history[today] || 0) + delta,
      },
    };
    this.saveDailyGoal(updated);
    return updated;
  },

  getLastSelection(): { projectId: string | null; chapterId: string | null } {
    return {
      projectId: window.localStorage.getItem(KEYS.LAST_PROJECT_ID),
      chapterId: window.localStorage.getItem(KEYS.LAST_CHAPTER_ID),
    };
  },

  saveLastSelection(projectId: string | null, chapterId: string | null) {
    if (projectId) window.localStorage.setItem(KEYS.LAST_PROJECT_ID, projectId);
    else window.localStorage.removeItem(KEYS.LAST_PROJECT_ID);
    if (chapterId) window.localStorage.setItem(KEYS.LAST_CHAPTER_ID, chapterId);
    else window.localStorage.removeItem(KEYS.LAST_CHAPTER_ID);
  },

  // Draft cache per chapter (works both when logged-in offline and in guest mode)
  getChapterDraft(
    chapterId: string
  ): { title: string; desc: string; content: string; updatedAt: number; dirty: boolean } | null {
    return safeRead(KEYS.DRAFTS_PREFIX + chapterId, null);
  },

  saveChapterDraft(
    chapterId: string,
    draft: { title: string; desc: string; content: string; updatedAt: number; dirty: boolean }
  ) {
    safeWrite(KEYS.DRAFTS_PREFIX + chapterId, draft);
  },

  clearChapterDraft(chapterId: string) {
    window.localStorage.removeItem(KEYS.DRAFTS_PREFIX + chapterId);
  },

  // Guest / Offline local projects & chapters
  getLocalProjects(): StoryProject[] {
    const list = safeRead<StoryProject[]>(KEYS.LOCAL_PROJECTS, []);
    if (list.length > 0) return list;
    const starterProject: StoryProject = {
      id: 'local-proj-default',
      title: 'Bản thảo đầu tiên',
      genre: 'Tự do',
      summary: 'Không gian viết nhanh lưu trực tiếp trên trình duyệt của bạn.',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isLocalOnly: true,
    };
    this.saveLocalProjects([starterProject]);
    this.saveLocalChapters(starterProject.id, [
      {
        id: 'local-ch-1',
        projectId: starterProject.id,
        chapterNumber: 1,
        code: 'C1',
        title: 'Chương 1: Khởi đầu',
        desc: '',
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isLocalOnly: true,
      },
    ]);
    return [starterProject];
  },

  saveLocalProjects(projects: StoryProject[]) {
    safeWrite(KEYS.LOCAL_PROJECTS, projects);
  },

  getLocalChapters(projectId: string): StoryChapter[] {
    return safeRead<StoryChapter[]>(KEYS.LOCAL_CHAPTERS_PREFIX + projectId, []);
  },

  saveLocalChapters(projectId: string, chapters: StoryChapter[]) {
    safeWrite(KEYS.LOCAL_CHAPTERS_PREFIX + projectId, chapters);
  },
};
