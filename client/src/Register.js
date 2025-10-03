import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Auth.css';
import MeteorBg from './MeteorBg';

function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef(null); // hidden button container
  const clickProxyRef = useRef(null); // custom styled button
  // Initialize Google Identity (hidden official button, custom proxy)
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
            setGoogleLoading(true);
            setMessage('Đang xử lý Google...');
            try {
              const r = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential })
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.message || 'Đăng ký Google thất bại');
              // Tuỳ chỉnh thông báo cho trang Đăng ký: nếu đã tồn tại hiển thị rõ ràng
              if (data.created) {
                setMessage(data.message || 'Tạo tài khoản thành công');
                // Chỉ tự đăng nhập và chuyển trang nếu vừa tạo mới
                if (data.user) {
                  try {
                    localStorage.setItem('hmsUser', JSON.stringify(data.user));
                    window.dispatchEvent(new Event('hms-auth-change'));
                  } catch {}
                }
                navigate('/');
              } else {
                // Không tự đăng nhập nếu tài khoản đã tồn tại (trên trang Đăng ký)
                setMessage('Tài khoản đã tồn tại. Vui lòng chuyển sang trang Đăng nhập.');
              }
            } catch (e) {
              setError(e.message);
              setMessage('');
            } finally {
              setGoogleLoading(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, { theme: 'outline', size: 'large', width: 240 });
        // Ẩn button thật
        googleBtnRef.current.style.position = 'absolute';
        googleBtnRef.current.style.opacity = 0;
        googleBtnRef.current.style.pointerEvents = 'none';
        googleBtnRef.current.style.width = '0px';
        googleBtnRef.current.style.height = '0px';
        setGoogleReady(true);
      } catch {/* ignore */}
    };
    if (window.google) init(); else {
      const t = setTimeout(init, 500); return () => clearTimeout(t);
    }
  }, [navigate]);

  const handleGoogleCustomClick = () => {
    const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID || window.GOOGLE_CLIENT_ID;
    if (!clientId) { setError('Chưa cấu hình Google Client ID'); return; }
    setError('');
    setMessage('Đang mở Google...');
    setGoogleLoading(true);
    try {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.prompt((notification) => {
          // notification.isNotDisplayed() -> reasons (browser blocking, third-party cookies, etc.)
          try {
            if (notification && notification.isNotDisplayed && notification.isNotDisplayed()) {
              const reason = notification.getNotDisplayedReason && notification.getNotDisplayedReason();
              // Fallback: click hidden button
              const btn = googleBtnRef.current && googleBtnRef.current.querySelector('div[role=button]');
              if (btn) btn.click();
              setMessage('');
              setError('Không hiển thị được popup Google (reason: ' + reason + '). Thử lại hoặc bật cookie bên thứ ba.');
              setGoogleLoading(false);
            } else if (notification && notification.isSkipped && notification.isSkipped()) {
              setMessage('');
              setError('Bạn đã bỏ qua đăng nhập Google.');
              setGoogleLoading(false);
            } else if (notification && notification.isDismissedMoment && notification.isDismissedMoment()) {
              setMessage('');
              setError('Đã đóng hộp thoại Google.');
              setGoogleLoading(false);
            }
          } catch {/* ignore */}
        });
      } else if (googleBtnRef.current) {
        const btn = googleBtnRef.current.querySelector('div[role=button]');
        if (btn) btn.click();
      }
    } catch {/* ignore */} finally {
      // Không dừng loading ở đây vì callback thực thi sẽ dừng. Nếu prompt không hiển thị sẽ bị xử lý trong notification.
      setTimeout(() => {
        if (googleLoading) {
          // timeout safety
          setGoogleLoading(false);
        }
      }, 8000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp!');
      return;
    }
    try {
      const res = await fetch('http://localhost:5000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Đăng ký thất bại');
      setMessage(data.message);
      // Xóa dữ liệu trong các ô input sau khi đăng ký thành công
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <MeteorBg />
      <div className="auth-container">
        <div className="snake-border-top"></div>
        <div className="snake-border-bottom"></div>
        <h2>ĐĂNG KÝ</h2>
        <form onSubmit={handleSubmit}>
        <label>Họ tên</label>
        <input type="text" placeholder="Họ tên" value={name} onChange={e => setName(e.target.value)} required />
        <label>Email</label>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <label>Mật khẩu</label>
        <div className="password-field">
          <input type={showPassword ? 'text' : 'password'} placeholder="Mật khẩu" value={password} onChange={e => setPassword(e.target.value)} required />
          <span className="toggle-password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ẩn' : 'Hiện'}</span>
        </div>
        <label>Xác nhận mật khẩu</label>
        <div className="password-field">
          <input type={showConfirmPassword ? 'text' : 'password'} placeholder="Xác nhận mật khẩu" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
          <span className="toggle-password" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>{showConfirmPassword ? 'Ẩn' : 'Hiện'}</span>
        </div>
        <button className="btn-primary" type="submit">Tiếp tục</button>
      </form>
      {error && <div className="error-msg">{error}</div>}
      {message && <div className="success-msg">{message}</div>}
      <div className="or">hoặc tiếp tục với</div>
      {googleLoading && (
        <div style={{background:'#eef8ff',padding:'8px',fontSize:'13px',textAlign:'center',marginBottom:'8px'}}>
          Đang chờ Google...
        </div>
      )}
      <button
        type="button"
        ref={clickProxyRef}
        onClick={handleGoogleCustomClick}
        className="btn-google"
        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
      >
        <img src="/google_login.png" alt="Google" /> Google
      </button>
      <div ref={googleBtnRef} aria-hidden="true" />
      {!googleReady && (process.env.REACT_APP_GOOGLE_CLIENT_ID || window.GOOGLE_CLIENT_ID) && (
        <div style={{fontSize:'12px',color:'#777',textAlign:'center',marginTop:'4px'}}>Đang tải Google...</div>
      )}
      {!process.env.REACT_APP_GOOGLE_CLIENT_ID && !window.GOOGLE_CLIENT_ID && (
        <div style={{fontSize:'12px',color:'#888',textAlign:'center',marginBottom:'8px'}}>
          (Chưa cấu hình Google Client ID - thêm REACT_APP_GOOGLE_CLIENT_ID vào .env)
        </div>
      )}
      <div className="auth-links">
        <span>Bạn đã có tài khoản?</span>
        <Link to="/login">Đăng nhập</Link>
      </div>
      </div>
    </>
  );
}

export default Register;
