import type {
  AuthUser,
  ChapterDraftStore,
  ChapterOutline,
  DailyGoalState,
  EditorPreferences,
  ProjectOutline,
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
  OUTLINE_PREFIX: 'story_web_outline_',
  CHAPTER_VERSIONS_PREFIX: 'story_web_versions_',
  LAST_PROJECT_ID: 'story_web_last_project_id',
  LAST_CHAPTER_ID: 'story_web_last_chapter_id',
};

export const EMPTY_CHAPTER_OUTLINE: ChapterOutline = {
  setting: '',
  style: '',
  characters: '',
  roughEvents: '',
  logicNotes: '',
};

export const EMPTY_PROJECT_OUTLINE: ProjectOutline = {
  worldSetting: '',
  writingStyle: '',
  storyFramework: '',
  storyLogic: '',
  characterOverview: '',
  chapters: {},
};

export const DEFAULT_PREFS: EditorPreferences = {
  theme: 'dark',
  paperStyle: 'auto',
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

function safeReadRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore blocked storage
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
    const parsedToken = safeRead<string | null>(KEYS.AUTH_TOKEN, null);
    const token =
      typeof parsedToken === 'string' && parsedToken.length > 0
        ? parsedToken
        : safeReadRaw(KEYS.AUTH_TOKEN);
    const user = safeRead<AuthUser | null>(KEYS.AUTH_USER, null);
    return { token, user };
  },

  setAuth(token: string | null, user: AuthUser | null): boolean {
    if (token && user) {
      const okToken = safeWrite(KEYS.AUTH_TOKEN, token);
      const okUser = safeWrite(KEYS.AUTH_USER, user);
      return okToken && okUser;
    }
    safeRemove(KEYS.AUTH_TOKEN);
    safeRemove(KEYS.AUTH_USER);
    return true;
  },

  getPrefs(): EditorPreferences {
    const stored = safeRead<Partial<EditorPreferences> | null>(KEYS.PREFS, null);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return { ...DEFAULT_PREFS };
    }
    return { ...DEFAULT_PREFS, ...stored };
  },

  savePrefs(prefs: EditorPreferences): boolean {
    return safeWrite(KEYS.PREFS, prefs);
  },

  getDailyGoal(): DailyGoalState {
    const stored = safeRead<Partial<DailyGoalState> | null>(KEYS.GOAL, null);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return { targetWords: DEFAULT_GOAL.targetWords, history: {} };
    }
    const targetWords =
      typeof stored.targetWords === 'number' &&
      Number.isFinite(stored.targetWords) &&
      stored.targetWords > 0
        ? stored.targetWords
        : DEFAULT_GOAL.targetWords;
    const history =
      stored.history && typeof stored.history === 'object' && !Array.isArray(stored.history)
        ? (stored.history as Record<string, number>)
        : {};
    return { targetWords, history };
  },

  saveDailyGoal(goal: DailyGoalState): boolean {
    return safeWrite(KEYS.GOAL, goal);
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
      projectId: safeReadRaw(KEYS.LAST_PROJECT_ID),
      chapterId: safeReadRaw(KEYS.LAST_CHAPTER_ID),
    };
  },

  saveLastSelection(projectId: string | null, chapterId: string | null): void {
    try {
      if (projectId) window.localStorage.setItem(KEYS.LAST_PROJECT_ID, projectId);
      else window.localStorage.removeItem(KEYS.LAST_PROJECT_ID);
      if (chapterId) window.localStorage.setItem(KEYS.LAST_CHAPTER_ID, chapterId);
      else window.localStorage.removeItem(KEYS.LAST_CHAPTER_ID);
    } catch {
      // Ignore blocked storage
    }
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
  ): boolean {
    return safeWrite(KEYS.DRAFTS_PREFIX + chapterId, draft);
  },

  clearChapterDraft(chapterId: string): void {
    safeRemove(KEYS.DRAFTS_PREFIX + chapterId);
  },

  // Guest / Offline local projects & chapters
  getLocalProjects(): StoryProject[] {
    const list = safeRead<StoryProject[] | null>(KEYS.LOCAL_PROJECTS, null);
    if (Array.isArray(list) && list.length > 0) return list;
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

  saveLocalProjects(projects: StoryProject[]): boolean {
    return safeWrite(KEYS.LOCAL_PROJECTS, projects);
  },

  getLocalChapters(projectId: string): StoryChapter[] {
    const list = safeRead<StoryChapter[] | null>(KEYS.LOCAL_CHAPTERS_PREFIX + projectId, null);
    return Array.isArray(list) ? list : [];
  },

  saveLocalChapters(projectId: string, chapters: StoryChapter[]): boolean {
    return safeWrite(KEYS.LOCAL_CHAPTERS_PREFIX + projectId, chapters);
  },

  // Project Outline (Story Bible + per-chapter outline frames)
  getProjectOutline(projectId: string): ProjectOutline {
    const stored = safeRead<Partial<ProjectOutline> | null>(KEYS.OUTLINE_PREFIX + projectId, null);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return { ...EMPTY_PROJECT_OUTLINE, chapters: {} };
    }
    const chaptersMap =
      stored.chapters && typeof stored.chapters === 'object' && !Array.isArray(stored.chapters)
        ? (stored.chapters as Record<string, ChapterOutline>)
        : {};
    return {
      worldSetting: typeof stored.worldSetting === 'string' ? stored.worldSetting : '',
      writingStyle: typeof stored.writingStyle === 'string' ? stored.writingStyle : '',
      storyFramework: typeof stored.storyFramework === 'string' ? stored.storyFramework : '',
      storyLogic: typeof stored.storyLogic === 'string' ? stored.storyLogic : '',
      characterOverview: typeof stored.characterOverview === 'string' ? stored.characterOverview : '',
      chapters: chaptersMap,
      updatedAt: typeof stored.updatedAt === 'number' ? stored.updatedAt : undefined,
    };
  },

  saveProjectOutline(projectId: string, outline: ProjectOutline): boolean {
    return safeWrite(KEYS.OUTLINE_PREFIX + projectId, outline);
  },

  // Chapter Draft Versions (v1, v2, v3... saved persistently so user can resume anytime)
  getChapterDraftVersions(chapterId: string): ChapterDraftStore {
    const stored = safeRead<Partial<ChapterDraftStore> | null>(
      KEYS.CHAPTER_VERSIONS_PREFIX + chapterId,
      null
    );
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return { activeVersionId: null, versions: [] };
    }
    const versions = Array.isArray(stored.versions)
      ? stored.versions.filter(
          (v) =>
            v &&
            typeof v === 'object' &&
            typeof v.id === 'string' &&
            typeof v.versionNumber === 'number' &&
            typeof v.content === 'string'
        )
      : [];
    const latestId = versions.length > 0 ? versions[versions.length - 1].id : null;
    const activeVersionId =
      typeof stored.activeVersionId === 'string' &&
      versions.some((v) => v.id === stored.activeVersionId)
        ? stored.activeVersionId
        : latestId;
    return { activeVersionId, versions };
  },

  saveChapterDraftVersions(chapterId: string, store: ChapterDraftStore): boolean {
    return safeWrite(KEYS.CHAPTER_VERSIONS_PREFIX + chapterId, store);
  },

  clearChapterDraftVersions(chapterId: string): void {
    safeRemove(KEYS.CHAPTER_VERSIONS_PREFIX + chapterId);
  },
};
