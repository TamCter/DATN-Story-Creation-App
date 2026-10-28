import Constants from 'expo-constants';
import { Platform } from 'react-native';

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Tự động xác định địa chỉ IP máy chủ Backend phù hợp với từng môi trường:
 * - Web: http://localhost:5000/api
 * - Thiết bị thật (Expo Go qua WiFi): http://<IP_MÁY_TÍNH>:5000/api
 * - Android Emulator (chỉ khi __DEV__): http://10.0.2.2:5000/api
 */
export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Trong môi trường Release / Production, yêu cầu cấu hình rõ ràng EXPO_PUBLIC_API_URL
  if (!__DEV__) {
    throw new Error(
      'Biến môi trường EXPO_PUBLIC_API_URL chưa được cấu hình cho bản Release.'
    );
  }

  // Nếu đang mở trên Web trình duyệt trên máy tính
  if (Platform.OS === 'web') {
    return 'http://localhost:5000/api';
  }

  // Lấy IP của máy chủ chạy Expo (máy tính trên mạng WiFi khi phát triển)
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:5000/api`;
    }
  }

  // Fallback cho Android Emulator trong môi trường phát triển (__DEV__)
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }

  return 'http://localhost:5000/api';
}

export const API_BASE_URL = getApiBaseUrl();

export interface AuthUser {
  id: string;
  penName: string;
  email: string;
  createdAt?: number;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    user: AuthUser;
    token: string;
  };
}

export interface UserResponse {
  success: boolean;
  message?: string;
  data?: {
    user: AuthUser;
  };
}

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Thiết lập timeout 12 giây để không bị treo màn hình nếu kết nối bị kẹt
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      console.log(`[API] 📡 ${options.method || 'GET'} ${url}`);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          data?.message ||
          `Yêu cầu thất bại với mã lỗi HTTP ${response.status}`;
        throw new ApiError(errorMsg, response.status);
      }

      return data as T;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(
          `Yêu cầu tới máy chủ quá thời gian chờ (12s). Vui lòng kiểm tra kết nối mạng hoặc thử lại.`
        );
      }

      if (
        error.message?.includes('Network request failed') ||
        error.message?.includes('Failed to fetch')
      ) {
        throw new Error(
          `Không thể kết nối đến máy chủ Backend tại: ${API_BASE_URL}\n👉 Hãy đảm bảo máy tính và điện thoại dùng chung mạng WiFi.`
        );
      }
      throw error;
    }
  }

  // Auth APIs
  async register(payload: {
    penName: string;
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async login(payload: {
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async guestLogin(): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/guest', {
      method: 'POST',
    });
  }

  async getMe(): Promise<UserResponse> {
    return this.request<UserResponse>('/auth/me', {
      method: 'GET',
    });
  }

  // Projects APIs
  async getProjects(): Promise<{ success: boolean; data: any[]; count: number }> {
    return this.request<{ success: boolean; data: any[]; count: number }>('/projects', {
      method: 'GET',
    });
  }

  async createProject(payload: {
    title: string;
    genre?: string;
    number?: string;
    desc?: string;
  }): Promise<{ success: boolean; data: any; message?: string }> {
    return this.request<{ success: boolean; data: any; message?: string }>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteProject(id: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/projects/${id}`, {
      method: 'DELETE',
    });
  }

  // Node & Graph APIs
  async getProject(projectId: string): Promise<{ success: boolean; data: any; message?: string }> {
    return this.request<{ success: boolean; data: any; message?: string }>(`/projects/${projectId}`, {
      method: 'GET',
    });
  }

  async getProjectGraph(projectId: string): Promise<{
    success: boolean;
    data: {
      project: any;
      nodes: any[];
      links: any[];
      chapters?: any[];
      stats?: any;
    };
    message?: string;
  }> {
    return this.request<{
      success: boolean;
      data: {
        project: any;
        nodes: any[];
        links: any[];
        chapters?: any[];
        stats?: any;
      };
      message?: string;
    }>(`/projects/${projectId}/graph`, {
      method: 'GET',
    });
  }

  async getProjectNodes(
    projectId: string,
    query?: { type?: string; search?: string }
  ): Promise<{ success: boolean; data: any[]; count: number; message?: string }> {
    const params = new URLSearchParams();
    if (query?.type) params.append('type', query.type);
    if (query?.search) params.append('search', query.search);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ success: boolean; data: any[]; count: number; message?: string }>(
      `/projects/${projectId}/nodes${queryString}`,
      {
        method: 'GET',
      }
    );
  }

  async createNode(
    projectId: string,
    payload: any
  ): Promise<{ success: boolean; data: any; message?: string }> {
    return this.request<{ success: boolean; data: any; message?: string }>(
      `/projects/${projectId}/nodes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  async getNode(nodeId: string): Promise<{ success: boolean; data: any; message?: string }> {
    return this.request<{ success: boolean; data: any; message?: string }>(`/nodes/${nodeId}`, {
      method: 'GET',
    });
  }

  async updateNode(
    nodeId: string,
    payload: any
  ): Promise<{ success: boolean; data: any; message?: string }> {
    return this.request<{ success: boolean; data: any; message?: string }>(`/nodes/${nodeId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteNode(nodeId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/nodes/${nodeId}`, {
      method: 'DELETE',
    });
  }

  // Link APIs
  async createLink(payload: {
    id?: string;
    source: string;
    target: string;
    label?: string;
    type?: string;
    category?: string;
    contextNote?: string;
    tone?: string;
  }): Promise<{ success: boolean; data: any; message?: string }> {
    return this.request<{ success: boolean; data: any; message?: string }>('/links', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteLink(linkId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/links/${linkId}`, {
      method: 'DELETE',
    });
  }

  // Chapter APIs
  async getChapters(projectId: string): Promise<{ success: boolean; data: any[]; count: number; message?: string }> {
    return this.request<{ success: boolean; data: any[]; count: number; message?: string }>(
      `/projects/${projectId}/chapters`,
      { method: 'GET' }
    );
  }

  async createChapter(
    projectId: string,
    payload: {
      chapterNumber?: number;
      title: string;
      desc?: string;
      events?: any[];
    }
  ): Promise<{ success: boolean; data: any; message?: string }> {
    return this.request<{ success: boolean; data: any; message?: string }>(
      `/projects/${projectId}/chapters`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  async updateChapter(
    chapterId: string,
    payload: any
  ): Promise<{ success: boolean; data: any; message?: string }> {
    return this.request<{ success: boolean; data: any; message?: string }>(
      `/chapters/${chapterId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  }

  async deleteChapter(chapterId: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/chapters/${chapterId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiService();
