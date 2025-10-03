import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Profile.css';

export default function Profile({ isModal = false, onClose }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    birthDate: '',
    country: 'Vietnam',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [removedAvatar, setRemovedAvatar] = useState(false);
  const [toast, setToast] = useState('');
  const [overTrash, setOverTrash] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // Giữ lại role hiện tại để không bị mất khi cập nhật localStorage (tránh mất menu theo quyền)
  const existingRoleRef = useRef('');

  const toInputDate = (v) => {
    if (!v) return '';
    try {
      if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      const s = String(v).trim();
      // If already yyyy-mm-dd
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // If mm/dd/yyyy
      const md = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (md) {
        const y = md[3];
        const m = String(md[1]).padStart(2, '0');
        const d = String(md[2]).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      const d = new Date(s);
      if (!isNaN(d.getTime())) return toInputDate(d);
    } catch {}
    return '';
  };

  // Max DOB (>= 18 tuổi)
  const maxDobStr = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }, []);

  useEffect(() => {
    // Load from localStorage quickly
    let email = '';
    try {
      const raw = localStorage.getItem('hmsUser');
      const u = raw ? JSON.parse(raw) : null;
      if (u) {
        email = u.email || '';
        existingRoleRef.current = u.role || existingRoleRef.current; // lưu role ban đầu
        setForm((f) => ({
          ...f,
          name: u.name || '',
          email: u.email || '',
          phone: u.phone || '',
          address: u.address || '',
          birthDate: toInputDate(u.birthDate || u.date_of_birth),
          country: u.country || 'Vietnam',
        }));
        if (u.avatar) setAvatarUrl(u.avatar);
      }
    } catch { /* ignore */ }

    // Then fetch latest from DB
    const fetchDb = async () => {
      if (!email) return;
      try {
        const res = await fetch(`/api/users/profile?email=${encodeURIComponent(email)}`);
        if (!res.ok) return; // keep local values if not found
        const j = await res.json();
        const u = j.user || {};
        setForm((f) => ({
          ...f,
          name: u.name || f.name,
          email: u.email || f.email,
          phone: u.phone || f.phone,
          address: u.address || f.address,
          birthDate: toInputDate(u.date_of_birth) || f.birthDate,
          country: u.country || f.country,
        }));
        if (u.avatar) setAvatarUrl(u.avatar);
        // Sync localStorage
        const next = {
          name: u.name || '',
          email: u.email || email,
          phone: u.phone || '',
            address: u.address || '',
          birthDate: toInputDate(u.date_of_birth) || '',
          country: u.country || 'Vietnam',
          avatar: u.avatar || '',
          role: u.role || existingRoleRef.current || '' // giữ lại role
        };
        try { localStorage.setItem('hmsUser', JSON.stringify(next)); } catch {}
      } catch { /* ignore fetch errors */ }
    };
    fetchDb();
  }, []);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.name?.trim()) {
      setError('Vui lòng nhập họ và tên');
      return;
    }
    if (!form.email?.trim()) {
      setError('Thiếu email');
      return;
    }
    // Validate age >= 18
    if (form.birthDate) {
      const bd = new Date(form.birthDate);
      if (!isNaN(bd.getTime())) {
        const now = new Date();
        const age = now.getFullYear() - bd.getFullYear() - ((now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) ? 1 : 0);
        if (age < 18) {
          setError('Ngày sinh không hợp lệ: phải đủ 18 tuổi trở lên');
          return;
        }
      }
    }
    const ok = window.confirm('Bạn có chắc muốn cập nhật thông tin cá nhân?');
    if (!ok) return;
    try {
      const fd = new FormData();
  fd.append('email', form.email.trim());
  fd.append('originalEmail', form.email.trim());
      fd.append('name', form.name.trim());
      fd.append('phone', form.phone?.trim() || '');
      fd.append('address', form.address?.trim() || '');
      fd.append('birthDate', form.birthDate || '');
      fd.append('country', form.country || '');
  if (avatarFile) fd.append('avatar', avatarFile);
  if (removedAvatar && !avatarFile) fd.append('removeAvatar', '1');

      const res = await fetch('/api/users/profile', { method: 'PUT', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `HTTP ${res.status}`);
      }
      const j = await res.json();
      // Lấy role hiện tại trước khi ghi đè
      let existingRole = existingRoleRef.current;
      try {
        const rawPrev = localStorage.getItem('hmsUser');
        if (rawPrev) existingRole = JSON.parse(rawPrev).role || existingRole;
      } catch { /* ignore */ }
      const next = {
        name: j.user?.name ?? form.name.trim(),
        email: j.user?.email ?? form.email.trim(),
        phone: (j.user?.phone ?? form.phone?.trim()) || '',
        address: (j.user?.address ?? form.address?.trim()) || '',
        birthDate: (j.user?.date_of_birth ?? form.birthDate) || '',
        country: (j.user?.country ?? form.country) || '',
        avatar: j.user?.avatar ?? avatarUrl,
        // Đặt ngoặc để tránh lỗi Babel khi kết hợp ?? và ||
        role: (j.user?.role ?? existingRole) || ''
      };
      existingRoleRef.current = next.role || existingRoleRef.current;
      localStorage.setItem('hmsUser', JSON.stringify(next));
      try { window.dispatchEvent(new Event('hms-auth-change')); } catch { }
      setSuccess('Cập nhật thông tin thành công!');
      setToast('Cập nhật thông tin thành công');
      setTimeout(() => setToast(''), 2000);
    } catch (err) {
      setError(err.message || 'Không thể cập nhật thông tin');
    }
  };

  const avatarPreview = useMemo(() => {
    if (avatarFile) return URL.createObjectURL(avatarFile);
    return avatarUrl || '';
  }, [avatarFile, avatarUrl]);

  const content = (
    <div className="profile-card">
        <h2 className="profile-title">Thông Tin Cá Nhân</h2>
        {error && <div className="error-msg" role="alert">{error}</div>}
        {success && <div className="success-msg" role="status">{success}</div>}
        <form onSubmit={onSubmit} noValidate>
          <div className="profile-avatar-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f) setAvatarFile(f);
              }}
            />
            <button
              className={`profile-avatar clickable ${dragging ? 'dragging' : ''} ${overTrash ? 'drag-red' : ''}`}
              type="button"
              draggable
              onDragStart={() => setDragging(true)}
              onDragEnd={() => { setDragging(false); setOverTrash(false); }}
              onClick={() => fileRef.current && fileRef.current.click()}
              title="Nhấp để chọn ảnh đại diện"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar" />
              ) : (
                <div className="profile-avatar-empty">Ảnh</div>
              )}
            </button>
          </div>
          {dragging && (
            <div
              className="profile-trash"
              onDragOver={(e) => {
                e.preventDefault();
                const el = e.currentTarget;
                el.classList.add('over');
                setOverTrash(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('over');
                setOverTrash(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                setAvatarFile(null);
                setAvatarUrl('');
                setRemovedAvatar(true);
                e.currentTarget.classList.remove('over');
                setOverTrash(false);
              }}
            >
              🗑️ Kéo vào đây để xóa ảnh
            </div>
          )}

          <label>Họ và Tên</label>
          <input
            type="text"
            value={form.name}
            onChange={update('name')}
            placeholder="Nhập họ và tên"
          />

          <label>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={update('email')}
            placeholder="name@example.com"
            readOnly
            title="Email dùng để định danh; không thể sửa tại đây"
          />

          <label>Số điện thoại</label>
          <input
            type="tel"
            value={form.phone}
            onChange={update('phone')}
            placeholder="0901234567"
          />

          <label>Địa chỉ</label>
          <input
            type="text"
            value={form.address}
            onChange={update('address')}
            placeholder="Số nhà, đường, quận/huyện, tỉnh/thành"
          />

          <label>Ngày sinh</label>
          <div className="date-group">
            <input
              type="date"
              value={form.birthDate}
              onChange={update('birthDate')}
              max={maxDobStr}
            />
            <button type="button" className="date-icon" onClick={() => setShowDatePicker((v) => !v)} title="Chọn ngày/tháng/năm" aria-label="Chọn ngày">
              <img src="/icon-schedule.png" alt="Chọn ngày" />
            </button>
          </div>
          {showDatePicker && (
            <DateTriple
              date={form.birthDate}
              max={maxDobStr}
              onApply={(v) => { setForm((f) => ({ ...f, birthDate: v })); setShowDatePicker(false); }}
              onClose={() => setShowDatePicker(false)}
            />
          )}

          <label>Quốc gia</label>
          <select value={form.country} onChange={update('country')}>
            {[
              'Vietnam','United States','Japan','South Korea','China','Thailand','Singapore','Malaysia','France','Germany','United Kingdom','Australia'
            ].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="profile-actions">
            <button type="submit" className="btn-primary" style={{ width: 'auto', minWidth: 160 }}>
              Cập Nhật
            </button>
          </div>
        </form>
      </div>
  );

  if (isModal) {
    return (
      <div
        className="profile-overlay"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e)=>{ if (e.target === e.currentTarget) onClose && onClose(); }}
      >
        <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => onClose && onClose()}>
          ← Quay lại
        </button>
        {toast && <div className="profile-toast" role="status">{toast}</div>}
        <div className="profile-modal" onMouseDown={(e)=> e.stopPropagation()}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      {content}
    </div>
  );
}

