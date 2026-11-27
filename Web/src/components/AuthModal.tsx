import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, X } from 'lucide-react';
import { webApi } from '../services/api';
import type { AuthUser } from '../types/story';

interface AuthModalProps {
  open: boolean;
  variant?: 'page' | 'modal';
  initialTab?: 'login' | 'register';
  onClose: () => void;
  onAuthenticated: (token: string, user: AuthUser) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  variant = 'modal',
  initialTab = 'login',
  onClose,
  onAuthenticated,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  const [penName, setPenName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const switchTab = (next: 'login' | 'register') => {
    setTab(next);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPenName = penName.trim();
    const cleanEmail = email.trim();

    if (tab === 'register' && !cleanPenName) {
      setError('Vui lòng nhập bút danh của bạn.');
      return;
    }
    if (!cleanEmail) {
      setError('Vui lòng nhập địa chỉ email.');
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setError('Địa chỉ email không hợp lệ (ví dụ: tacgia@storyapp.vn).');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải dài ít nhất 6 ký tự.');
      return;
    }
    if (tab === 'register' && password !== confirmPassword) {
      setError('Mật khẩu nhập lại không trùng khớp.');
      return;
    }

    setLoading(true);
    try {
      const res =
        tab === 'login'
          ? await webApi.login(cleanEmail, password)
          : await webApi.register(cleanPenName, cleanEmail, password);

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

  const panel = (
    <div className="auth-panel" onClick={(e) => e.stopPropagation()}>
      {/* Chòm sao trang trí giống màn hình đăng nhập trên App */}
      <svg className="auth-constellation" height="140" width="160" viewBox="0 0 160 140">
        <line x1="40" y1="30" x2="110" y2="45" stroke="rgba(229, 169, 60, 0.25)" strokeWidth="1" />
        <line x1="110" y1="45" x2="145" y2="20" stroke="rgba(229, 169, 60, 0.2)" strokeWidth="1" />
        <line x1="110" y1="45" x2="135" y2="90" stroke="rgba(229, 169, 60, 0.25)" strokeWidth="1" />
        <line x1="40" y1="30" x2="70" y2="105" stroke="rgba(229, 169, 60, 0.2)" strokeWidth="1" />
        <line x1="70" y1="105" x2="135" y2="90" stroke="rgba(229, 169, 60, 0.2)" strokeWidth="1" />
        <circle cx="40" cy="30" r="3" fill="#e5a93c" opacity="0.6" />
        <circle cx="110" cy="45" r="6" fill="#e5a93c" opacity="0.75" />
        <circle cx="110" cy="45" r="10" stroke="#e5a93c" strokeWidth="0.8" fill="none" opacity="0.3" />
        <circle cx="145" cy="20" r="2.5" fill="#e5a93c" opacity="0.5" />
        <circle cx="135" cy="90" r="3.5" fill="#e5a93c" opacity="0.6" />
        <circle cx="70" cy="105" r="3" fill="#e5a93c" opacity="0.4" />
      </svg>

      {variant === 'modal' && (
        <button
          className="icon-btn"
          style={{ position: 'absolute', top: 14, right: 14, zIndex: 2 }}
          onClick={onClose}
          aria-label="Đóng"
        >
          <X size={16} />
        </button>
      )}

      <div className="auth-badge">Creator Story · KHÔNG GIAN VIẾT WEB</div>
      <h1 className="auth-heading">
        Mỗi câu chuyện
        <br />
        là một <em>mạng lưới.</em>
      </h1>
      <p className="auth-subtitle">
        Đăng nhập bằng tài khoản trên app để đồng bộ dự án, chương truyện, nhân vật và viết tiếp mọi lúc trên trình duyệt.
      </p>

      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
          onClick={() => switchTab('login')}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
          onClick={() => switchTab('register')}
        >
          Đăng ký
        </button>
      </div>

      {error && (
        <div className="auth-error">
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tab === 'register' && (
          <input
            className="auth-input"
            type="text"
            value={penName}
            onChange={(e) => {
              setPenName(e.target.value);
              if (error) setError('');
            }}
            placeholder="Bút danh (tên hiển thị tác giả)"
            disabled={loading}
          />
        )}

        <input
          className="auth-input"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError('');
          }}
          placeholder="Email của bạn"
          disabled={loading}
        />

        <div className="auth-input-wrap">
          <input
            className="auth-input with-eye"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder={tab === 'register' ? 'Mật khẩu (tối thiểu 6 ký tự)' : 'Mật khẩu'}
            disabled={loading}
          />
          <button
            type="button"
            className="auth-eye-btn"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {tab === 'register' && (
          <div className="auth-input-wrap">
            <input
              className="auth-input with-eye"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder="Nhập lại mật khẩu"
              disabled={loading}
            />
            <button
              type="button"
              className="auth-eye-btn"
              onClick={() => setShowConfirmPassword((v) => !v)}
              aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        )}

        <button
          className="primary-btn"
          type="submit"
          disabled={loading}
          style={{ height: 44, marginTop: 4, fontSize: 14, borderRadius: 10 }}
        >
          {loading
            ? 'Đang xử lý...'
            : tab === 'login'
              ? 'Đăng nhập & đồng bộ với App'
              : 'Tạo tài khoản tác giả'}
        </button>
      </form>

      <div className="auth-divider">hoặc</div>

      <button
        type="button"
        className="icon-btn bordered"
        style={{ width: '100%', height: 38, justifyContent: 'center' }}
        onClick={onClose}
      >
        Viết nháp ngoại tuyến (chưa cần đăng nhập)
      </button>
    </div>
  );

  if (variant === 'page') {
    return <div className="auth-page">{panel}</div>;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {panel}
    </div>
  );
};
