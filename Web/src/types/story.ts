export interface AuthUser {
  id: string;
  penName: string;
  email: string;
  createdAt?: number;
}

export interface StoryProject {
  id: string;
  title: string;
  genre?: string;
  summary?: string;
  desc?: string;
  createdAt?: number;
  updatedAt?: number;
  isLocalOnly?: boolean;
}

export interface StoryChapter {
  id: string;
  projectId?: string;
  chapterNumber: number;
  code?: string;
  title: string;
  shortTitle?: string;
  desc?: string;
  content: string;
  events?: unknown[];
  createdAt?: number;
  updatedAt?: number;
  isLocalOnly?: boolean;
  dirty?: boolean;
}

export type StoryNodeType = 'character' | 'item' | 'location' | 'faction' | 'event';

export interface StoryNode {
  id: string;
  name: string;
  type: StoryNodeType;
  role?: string;
  desc?: string;
  status?: string;
  gender?: string;
  dob?: string;
  age?: string;
  birthplace?: string;
  weapon?: string;
  sect?: string;
  personality?: string;
  statusEvent?: string;
  rarity?: string;
  origin?: string;
  element?: string;
  holderOrLocation?: string;
  region?: string;
  climate?: string;
  terrain?: string;
  dangerLevel?: string;
  ruler?: string;
  subType?: string;
  alignment?: string;
  leader?: string;
  seniorMembers?: string;
  members?: string;
  subFactions?: string;
  headquarters?: string;
  motto?: string;
  chapter?: string;
  time?: string;
  location?: string;
  eventType?: string;
  importance?: string;
  arcName?: string;
  cause?: string;
  conflict?: string;
  outcome?: string;
  consequences?: string;
  impact?: string;
  charactersInvolved?: string;
  itemsInvolved?: string;
  factionsInvolved?: string;
}

export interface StoryLink {
  id: string;
  source: string;
  target: string;
  label?: string;
  category?: string;
}

export interface ChapterAnalysisIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  title: string;
  quote: string;
  explanation: string;
  suggestion: string;
  suggestedRewrite?: string;
  relatedEntities?: string[];
}

export interface ChapterAnalysisResult {
  chapterNumber?: number;
  summary: string;
  issues: ChapterAnalysisIssue[];
  suggestedNodes: Array<{
    type: 'character' | 'item' | 'location' | 'faction';
    name: string;
    role?: string;
    desc?: string;
    status?: string;
    gender?: string;
    dob?: string;
    age?: string;
    birthplace?: string;
    weapon?: string;
    sect?: string;
    personality?: string;
    rarity?: string;
    origin?: string;
    element?: string;
    holderOrLocation?: string;
    region?: string;
    climate?: string;
    terrain?: string;
    dangerLevel?: string;
    ruler?: string;
    subType?: string;
    alignment?: string;
    leader?: string;
    headquarters?: string;
    motto?: string;
  }>;
  suggestedEvents: Array<{
    name: string;
    desc: string;
    eventType?: string;
    importance?: string;
    arcName?: string;
    sequenceOrder?: string;
    location?: string;
    time?: string;
    timelineType?: string;
    duration?: string;
    cause?: string;
    conflict?: string;
    outcome?: string;
    consequences?: string;
    impact?: string;
    characterRoles?: string;
    itemsInvolved?: string[];
    factionsInvolved?: string[];
    charactersInvolved?: string[];
  }>;
  characterStatusChanges: Array<{
    characterName: string;
    status: 'Đã chết' | 'Hồi sinh';
    statusEvent?: string;
    reason?: string;
  }>;
  model?: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  chapterId?: string;
}

export type EditorTheme = 'sepia' | 'light' | 'dark';
export type PaperStyle = 'auto' | 'white' | 'sepia';
export type EditorFont = 'serif' | 'sans' | 'mono';
export type PageWidthMode = 'narrow' | 'medium' | 'wide';

export interface EditorPreferences {
  theme: EditorTheme;
  paperStyle: PaperStyle;
  font: EditorFont;
  fontSize: number;
  lineHeight: number;
  pageWidth: PageWidthMode;
  tabIndent: boolean;
}

export interface DailyGoalState {
  targetWords: number;
  /** Map YYYY-MM-DD -> words added that day */
  history: Record<string, number>;
}

export type WorkspaceMode = 'outline' | 'draft' | 'manuscript';

export interface ChapterOutline {
  setting: string;
  style: string;
  characters: string;
  roughEvents: string;
  logicNotes: string;
  updatedAt?: number;
}

export interface ProjectOutline {
  worldSetting: string;
  writingStyle: string;
  storyFramework: string;
  storyLogic: string;
  characterOverview: string;
  chapters: Record<string, ChapterOutline>;
  updatedAt?: number;
}

export interface ChapterDraftVersion {
  id: string;
  versionNumber: number;
  label: string;
  source: 'ai' | 'ai-rewrite' | 'user';
  instruction?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChapterDraftStore {
  activeVersionId: string | null;
  versions: ChapterDraftVersion[];
}
