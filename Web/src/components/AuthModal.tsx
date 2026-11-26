import React, { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { webApi } from '../services/api';
import type { AuthUser } from '../types/story';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (token: string, user: AuthUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose, onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [penName, setPenName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await webApi.login(email.trim(), password)
          : await webApi.register(penName.trim(), email.trim(), password);

      if (!res.success || !res.data?.token || !res.data?.user) {
        setError(res.message || 'Xác thực không thành công.');
        return;
      }

      onAuthenticated(res.data.token, res.data.user);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra khi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="brand-title">
            <BookOpen size={18} />
            <span>{mode === 'login' ? 'Đăng nhập đồng bộ' : 'Tạo tài khoản tác giả'}</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={16} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 16 }}>
          Dùng chung tài khoản với app mobile để đồng bộ dự án, chương truyện, nhân vật và sử dụng trợ lý AI.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mode === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
                Bút danh
              </label>
              <input
                className="text-input"
                type="text"
                required
                value={penName}
                onChange={(e) => setPenName(e.target.value)}
                placeholder="VD: Minh Nhật"
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Email
            </label>
            <input
              className="text-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="author@example.com"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-secondary)' }}>
              Mật khẩu
            </label>
            <input
              className="text-input"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ít nhất 6 ký tự"
            />
          </div>

          {error && (
            <div style={{ fontSize: 12.5, color: 'var(--danger)', padding: '6px 8px', borderRadius: 6, background: 'var(--bg-elevated)' }}>
              {error}
            </div>
          )}

          <button className="primary-btn" type="submit" disabled={loading} style={{ marginTop: 6, height: 38 }}>
            {loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 12.5 }}>
          <button
            className="icon-btn"
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          </button>
          <button className="icon-btn" type="button" onClick={onClose}>
            Viết ngoại tuyến
          </button>
        </div>
      </div>
    </div>
  );
};
