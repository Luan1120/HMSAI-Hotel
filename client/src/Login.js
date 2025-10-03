import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Auth.css';
import './UniverseBg.css';
import UniverseBg from './UniverseBg';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const googleBtnRef = useRef(null);

  // Initialize Google One Tap / button
  useEffect(() => {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID || window.GOOGLE_CLIENT_ID;
    if (!clientId) return; // not configured
    const init = () => {
      if (!window.google || !window.google.accounts || !googleBtnRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response || !response.credential) return;
            setError('');
            setMessage('Đang xác thực Google...');
            try {
              const r = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential })
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.message || 'Đăng nhập Google thất bại');
              setMessage(data.message || 'Đăng nhập thành công');
              if (data.user) {
                try {
                  localStorage.setItem('hmsUser', JSON.stringify(data.user));
                  window.dispatchEvent(new Event('hms-auth-change'));
                } catch {}
              }
              // redirect
              navigate('/');
            } catch (e) {
              setError(e.message);
              setMessage('');
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, { theme: 'outline', size: 'large', width: 320 });
      } catch (e) { /* ignore */ }
    };
    // Wait for script
    if (window.google) init();
    else {
      const id = setTimeout(init, 500);
      return () => clearTimeout(id);
    }
  }, [navigate]);

  // Helpers for per-email remembered passwords
  const getCredMap = () => {
    try {
      const raw = localStorage.getItem('hmsCredMap');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const saveCredMap = (map) => {
    try {
      localStorage.setItem('hmsCredMap', JSON.stringify(map));
    } catch {}
  };

  // One-time migration from old single-credential storage to map
  useEffect(() => {
    try {
      const remember = localStorage.getItem('hmsRemember');
      const credsRaw = localStorage.getItem('hmsCreds');
      if (remember === '1' && credsRaw) {
        const prev = JSON.parse(credsRaw);
        const key = (prev.email || '').trim().toLowerCase();
        if (key) {
          const map = getCredMap();
          map[key] = prev.password || '';
          saveCredMap(map);
        }
      }
      localStorage.removeItem('hmsRemember');
      localStorage.removeItem('hmsCreds');
    } catch {}
  }, []);

  // When email changes, auto-fill password if we have it saved for that email
  const handleEmailChange = (val) => {
    setEmail(val);
    const key = (val || '').trim().toLowerCase();
    const map = getCredMap();
    if (key && Object.prototype.hasOwnProperty.call(map, key)) {
      setPassword(map[key] || '');
      setRememberMe(true);
    } else {
      // Clear password when switching to an email we don't recognize
      setPassword('');
      setRememberMe(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await fetch('http://localhost:5000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Đăng nhập thất bại');
      setMessage(data.message);
      // Lưu thông tin người dùng để hiện tên ở user menu
      if (data.user) {
        try {
          let user = data.user;
          // If avatar missing, try to fetch profile for avatar enrichment
          if (!user.avatar && user.email) {
            try {
              const res2 = await fetch(`/api/users/profile?email=${encodeURIComponent(user.email)}&_=${Date.now()}`);
              if (res2.ok) {
                const j2 = await res2.json();
                if (j2 && j2.user && j2.user.avatar) user = { ...user, avatar: j2.user.avatar };
              }
            } catch {}
          }
          localStorage.setItem('hmsUser', JSON.stringify(user));
          // Thông báo cho các component khác (cùng tab) cập nhật
          window.dispatchEvent(new Event('hms-auth-change'));
        } catch {}
      }
      // Xử lý Nhớ mật khẩu theo email: chỉ lưu/ghi đè khi được tick
      try {
        const key = (email || '').trim().toLowerCase();
        if (key) {
          const map = getCredMap();
          if (rememberMe) map[key] = password; // không xóa nếu unchecked
          saveCredMap(map);
        }
      } catch {}
      // Xóa dữ liệu trong input sau khi đăng nhập thành công
      setEmail('');
      setPassword('');
      // Chuyển tới trang HomePage
      navigate('/');
      try { setTimeout(() => window.scrollTo(0, 0), 0); } catch {}
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{position:'relative', minHeight:'100vh', overflow:'hidden'}}>
      <UniverseBg />
      <div style={{position:'relative', zIndex:1}}>
        <div className="auth-container">
          <div className="snake-border-top"></div>
          <div className="snake-border-bottom"></div>
          <h2>ĐĂNG NHẬP</h2>
          <form onSubmit={handleSubmit}>
            <label>Email</label>
            <input type="email" placeholder="Nhập địa chỉ email" value={email} onChange={e => handleEmailChange(e.target.value)} required />
            <label>Mật khẩu</label>
            <div className="password-field">
              <input type={showPassword ? 'text' : 'password'} placeholder="Mật khẩu" value={password} onChange={e => setPassword(e.target.value)} required />
              <span className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? 'Ẩn' : 'Hiện'}
              </span>
            </div>
            <div className="auth-remember">
              <input
                id="rememberMe"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="rememberMe" className="auth-remember-label">Nhớ mật khẩu</label>
            </div>
            <button className="btn-primary" type="submit">Tiếp</button>
          </form>
          {error && <div className="error-msg">{error}</div>}
          {message && <div className="success-msg">{message}</div>}
          <div className="or">hoặc tiếp tục với</div>
          <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }} />
          {!process.env.REACT_APP_GOOGLE_CLIENT_ID && !window.GOOGLE_CLIENT_ID && (
            <div style={{fontSize:'12px',color:'#888',textAlign:'center',marginBottom:'8px'}}>
              (Chưa cấu hình Google Client ID - thêm REACT_APP_GOOGLE_CLIENT_ID vào .env)
            </div>
          )}
          <div className="auth-links">
            <Link className="auth-link" to="/forgot-password">Bạn quên mật khẩu?</Link>
            <Link className="auth-link" to="/register">Đăng ký</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
