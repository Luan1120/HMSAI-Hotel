import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import './HomePage.css';

export default function ReviewForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const bookingId = params.get('bookingId') || '';
  const hotel = params.get('hotel') || '';
  const roomType = params.get('roomType') || '';
  const checkIn = params.get('ci') || '';
  const checkOut = params.get('co') || '';

  const [user, setUser] = useState(null);
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try { const u = localStorage.getItem('hmsUser'); if (u) setUser(JSON.parse(u)); } catch {}
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const submit = async () => {
    if (!rating || !email || !name) return;
    setSubmitting(true);
    try {
      // Placeholder: in future, POST to /api/reviews
      await new Promise(r => setTimeout(r, 500));
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="home-root" style={{ paddingTop: 80 }}>
      <header className="home-header" style={{ position: 'sticky', top: 0 }}>
        <div className="home-header-left">
          <img src="/logo.png" alt="logo" className="home-header-logo" />
          <Link to="/" className="home-header-title home-header-home-btn">TRANG CHỦ</Link>
        </div>
        <div className="home-header-icons">
          <Link to="/login" className="home-header-icon" title="Đăng nhập">
            <img src="/icon-user.png" alt="user" className="home-header-icon-img" />
          </Link>
        </div>
      </header>

      <div style={{ padding: '16px 12px' }}>
        <div className="ph-table" style={{ padding: 16 }}>
          <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Đánh giá dịch vụ</h2>
          <div style={{ color: '#444', marginBottom: 10 }}>
            <div>Khách sạn: <b>{hotel || '—'}</b></div>
            <div>Phòng: <b>{roomType || '—'}</b> ({fmtDate(checkIn)} – {fmtDate(checkOut)})</div>
          </div>

          <div style={{ margin: '8px 0' }}>Chọn số sao của bạn:</div>
          <StarRow value={rating} onChange={setRating} />

          <div style={{ marginTop: 10 }}>Nhận xét của bạn:</div>
          <textarea
            className="rv-textarea"
            placeholder="Chia sẻ trải nghiệm dịch vụ..."
            rows={6}
            value={comment}
            onChange={(e)=>setComment(e.target.value)}
          />

          <div className="rv-field">
            <label>Tên của bạn:</label>
            <input type="text" placeholder="Nhập tên" value={name} onChange={(e)=>setName(e.target.value)} />
          </div>
          <div className="rv-field">
            <label>Email:</label>
            <input type="email" placeholder="Nhập email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          </div>

          <div style={{ marginTop: 10 }}>
            <button className="ph-btn" disabled={submitting || !name || !email || !rating} onClick={submit}>
              {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
            </button>
            {done && <span style={{ marginLeft: 10, color: '#0b7a30', fontWeight: 700 }}>Cảm ơn bạn đã đánh giá!</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StarRow({ value, onChange }) {
  return (
    <div className="rv-stars" role="radiogroup" aria-label="Chọn số sao">
      {[1,2,3,4,5].map(n => (
        <button
          key={n}
          type="button"
          className={`rv-star ${n <= value ? 'on' : ''}`}
          aria-checked={n===value}
          role="radio"
          onClick={()=>onChange(n)}
        >★</button>
      ))}
    </div>
  );
}

function fmtDate(d){ if(!d) return '—'; const dt=new Date(d); const dd=String(dt.getDate()).padStart(2,'0'); const mm=String(dt.getMonth()+1).padStart(2,'0'); const yy=dt.getFullYear(); return `${dd}/${mm}/${yy}`; }
