
import React, { useEffect, useMemo, useRef, useState } from 'react';
import './HomePage.css';
import { authHeaders } from './auth';

export default function AdminUsers({ isModal, onClose }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false); // submitting state
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', roleId: '' });
  const [newErrors, setNewErrors] = useState({});
  const computedErrors = useMemo(() => {
    const e = {};
    const emailRe = /^\S+@\S+\.\S+$/;
    if (!newUser.name || !newUser.name.trim()) e.name = 'Vui lòng nhập tên';
    if (!newUser.email || !emailRe.test(newUser.email)) e.email = 'Email không hợp lệ';
    if (!newUser.password || String(newUser.password).length < 6) e.password = 'Mật khẩu tối thiểu 6 ký tự';
    if (!newUser.roleId || Number.isNaN(Number(newUser.roleId))) e.roleId = 'Vui lòng chọn quyền';
    return e;
  }, [newUser]);
  const isFormValid = useMemo(() => Object.keys(computedErrors).length === 0, [computedErrors]);
  const tooltipText = useMemo(() => {
    if (isFormValid || creating) return '';
    const msgs = [];
    if (computedErrors.name) msgs.push(computedErrors.name);
    if (computedErrors.email) msgs.push(computedErrors.email);
    if (computedErrors.password) msgs.push(computedErrors.password);
    if (computedErrors.roleId) msgs.push(computedErrors.roleId);
    return msgs.join('; ');
  }, [computedErrors, isFormValid, creating]);

  const fetchUsers = async (queryVal = q) => {
    setLoading(true); setError('');
    try {
  const uRes = await fetch(`/api/admin/users${queryVal ? ('?q=' + encodeURIComponent(queryVal)) : ''}`, { headers: { ...authHeaders() } });
      if (!uRes.ok) throw new Error('Không tải được người dùng');
      const uj = await uRes.json();
      setUsers(Array.isArray(uj.users) ? uj.users : []);
    } catch (e) {
      setError(e.message || 'Lỗi tải dữ liệu');
      setUsers([]);
    } finally { setLoading(false); }
  };

  // Fetch roles once
  useEffect(() => {
    (async () => {
      try {
  const rRes = await fetch('/api/admin/roles', { headers: { ...authHeaders() } });
        if (rRes.ok) {
          const rj = await rRes.json();
          setRoles(Array.isArray(rj.roles) ? rj.roles : []);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => { fetchUsers(''); }, []);

  // Live filter as user types (debounced)
  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchUsers(q); }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  const roleOptions = useMemo(() => roles.map(r => ({ value: r.id, label: r.name })), [roles]);

  const updateUserField = (id, field, value) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  const handleSave = async (u) => {
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: u.name, email: u.email, phone: u.phone, address: u.address, roleId: u.roleId, status: (u.status && u.status.toLowerCase().includes('khóa')) ? 'Block' : 'Active' })
      });
      if (!res.ok) throw new Error('Lưu thất bại');
      await fetchUsers(q);
      alert('Đã lưu');
    } catch (e) { alert(e.message || 'Lỗi lưu'); }
  };

  const handleDelete = async (u) => {
    if (!window.confirm('Xóa người dùng này?')) return;
    try {
  const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (!res.ok) throw new Error('Xóa thất bại');
      await fetchUsers(q);
    } catch (e) { alert(e.message || 'Lỗi xóa'); }
  };

  const handleLockToggle = async (u, lock) => {
    // Optimistic UI update
    const prevStatus = u.status;
    setUsers(prev => prev.map(x => x.id===u.id ? { ...x, status: lock ? 'Khóa' : 'Hoạt động' } : x));
    try {
      const res = await fetch(`/api/admin/users/${u.id}/lock`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ lock }) });
      if (!res.ok) throw new Error('Cập nhật trạng thái thất bại');
      // Refresh background (silent)
      fetchUsers(q);
    } catch (e) {
      // Revert
      setUsers(prev => prev.map(x => x.id===u.id ? { ...x, status: prevStatus } : x));
      alert(e.message || 'Lỗi');
    }
  };

  const validateNew = (u) => {
    const errs = {};
    const emailRe = /^\S+@\S+\.\S+$/;
    if (!u.name || !u.name.trim()) errs.name = 'Vui lòng nhập tên';
    if (!u.email || !emailRe.test(u.email)) errs.email = 'Email không hợp lệ';
    if (!u.password || String(u.password).length < 6) errs.password = 'Mật khẩu tối thiểu 6 ký tự';
    if (!u.roleId || Number.isNaN(Number(u.roleId))) errs.roleId = 'Vui lòng chọn quyền';
    return errs;
  };

  const handleNewUser = async () => {
    const errs = validateNew(newUser);
    setNewErrors(errs);
    if (Object.keys(errs).length) return;
    setCreating(true);
    try {
      const payload = {
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        roleId: Number(newUser.roleId)
      };
  const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if (!res.ok) {
        let msg = 'Tạo thất bại';
        try {
          const data = await res.json();
          if (data && data.message) msg = data.message;
        } catch {
          const txt = await res.text();
          if (txt) msg = txt;
        }
        throw new Error(msg);
      }
      setNewUser({ name: '', email: '', password: '', roleId: '' });
      setNewErrors({});
      await fetchUsers(q);
      setCreating(false);
      alert('Tạo người dùng thành công');
      setIsCreateOpen(false);
    } catch (e) { alert(e.message || 'Lỗi tạo'); setCreating(false); }
  };

  return (
    <div className="admin-users" style={{ padding: isModal ? 0 : '80px 12px 20px' }}>
      {!isModal && (
        <header className="home-header" style={{ position: 'sticky', top: 0 }}>
          <div className="home-header-left">
            <img src="/logo.png" alt="logo" className="home-header-logo" />
            <a href="/" className="home-header-title home-header-home-btn">TRANG CHỦ</a>
          </div>
        </header>
      )}
      <div className="ph-table" style={{ padding: 16 }}>
        <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Quản lý người dùng</h2>
        <form onSubmit={(e)=>e.preventDefault()} className="au-toolbar">
          <div className="au-group">
            <input className="au-input" placeholder="Tìm kiếm người dùng..." value={q} onChange={e=>setQ(e.target.value)} />
            <button className="ph-btn ph-btn--secondary" type="button" onClick={()=>{ setQ(''); fetchUsers(''); }}>Làm mới</button>
          </div>
          <button className="ph-btn au-add-btn" type="button" onClick={()=>{ setIsCreateOpen(true); setNewErrors({}); }}>+ Thêm người dùng</button>
        </form>
        {loading ? <div style={{ color:'#666' }}>Đang tải...</div> : error ? <div style={{ color:'#b42318' }}>{error}</div> : (
          <div>
            <div className="ph-tr ph-head" style={{ gridTemplateColumns: '70px 1.2fr 1.6fr 1.1fr 0.9fr 1.1fr 1.2fr' }}>
              <div className="ph-td">ID</div>
              <div className="ph-td">Tên</div>
              <div className="ph-td">Email</div>
              <div className="ph-td">Số điện thoại</div>
              <div className="ph-td">Trạng thái</div>
              <div className="ph-td">Phân quyền</div>
              <div className="ph-td">Hành động</div>
            </div>
            {users.length === 0 ? (
              <div className="ph-td" style={{ padding: 12, color: '#666' }}>Không có người dùng nào.</div>
            ) : users.map((u,idx) => (
              <div
                key={u.id}
                className={"ph-tr au-row" + (selectedUserId===u.id? ' au-row--selected':'')}
                style={{ gridTemplateColumns: '70px 1.2fr 1.6fr 1.1fr 0.9fr 1.1fr 1.2fr', '--row-index': idx }}
                onClick={()=> setSelectedUserId(u.id)}
              >
                <div className="ph-td">{u.id}</div>
                <div className="ph-td"><input value={u.name || ''} onFocus={()=> setSelectedUserId(u.id)} onChange={e=>updateUserField(u.id, 'name', e.target.value)} style={{ width:'100%', border:'1px solid #eee', borderRadius:6, padding:'6px 8px' }} /></div>
                <div className="ph-td"><input value={u.email || ''} onFocus={()=> setSelectedUserId(u.id)} onChange={e=>updateUserField(u.id, 'email', e.target.value)} style={{ width:'100%', border:'1px solid #eee', borderRadius:6, padding:'6px 8px' }} /></div>
                <div className="ph-td"><input value={u.phone || ''} onFocus={()=> setSelectedUserId(u.id)} onChange={e=>updateUserField(u.id, 'phone', e.target.value)} style={{ width:'100%', border:'1px solid #eee', borderRadius:6, padding:'6px 8px' }} /></div>
                <div className="ph-td">
                  <div className={"au-status-badge " + ((u.status||'').toLowerCase().includes('khóa') ? 'blocked':'active')}>
                    {(u.status||'').toLowerCase().includes('khóa') ? 'Khóa' : 'Hoạt động'}
                  </div>
                </div>
                <div className="ph-td">
                  <select value={u.roleId || ''} onFocus={()=> setSelectedUserId(u.id)} onChange={e=>updateUserField(u.id, 'roleId', Number(e.target.value))} style={{ width:'100%', border:'1px solid #ddd', borderRadius:6, padding:'6px 8px' }}>
                    <option value="">—</option>
                    {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="ph-td">
                  <button className="ph-btn" onClick={()=>handleSave(u)} type="button">Lưu</button>
                  <button className="ph-btn ph-btn--secondary" onClick={()=>handleDelete(u)} type="button">Xóa</button>
                  <button className={`ph-btn ${u.status==='Khóa'?'unlock':'lock'}`} onClick={()=>handleLockToggle(u, !(u.status==='Khóa'))} type="button">{u.status==='Khóa'?'Mở khóa':'Khóa'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isCreateOpen && (
        <div className="profile-overlay" onMouseDown={(e)=>{ if (e.target===e.currentTarget) setIsCreateOpen(false); }}>
          <div className="profile-modal" onMouseDown={(e)=>e.stopPropagation()} style={{ width: 640, maxWidth:'98%' }}>
            <div className="ph-table" style={{ padding: 16 }}>
              <h3 style={{ marginTop:0 }}>Thêm người dùng</h3>
              <div className="au-create">
                <label>Tên
                  <input placeholder="Nhập tên" className={!computedErrors.name ? '' : 'au-error'} value={newUser.name} onChange={e=>{ setNewUser({...newUser, name:e.target.value}); if (newErrors.name) setNewErrors({...newErrors, name: undefined}); }} />
                  {newErrors.name ? <div style={{ color:'#b42318', fontSize:12, marginTop:4 }}>{newErrors.name}</div> : null}
                </label>
                <label>Email
                  <input placeholder="ví dụ: user@example.com" className={!computedErrors.email ? '' : 'au-error'} value={newUser.email} onChange={e=>{ setNewUser({...newUser, email:e.target.value}); if (newErrors.email) setNewErrors({...newErrors, email: undefined}); }} />
                  {newErrors.email ? <div style={{ color:'#b42318', fontSize:12, marginTop:4 }}>{newErrors.email}</div> : null}
                </label>
                <label>Mật khẩu
                  <input type="password" placeholder="Tối thiểu 6 ký tự" className={!computedErrors.password ? '' : 'au-error'} value={newUser.password} onChange={e=>{ setNewUser({...newUser, password:e.target.value}); if (newErrors.password) setNewErrors({...newErrors, password: undefined}); }} />
                  {newErrors.password ? <div style={{ color:'#b42318', fontSize:12, marginTop:4 }}>{newErrors.password}</div> : null}
                </label>
                <label>Quyền
                  <select className={!computedErrors.roleId ? '' : 'au-error'} value={newUser.roleId} onChange={e=>{ const val = e.target.value; setNewUser({...newUser, roleId: val ? Number(val) : ''}); if (newErrors.roleId) setNewErrors({...newErrors, roleId: undefined}); }}>
                    <option value="">—</option>
                    {roles.map(r=> <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  {newErrors.roleId ? <div style={{ color:'#b42318', fontSize:12, marginTop:4 }}>{newErrors.roleId}</div> : null}
                </label>
              </div>
              <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'center' }}>
                <span title={(!isFormValid && !creating) ? tooltipText : ''} style={{ display:'inline-block' }}>
                  <button className="ph-btn" onClick={handleNewUser} disabled={creating || !isFormValid} type="button">{creating ? 'Đang tạo...' : 'Tạo'}</button>
                </span>
                <button className="ph-btn ph-btn--secondary" onClick={()=>setIsCreateOpen(false)} type="button">Hủy</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .au-toolbar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
        .au-row { position:relative; animation:auRowIn .45s cubic-bezier(.4,.2,.2,1) both; }
        .au-row:nth-child(odd) { background:linear-gradient(90deg,#fafafa,transparent); }
        @keyframes auRowIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .au-row--selected { box-shadow:0 0 0 2px #4e8df7 inset; background:#f0f6ff !important; }
        .au-row--selected input, .au-row--selected select { background:#fff; }
        .au-row input:focus, .au-row select:focus { outline:none; border-color:#4e8df7; box-shadow:0 0 0 2px rgba(78,141,247,.25); }
        .ph-btn.lock { background:#ffb347; border:none; }
        .ph-btn.unlock { background:#3fb97d; border:none; }
        .ph-btn.lock:hover { filter:brightness(.95); }
        .ph-btn.unlock:hover { filter:brightness(.95); }
        .ph-btn.lock:active, .ph-btn.unlock:active { transform:translateY(1px); }
        .au-create label { display:flex; flex-direction:column; gap:4px; }
        .au-create input, .au-create select { border:1px solid #d0d5dd; border-radius:6px; padding:8px 10px; font-size:14px; transition:border-color .2s, box-shadow .25s; }
        .au-create input:focus, .au-create select:focus { border-color:#4e8df7; box-shadow:0 0 0 3px rgba(78,141,247,.2); outline:none; }
        .au-create .au-error { border-color:#d92d20 !important; box-shadow:0 0 0 2px rgba(217,45,32,.15); }
        .au-add-btn { transition:transform .25s, box-shadow .25s; }
        .au-add-btn:hover { transform:translateY(-2px); box-shadow:0 4px 12px -2px rgba(0,0,0,.15); }
        .au-status-badge { padding:6px 10px; border-radius:20px; font-size:13px; font-weight:500; text-align:center; line-height:1; display:inline-block; min-width:88px; }
        .au-status-badge.active { color:#137333; background:#e6f4ea; border:1px solid #a8d5b8; }
        .au-status-badge.blocked { color:#b42318; background:#fbeaea; border:1px solid #f2b0aa; }
      `}</style>
    </div>
  );
}