function DateTriple({ date, onApply, onClose, max }) {
  const parse = (s) => {
    if (!s) return { y: '', m: '', d: '' };
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { y: '', m: '', d: '' };
    return { y: m[1], m: m[2], d: m[3] };
  };
  const init = parse(date);
  const [y, setY] = useState(init.y);
  const [m, setM] = useState(init.m);
  const [d, setD] = useState(init.d);

  const toDays = (yy, mm) => {
    const year = Number(yy || 2000);
    const month = Number(mm || 1);
    return new Date(year, month, 0).getDate();
  };
  const now = new Date();
  const maxDate = max && /^\d{4}-\d{2}-\d{2}$/.test(max) ? new Date(max) : new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
  const maxYear = maxDate.getFullYear();
  const maxMonth = maxDate.getMonth() + 1; // 1-12
  const maxDay = maxDate.getDate();

  const years = Array.from({ length: 120 }, (_, i) => String(maxYear - i));
  const allMonths = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const months = (y && Number(y) === maxYear)
    ? allMonths.filter((mm) => Number(mm) <= maxMonth)
    : allMonths;
  const candidateMaxDays = toDays(y || String(maxYear), m || '01');
  let days = Array.from({ length: candidateMaxDays }, (_, i) => String(i + 1).padStart(2, '0'));
  if (y && Number(y) === maxYear && m && Number(m) === maxMonth) {
    days = days.filter((dd) => Number(dd) <= maxDay);
  }

  const apply = () => {
    if (!y || !m || !d) return onClose();
    const chosen = `${y}-${m}-${d}`;
    // Validate 18+
    const bd = new Date(chosen);
    if (!isNaN(bd.getTime())) {
      const now = new Date();
      const age = now.getFullYear() - bd.getFullYear() - ((now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) ? 1 : 0);
      if (age < 18) {
        alert('Ngày sinh không hợp lệ: Phải đủ 18 tuổi trở lên');
        return;
      }
    }
    onApply(chosen);
  };

  return (
    <div className="date-popover">
      <select value={d} onChange={(e) => setD(e.target.value)}>
        <option value="">Ngày</option>
        {days.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <select value={m} onChange={(e) => setM(e.target.value)}>
        <option value="">Tháng</option>
        {months.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <select value={y} onChange={(e) => setY(e.target.value)}>
        <option value="">Năm</option>
        {years.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <button type="button" className="date-apply" onClick={apply}>Áp dụng</button>
      <button type="button" className="date-cancel" onClick={onClose}>Đóng</button>
    </div>
  );
}
