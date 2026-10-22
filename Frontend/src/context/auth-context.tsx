import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { api, ApiError, AuthUser } from '@/services/api';

const TOKEN_KEY = '@story_app_auth_token';
const USER_KEY = '@story_app_auth_user';

async function getStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function setStoredToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

async function removeStoredToken(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (penName: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  guestLogin: () => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Khởi tạo và khôi phục phiên đăng nhập từ Storage khi mở app
  useEffect(() => {
    async function restoreSession() {
      try {
        const [savedToken, savedUserJson] = await Promise.all([
          getStoredToken(),
          AsyncStorage.getItem(USER_KEY),
        ]);

        if (savedToken && savedUserJson) {
          const parsedUser = JSON.parse(savedUserJson) as AuthUser;
          setToken(savedToken);
          setUser(parsedUser);
          api.setToken(savedToken);

          // Kiểm tra ngầm lại token với backend nếu cần
          try {
            const meRes = await api.getMe();
            if (meRes?.data?.user) {
              setUser(meRes.data.user);
              await AsyncStorage.setItem(USER_KEY, JSON.stringify(meRes.data.user));
            }
          } catch (err: any) {
            // Chỉ xóa token và thông tin phiên khi nhận mã lỗi 401 hoặc 403 (token hết hạn / không hợp lệ).
            // Nếu do lỗi mạng hoặc timeout, giữ lại phiên ngoại tuyến đã khôi phục.
            const status = err?.status;
            if (status === 401 || status === 403) {
              setToken(null);
              setUser(null);
              api.setToken(null);
              await Promise.all([
                removeStoredToken(),
                AsyncStorage.removeItem(USER_KEY),
              ]);
            }
          }
        }
      } catch (err) {
        console.warn('Lỗi khôi phục phiên đăng nhập:', err);
      } finally {
        setIsLoading(false);
      }
    }

    void restoreSession();
  }, []);

  const saveSession = async (newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    api.setToken(newToken);
    try {
      await Promise.all([
        setStoredToken(newToken),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser)),
      ]);
    } catch (err) {
      console.warn('Lỗi lưu phiên vào Storage:', err);
    }
  };

  const login = async (email: string, password: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await api.login({ email, password });
      if (res.success && res.data) {
        await saveSession(res.data.token, res.data.user);
        return { success: true, message: res.message };
      }
      const msg = res.message || 'Đăng nhập không thành công.';
      setError(msg);
      return { success: false, message: msg };
    } catch (err: any) {
      const msg = err.message || 'Đăng nhập thất bại. Vui lòng thử lại.';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsSubmitting(false);
    }
  };

  const register = async (penName: string, email: string, password: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await api.register({ penName, email, password });
      if (res.success && res.data) {
        await saveSession(res.data.token, res.data.user);
        return { success: true, message: res.message };
      }
      const msg = res.message || 'Đăng ký không thành công.';
      setError(msg);
      return { success: false, message: msg };
    } catch (err: any) {
      const msg = err.message || 'Đăng ký thất bại. Vui lòng thử lại.';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsSubmitting(false);
    }
  };

  const guestLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await api.guestLogin();
      if (res.success && res.data) {
        await saveSession(res.data.token, res.data.user);
        return { success: true, message: res.message };
      }
      const msg = res.message || 'Đăng nhập tài khoản mẫu không thành công.';
      setError(msg);
      return { success: false, message: msg };
    } catch (err: any) {
      const msg = err.message || 'Không thể đăng nhập tài khoản mẫu.';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setIsSubmitting(false);
    }
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    api.setToken(null);
    setError(null);
    try {
      await Promise.all([
        removeStoredToken(),
        AsyncStorage.removeItem(USER_KEY),
      ]);
    } catch (err) {
      console.warn('Lỗi xóa session:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isSubmitting,
        error,
        isAuthenticated: !!token && !!user,
        login,
        register,
        guestLogin,
        logout,
        clearError,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
