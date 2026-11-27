import type {
  AuthUser,
  ChapterAnalysisResult,
  StoryChapter,
  StoryLink,
  StoryNode,
  StoryProject,
} from '../types/story';

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://localhost:5000/api';

export class ApiError extends Error {
  status?: number;
  isNetworkError?: boolean;

  constructor(message: string, status?: number, isNetworkError = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}

class WebApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs = 20000
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new ApiError(
          data?.message || `Yêu cầu thất bại (HTTP ${response.status})`,
          response.status
        );
      }

      return data as T;
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      if (timedOut || (err instanceof DOMException && err.name === 'AbortError')) {
        throw new ApiError(
          `Máy chủ phản hồi quá lâu (${Math.round(timeoutMs / 1000)}s). Vui lòng thử lại.`,
          undefined,
          true
        );
      }
      throw new ApiError(
        `Không thể kết nối tới Backend (${API_BASE_URL}). Bản thảo vẫn đang được lưu cục bộ.`,
        undefined,
        true
      );
    } finally {
      window.clearTimeout(timer);
    }
  }

  // Auth
  async login(email: string, password: string) {
    return this.request<{
      success: boolean;
      message?: string;
      data?: { user: AuthUser; token: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(penName: string, email: string, password: string) {
    return this.request<{
      success: boolean;
      message?: string;
      data?: { user: AuthUser; token: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ penName, email, password }),
    });
  }

  async getMe() {
    return this.request<{
      success: boolean;
      data?: { user: AuthUser };
    }>('/auth/me', { method: 'GET' });
  }

  // Projects
  async getProjects() {
    return this.request<{ success: boolean; data: StoryProject[] }>('/projects', {
      method: 'GET',
    });
  }

  async createProject(payload: { title: string; genre?: string; summary?: string }) {
    return this.request<{ success: boolean; data: StoryProject }>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getProjectGraph(projectId: string) {
    return this.request<{
      success: boolean;
      data: { nodes: StoryNode[]; links: StoryLink[]; chapters?: StoryChapter[] };
    }>(`/projects/${encodeURIComponent(projectId)}/graph`, { method: 'GET' });
  }

  // Nodes
  async createNode(projectId: string, payload: Record<string, unknown>) {
    return this.request<{ success: boolean; data: StoryNode; message?: string }>(
      `/projects/${encodeURIComponent(projectId)}/nodes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  async updateNode(nodeId: string, payload: Record<string, unknown>) {
    return this.request<{ success: boolean; data: StoryNode; message?: string }>(
      `/nodes/${encodeURIComponent(nodeId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  }

  // Chapters
  async getChapters(projectId: string) {
    return this.request<{ success: boolean; data: StoryChapter[] }>(
      `/projects/${encodeURIComponent(projectId)}/chapters`,
      { method: 'GET' }
    );
  }

  async createChapter(
    projectId: string,
    payload: {
      chapterNumber: number;
      title: string;
      desc?: string;
      content?: string;
    }
  ) {
    return this.request<{ success: boolean; data: StoryChapter }>(
      `/projects/${encodeURIComponent(projectId)}/chapters`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  async updateChapter(
    chapterId: string,
    payload: Partial<Pick<StoryChapter, 'chapterNumber' | 'title' | 'desc' | 'content'>>
  ) {
    return this.request<{ success: boolean; data: StoryChapter }>(
      `/chapters/${encodeURIComponent(chapterId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  }

  async deleteChapter(chapterId: string) {
    return this.request<{ success: boolean; message?: string }>(
      `/chapters/${encodeURIComponent(chapterId)}`,
      { method: 'DELETE' }
    );
  }

  // AI Tools
  async analyzeChapterText(payload: {
    projectTitle: string;
    chapterNumber?: number;
    chapterTitle?: string;
    chapterText: string;
    nodes?: StoryNode[];
    links?: StoryLink[];
    chapters?: StoryChapter[];
  }) {
    return this.request<{ success: boolean; data: ChapterAnalysisResult; message?: string }>(
      '/ai/analyze-chapter',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      620000
    );
  }

  async chatWithAI(payload: {
    mode?: 'web_writing';
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    projectContext?: {
      projectId?: string;
      projectTitle?: string;
      chapterNumber?: number;
      chapterTitle?: string;
      chapterDesc?: string;
      nodes?: StoryNode[];
    };
  }) {
    return this.request<{
      success: boolean;
      data: {
        message: string;
        suggestedPrompt?: string | null;
      };
      message?: string;
    }>(
      '/ai/chat',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      120000
    );
  }
}

export const webApi = new WebApiClient();
