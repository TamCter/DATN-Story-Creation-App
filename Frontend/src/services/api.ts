import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Tự động xác định địa chỉ IP máy chủ Backend phù hợp với từng môi trường:
 * - Web: http://localhost:5000/api
 * - Thiết bị thật (Expo Go qua WiFi): http://<IP_MÁY_TÍNH>:5000/api
 * - Android Emulator: http://10.0.2.2:5000/api
 */
export function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Nếu đang mở trên Web trình duyệt trên máy tính
  if (Platform.OS === 'web') {
    return 'http://localhost:5000/api';
  }

  // Lấy IP của máy chủ chạy Expo (máy tính của bạn trên mạng WiFi)
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

  // Fallback cho Android Emulator
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }

  return 'http://192.168.1.189:5000/api';
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
        throw new Error(errorMsg);
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
}

export const api = new ApiService();
