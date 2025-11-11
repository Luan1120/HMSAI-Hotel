import React, { useEffect, useRef, useState } from 'react';
import AnimatedDropdown from './components/AnimatedDropdown';
import './HomePage.css';
import { authHeaders, getUserRole } from './auth';

export default function AdminAmenities({ isModal, onClose }){
  const isAdmin = getUserRole() === 'Admin';
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all'); // filter (Active/Maintenance/all)
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRow, setNewRow] = useState({ name: '', icon: '', description: '', image: '', status: 'Active', quantity: '', applyTo: '', note: '' });
  const [roomTypes, setRoomTypes] = useState([]);
  const [listAnimated, setListAnimated] = useState(false); // initial stagger animation control
  const fileInputRef = useRef(null);
  const createIconInputRef = useRef(null);
  const rootRef = useRef(null);

  // Root mount animation
  useEffect(()=>{ if(rootRef.current){ requestAnimationFrame(()=> rootRef.current.classList.add('is-mounted')); } }, []);

  // Load room types for ApplyTo dropdown
  useEffect(()=>{
    let active = true;
    fetch('/api/room-types')
      .then(r=> r.ok ? r.json() : [])
      .then(list => { if(active) setRoomTypes(Array.isArray(list) ? list : []); })
      .catch(()=>{ if(active) setRoomTypes([]); });
    return ()=>{ active=false; };
  }, []);

  const load = async (opts={}) => {
    const qq = opts.q ?? q; const ss = opts.status ?? status;
    setLoading(true); setError('');
    try {
  const url = new URL('/api/admin/amenities', window.location.origin);
      if (qq) url.searchParams.set('q', qq);
  if (ss && ss !== 'all') {
        // Map filter to stored English values
        const mapFilter = { active: 'Active', maintenance: 'Maintenance' };
        const key = mapFilter[ss.toLowerCase()];
        if (key) url.searchParams.set('status', key);
      }
      const res = await fetch(url.toString(), { headers: authHeaders(), cache: 'no-store' });
      if (!res.ok) throw new Error('Không tải được tiện nghi');
      const j = await res.json();
      const list = Array.isArray(j.items) ? j.items : [];
      // Normalize status: any non-Maintenance => Active
      list.forEach(it => {
        if (Object.prototype.hasOwnProperty.call(it, 'Status')) {
          const s = String(it.Status || '').toLowerCase();
          it.Status = (s === 'maintenance') ? 'Maintenance' : 'Active';
        }
        if(it.Quantity === undefined && it.QuantityLabel){
          const m = String(it.QuantityLabel).match(/(\d+)/); if(m) it.Quantity = Number(m[1]);
        }
        if(it.Quantity !== undefined) it.Quantity = clampQuantity(it.Quantity);
      });
      setItems(list);
    } catch (e) { setError(e.message || 'Lỗi'); setItems([]); } finally { setLoading(false); }
  };
  useEffect(()=>{ if (isAdmin) load({ q:'', status:'all' }); }, []);
  // debounce
  const ref = useRef(null);
  useEffect(()=>{ if (!isAdmin) return; if (ref.current) clearTimeout(ref.current); ref.current = setTimeout(()=>load({}), 300); return ()=>{ if (ref.current) clearTimeout(ref.current); } }, [q, status]);

  const updateField = (id, field, value) => setItems(prev => prev.map(it => it.Id === id ? { ...it, [field]: value } : it));

  const save = async (it) => {
    try {
  const payload = { name: it.Name, icon: it.Icon, description: it.Description || it.Note, image: it.Image, status: it.Status, quantity: it.Quantity === ''? null: it.Quantity, applyTo: it.ApplyTo, note: it.Note };
      const res = await fetch(`/api/admin/amenities/${it.Id}`, { method:'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Lưu thất bại');
      await load({});
    } catch (e) { alert(e.message || 'Lỗi lưu'); }
  };

  const del = async (it) => {
    if (!window.confirm('Xóa tiện nghi này?')) return;
    try {
      const res = await fetch(`/api/admin/amenities/${it.Id}`, { method:'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error('Xóa thất bại');
      await load({});
    } catch (e) { alert(e.message || 'Lỗi xóa'); }
  };

  const create = async () => {
    if (!newRow.name || !newRow.name.trim()) { alert('Nhập tên tiện nghi'); return; }
    setCreating(true);
    try {
      const payload = {
        name: newRow.name,
        icon: newRow.icon,
        description: newRow.note || newRow.description,
        image: newRow.image,
        status: newRow.status,
        quantityLabel: newRow.quantity? `${newRow.quantity}/phòng` : '',
        applyTo: newRow.applyTo === '*' ? '' : newRow.applyTo,
        note: newRow.note || newRow.description,
        quantity: newRow.quantity || null
      };
      const res = await fetch('/api/admin/amenities', { method:'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Tạo thất bại');
      setNewRow({ name: '', icon: '', description: '', image: '', status: 'Active', quantity: '', applyTo: '', note: '' });
      setCreateOpen(false);
      await load({});
    } catch (e) { alert(e.message || 'Lỗi tạo'); } finally { setCreating(false); }
  };

  const uploadIcon = async (file, cb) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/admin/amenities/upload-icon', { method:'POST', headers: authHeaders(), body: form });
      if (!res.ok) throw new Error('Tải icon thất bại');
  const j = await res.json();
  // Removed debug log for uploaded icon path
      cb && cb(j.path);
    } catch (e) { alert(e.message || 'Không tải được icon'); }
  };

  // Resolve legacy DB stored icon paths (e.g., 'tiennghi/wifi.png', 'dichvu/spa.svg')
  // Ensure they point to files under client/public so <img src> works directly.
  const resolveIconPath = (p) => {
    if(!p) return '';
    let v = String(p).trim();
    if(!v) return '';
    v = v.replace(/\\/g,'/');
    if(/^https?:\/\//i.test(v)) return v; // absolute URL
    if(!v.startsWith('/')) v = '/' + v; // ensure leading slash
    return v;
  };

  const handleInlineIconChange = (id, file) => {
    if (!file) return;
    uploadIcon(file, (path)=> {
      updateField(id, 'Icon', path);
    });
  };

  // Helper to parse quantity label to number
  function parseQty(label){
    if(!label) return '';
    const m = String(label).match(/(\d+)/);
    return m? m[1]:'';
  }

  // Add helper to clamp quantity
  function clampQuantity(v){ if(v===''||v===null||v===undefined) return ''; const n = Number(v); if(Number.isNaN(n)|| n<0) return ''; return n>100? 100: n; }

  // Icon placeholder component
  const AmenityIconPlaceholder = ({size=24}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="4" ry="4" stroke="#ccc" fill="#f5f5f5" />
      <path d="M8 16h8M8 12h8M8 8h4" />
    </svg>
  );

  if (!isAdmin) return <div style={{ padding: 16, color:'#b42318' }}>Chức năng chỉ dành cho quản trị viên.</div>;

  // Flag list animation only first non-empty load
  useEffect(()=>{ if(items.length && !listAnimated){ // allow next paint first
    const t = setTimeout(()=> setListAnimated(true), 600); // after animations play once
    return ()=> clearTimeout(t);
  } }, [items, listAnimated]);

  return (
    <div ref={rootRef} className="af-container amenities-anim-root" style={{ padding: 12 }}>
      <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Quản lý tiện nghi</h2>
      <div className="reports-toolbar af-toolbar" style={{ marginBottom: 10 }}>
        <div className="reports-field af-field-grow">
          <input className="reports-input" style={{ width: '100%' }} placeholder="Tìm tiện nghi..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div className="reports-field" style={{ minWidth:190 }}>
          <AnimatedDropdown
            value={status}
            onChange={setStatus}
            options={[
              { value:'all', label:'Tất cả trạng thái' },
              { value:'active', label:'Đang hoạt động' },
              { value:'maintenance', label:'Đang bảo trì' }
            ]}
            placeholder="Trạng thái"
          />
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <button className="ph-btn" onClick={()=>setCreateOpen(true)}>+ Thêm tiện nghi</button>
      </div>

      {loading ? <div style={{ color:'#666' }}>Đang tải...</div> : error ? <div style={{ color:'#b42318' }}>{error}</div> : (
        (() => {
          const hasStatus = items.some(it => Object.prototype.hasOwnProperty.call(it, 'Status'));
          const hasQuantityLabel = items.some(it => Object.prototype.hasOwnProperty.call(it, 'QuantityLabel'));
          const hasApplyTo = items.some(it => Object.prototype.hasOwnProperty.call(it, 'ApplyTo'));
          const hasNote = items.some(it => Object.prototype.hasOwnProperty.call(it, 'Note'));
          const renderStatus = (v) => {
            const val = (v === undefined || v === null) ? 'Active' : String(v);
            const on = val === 'Active';
            return <span className={`ph-badge ${on ? 'ph-badge--success' : 'ph-badge--warning'}`}>{on ? 'Đang hoạt động' : 'Đang bảo trì'}</span>;
          };
          return (
            <table className="ph-table-el af-table" style={{ textAlign:'center' }}>
              <thead style={{ textAlign:'center' }}>
                <tr>
                  <th style={{ textAlign:'center' }}>TT</th>
                  <th style={{ textAlign:'center' }}>Tên tiện nghi</th>
                  <th style={{ textAlign:'center' }}>Icon</th>
                  <th style={{ textAlign:'center', minWidth:160 }}>Trạng thái</th>
                  <th style={{ textAlign:'center' }}>Số lượng</th>
                  <th style={{ textAlign:'center', minWidth:200 }}>Áp dụng cho phòng</th>
                  <th style={{ textAlign:'center' }}>Ghi chú</th>
                  <th style={{ textAlign:'center' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td className="ph-td" colSpan={8} style={{ textAlign:'center', color:'#666' }}>Không có dữ liệu.</td></tr>
                ) : items.map((it, idx) => (
                  <tr key={it.Id} className={"amenity-row" + (listAnimated? " amenity-row--static":"")} style={{ '--row-index': idx }}>
                    <td className="ph-td center">{idx+1}</td>
                    <td className="ph-td" style={{ textAlign:'center' }}><input value={(it.AmenityName||it.Name)|| ''} onChange={e=>{ updateField(it.Id, it.AmenityName!==undefined? 'AmenityName':'Name', e.target.value); if(it.AmenityName!==undefined) updateField(it.Id,'Name', e.target.value); }} /></td>
                    <td className="ph-td" style={{ textAlign:'center' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
  <div className={`amenity-icon-wrapper ${!it.Icon? 'placeholder':''}`}>{it.Icon ? <img src={resolveIconPath(it.Icon)} alt="icon" /> : <AmenityIconPlaceholder size={20} />}</div>
        <span className="tooltip-wrap">
          <button type="button" className="amenity-icon-btn" onClick={()=>{ if (fileInputRef.current){ fileInputRef.current.onchange=(e)=>{ const f=e.target.files[0]; handleInlineIconChange(it.Id, f); }; fileInputRef.current.click(); } }} aria-label="Thay icon">
            <img src="/replace.png" alt="Replace" style={{ width:16, height:16 }} />
          </button>
          <span className="tooltip-bubble">Thay icon</span>
        </span>
      </div>
                    </td>
                    <td className="ph-td center" style={{ minWidth:160 }}>
                      <div className="select-anim">
                        <select value={it.Status || 'Active'} onChange={e=>updateField(it.Id, 'Status', e.target.value)} onFocus={e=> e.target.parentElement.classList.add('opening')} onAnimationEnd={e=> e.target.parentElement.classList.remove('opening')} className={`reports-select amenity-inline-select status-select ${it.Status==='Maintenance'? 'status-maint': 'status-active'}`}>
                          <option value="Active">Đang hoạt động</option>
                          <option value="Maintenance">Đang bảo trì</option>
                        </select>
                      </div>
                    </td>
                    <td className="ph-td" style={{ textAlign:'center', minWidth:110 }}>
                      {(()=>{
                        const q = clampQuantity(it.Quantity);
                        const numList = Array.from({length:100},(_,i)=> ({ value:String(i+1), label:String(i+1) }));
                        return (
                          <AnimatedDropdown
                            value={q===''? '': String(q)}
                            onChange={(val)=>{ const num = clampQuantity(val); updateField(it.Id,'Quantity', num===''? '': num); }}
                            options={numList}
                            placeholder="Chọn"
                            emptyLabel="Không giới hạn"
                            className="adrop--sm"
                            width={110}
                          />
                        );
                      })()}
                    </td>
                    <td className="ph-td" style={{ textAlign:'center', minWidth:200 }}>
                      <div className="select-anim">
                        <select value={it.ApplyTo || ''} onChange={e=>updateField(it.Id, 'ApplyTo', e.target.value)} onFocus={e=> e.target.parentElement.classList.add('opening')} onAnimationEnd={e=> e.target.parentElement.classList.remove('opening')} className="reports-select amenity-inline-select">
                          <option value="">Tất cả phòng</option>
                          {roomTypes.map(rt => <option key={rt.id} value={rt.name}>{rt.name}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="ph-td" style={{ textAlign:'center' }}>
                      {hasNote ? (
                        <input value={it.Note || ''} onChange={e=>updateField(it.Id, 'Note', e.target.value)} placeholder="Ghi chú" style={{ width:'100%' }} />
                      ) : (
                        <input value={it.Description || ''} onChange={e=>updateField(it.Id, 'Description', e.target.value)} placeholder="Ghi chú" style={{ width:'100%' }} />
                      )}
                    </td>
                    <td className="ph-td action">
                      <button className="ph-btn ph-btn--success" onClick={()=>save(it)}>Sửa</button>
                      <button className="ph-btn ph-btn--danger" onClick={()=>del(it)}>Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()
      )}

      {createOpen && (
        <div className="profile-overlay" onMouseDown={(e)=>{ if (e.target===e.currentTarget) setCreateOpen(false); }}>
          <div className="profile-modal" onMouseDown={(e)=>e.stopPropagation()} style={{ width: 740, maxWidth:'98%', background:'#fff', borderRadius:12, padding:16 }}>
            <h3 style={{ marginTop: 0, textAlign:'center' }}>Thêm tiện nghi</h3>
            <div className="au-create" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Tên tiện nghi
                <input value={newRow.name} onChange={e=>setNewRow({ ...newRow, name:e.target.value })} placeholder="Wi-Fi, Điều hòa..." />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Trạng thái
                <div className="select-anim"><select value={newRow.status} onChange={e=>setNewRow({ ...newRow, status:e.target.value })} className="reports-select" style={{ height:38 }} onFocus={e=> e.target.parentElement.classList.add('opening')} onAnimationEnd={e=> e.target.parentElement.classList.remove('opening')}>
                  <option value="Active">Đang hoạt động</option>
                  <option value="Maintenance">Đang bảo trì</option>
                </select></div>
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Số lượng
                <AnimatedDropdown
                  value={newRow.quantity? String(newRow.quantity): ''}
                  onChange={(val)=> setNewRow(r=>({...r, quantity: clampQuantity(val)}))}
                  options={Array.from({length:100},(_,i)=> ({ value:String(i+1), label:String(i+1) }))}
                  emptyLabel="Không giới hạn"
                  placeholder="Chọn"
                  className="adrop--sm"
                  width="100%"
                />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Áp dụng cho phòng
                <div className="select-anim"><select value={newRow.applyTo} onChange={e=>setNewRow(r=>({ ...r, applyTo: e.target.value }))} className="reports-select" style={{ height:38 }} onFocus={e=> e.target.parentElement.classList.add('opening')} onAnimationEnd={e=> e.target.parentElement.classList.remove('opening')}>
                  <option value="">Tất cả phòng</option>
                  {roomTypes.map(rt => <option key={rt.id} value={rt.name}>{rt.name}</option>)}
                </select></div>
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Ghi chú
                <input value={newRow.note} onChange={e=>setNewRow({ ...newRow, note:e.target.value })} placeholder="Ghi chú" />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Icon (tải lên)
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div className={`amenity-icon-wrapper ${!newRow.icon? 'placeholder':''}`}>{newRow.icon ? <img src={resolveIconPath(newRow.icon)} alt="icon" style={{ width:32, height:32, objectFit:'contain' }} /> : <AmenityIconPlaceholder size={24} />}</div>
                  <span className="tooltip-wrap">
                    <button type="button" className="amenity-icon-btn" onClick={()=>{ if (createIconInputRef.current) createIconInputRef.current.click(); }} aria-label="Thay icon">
                      <img src="/replace.png" alt="Replace" style={{ width:18, height:18 }} />
                    </button>
                    <span className="tooltip-bubble">Thay icon</span>
                  </span>
                </div>
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Ảnh (URL)
                <input value={newRow.image} onChange={e=>setNewRow({ ...newRow, image:e.target.value })} placeholder="/uploads/amenity.png" />
              </label>
            </div>
            <div style={{ marginTop:16, display:'flex', gap:12, justifyContent:'center' }}>
              <button className="ph-btn" onClick={create} disabled={creating}>{creating ? 'Đang tạo...' : 'Tạo'}</button>
              <button className="ph-btn ph-btn--secondary" onClick={()=>setCreateOpen(false)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} />
      <style>{`
  .status-select.status-active { background:#e6f7ec; color:#086637; border-color:#bfe6ce; }
  .status-select.status-maint { background:#fff7e0; color:#8a6d00; border-color:#f3dfa3; }
  /* Fix inline select clipping for Vietnamese diacritics */
  .amenity-inline-select { 
    /* Remove fixed height to let font metrics breathe; ensure enough min-height */
    height:auto; 
    min-height:40px; 
    line-height:1.35; /* taller line box so g,y,j,p,q not clipped */
    padding:6px 12px 10px 12px; /* extra bottom padding for descenders */
    font-size:14px; 
    display:inline-block; 
    vertical-align:middle; 
    box-sizing:border-box; 
  }
  .amenity-inline-select option { line-height:1.35; }
  .amenity-icon-btn { 
    background:#f5f7fa;
    border:1px solid #d6dbe1;
    border-radius:8px;
    padding:4px 6px;
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:4px;
    transition: background .18s, box-shadow .18s, transform .12s;
    box-shadow:0 1px 2px rgba(0,0,0,0.04);
  }
  .amenity-icon-btn:hover { background:#eef3f9; box-shadow:0 2px 4px rgba(0,0,0,0.06); }
  .amenity-icon-btn:active { transform:translateY(1px); box-shadow:0 1px 2px rgba(0,0,0,0.05); }
  .amenity-icon-btn:focus-visible { outline:2px solid #3399ff; outline-offset:2px; }
  .amenity-icon-wrapper { 
    display:flex; align-items:center; justify-content:center; 
    width:30px; height:30px; border:1px solid #e0e4ea; border-radius:8px; background:#fff; 
  }
  .amenity-icon-wrapper img { width:24px; height:24px; object-fit:contain; }
  .amenity-icon-wrapper.placeholder { background:linear-gradient(135deg,#f8f9fa,#eef1f4); }
  /* Tooltip */
  .tooltip-wrap { position:relative; display:inline-flex; }
  .tooltip-bubble { position:absolute; bottom:100%; left:50%; transform:translateX(-50%) translateY(-6px); background:#1f2933; color:#fff; font-size:11px; line-height:1.2; padding:6px 8px; border-radius:6px; white-space:nowrap; opacity:0; pointer-events:none; transition: opacity .18s, transform .18s; box-shadow:0 4px 12px rgba(0,0,0,0.18); z-index:10; }
  .tooltip-bubble::after { content:""; position:absolute; top:100%; left:50%; transform:translateX(-50%); width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-top:6px solid #1f2933; }
  .tooltip-wrap:hover .tooltip-bubble, .tooltip-wrap:focus-within .tooltip-bubble { opacity:1; transform:translateX(-50%) translateY(-10px); }
  /* Lightweight animated wrapper for native selects */
  .select-anim { position:relative; display:inline-flex; border-radius:10px; padding:2px; --sel-shadow:0 1px 2px rgba(0,0,0,0.06); }
  .select-anim select.reports-select { transition: box-shadow .28s cubic-bezier(.4,.2,.2,1), transform .25s ease, background-color .35s; box-shadow: var(--sel-shadow); background:#fff; border-radius:8px; }
  .select-anim:focus-within select.reports-select { box-shadow:0 0 0 3px rgba(51,153,255,0.35), 0 4px 14px -2px rgba(0,0,0,0.18); transform:scale(1.015); }
  .select-anim:active select.reports-select { transform:scale(.985); }
  .select-anim::after { content:""; position:absolute; inset:0; border-radius:12px; background:linear-gradient(120deg,#e3f4ff,#f4faff 60%); opacity:0; transform:scale(.92); transition:opacity .35s, transform .4s; pointer-events:none; }
  .select-anim:focus-within::after { opacity:1; transform:scale(1); }
  .select-anim.opening select.reports-select { animation:selPulse .45s ease; }
  @keyframes selPulse { 0%{transform:scale(.94);} 55%{transform:scale(1.02);} 100%{transform:scale(1);} }
  /* (Future) custom dropdown base styles (will be populated when component integrated) */
  .adrop { position:relative; font-size:14px; }
  .adrop-btn { display:flex; align-items:center; gap:6px; background:#fff; border:1px solid #cfd6dd; border-radius:8px; padding:6px 10px; min-height:36px; cursor:pointer; transition: box-shadow .25s, border-color .25s, background .3s; width:100%; }
  .adrop-btn:hover { background:#f5f9fc; }
  .adrop-btn:focus-visible { outline:2px solid #3399ff; outline-offset:2px; }
  .adrop[data-open="true"] .adrop-btn { box-shadow:0 0 0 3px rgba(51,153,255,.3); border-color:#3399ff; }
  .adrop-list { position:absolute; z-index:50; top:calc(100% + 4px); left:0; width:100%; max-height:260px; overflow:auto; background:#fff; border:1px solid #d5dce3; border-radius:10px; box-shadow:0 10px 28px -6px rgba(0,0,0,.18), 0 4px 8px -2px rgba(0,0,0,.12); padding:6px 0; opacity:0; transform:translateY(4px) scale(.96); transform-origin: top center; pointer-events:none; transition:opacity .25s ease, transform .28s cubic-bezier(.4,.2,.2,1); }
  .adrop[data-open="true"] .adrop-list { opacity:1; transform:translateY(0) scale(1); pointer-events:auto; }
  .adrop-opt { display:flex; align-items:center; gap:6px; padding:6px 12px; cursor:pointer; line-height:1.3; position:relative; }
  .adrop-opt:hover, .adrop-opt[aria-selected="true"] { background:#f0f7ff; }
  .adrop-opt[aria-selected="true"]::after { content:"✓"; position:absolute; right:10px; font-size:12px; color:#1673c8; }
  .adrop-empty { padding:10px 12px; color:#666; font-style:italic; }
  .adrop-fade-enter { animation:fadeScale .3s ease; }
  @keyframes fadeScale { from { opacity:0; transform:translateY(4px) scale(.94);} to { opacity:1; transform:translateY(0) scale(1);} }
  /* Small variant */
  .adrop.adrop--sm .adrop-btn { min-height:32px; padding:4px 8px; font-size:13px; }
  .adrop.adrop--sm .adrop-list { font-size:13px; }
  .adrop .adrop-list { max-height:260px; overscroll-behavior:contain; }
  /* ===================== FORM-WIDE ANIMATIONS ===================== */
  .amenities-anim-root { opacity:0; transform:translateY(12px); transition: opacity .5s ease, transform .55s cubic-bezier(.4,.2,.2,1); }
  .amenities-anim-root.is-mounted { opacity:1; transform:translateY(0); }
  .amenities-anim-root .reports-toolbar { position:relative; animation:toolbarSlide .55s .05s both cubic-bezier(.4,.2,.2,1); }
  @keyframes toolbarSlide { from { opacity:0; transform:translateY(-6px);} to { opacity:1; transform:translateY(0);} }
  .amenities-anim-root table.af-table { animation:tableFade .55s .12s both ease; }
  @keyframes tableFade { from { opacity:0; transform:translateY(8px);} to { opacity:1; transform:translateY(0);} }
  /* Staggered rows */
  .amenity-row { opacity:0; transform:translateY(10px); animation:rowIn .55s calc(.15s + (var(--row-index,0) * 45ms)) both cubic-bezier(.4,.2,.2,1); }
  .amenity-row--static { animation:none; opacity:1; transform:none; }
  @keyframes rowIn { 0% { opacity:0; transform:translateY(10px);} 70%{ opacity:1;} 100% { opacity:1; transform:translateY(0);} }
  /* Input / select focus pop */
  .af-table input, .af-table select.reports-select { transition: box-shadow .25s, background-color .35s, transform .25s; }
  .af-table input:focus, .af-table select.reports-select:focus { box-shadow:0 0 0 3px rgba(51,153,255,0.30), 0 4px 10px -2px rgba(0,0,0,0.15); background:#fff; transform:translateY(-1px); }
  /* Row focus highlight when any child focused */
  .af-table tr:focus-within { outline:2px solid #3399ff33; outline-offset:-2px; background:linear-gradient(90deg,#f2f9ff,#ffffff); }
  /* Modal open animation */
  .profile-overlay { animation:overlayFade .35s ease; }
  @keyframes overlayFade { from { background-color:rgba(0,0,0,0); } to { background-color:rgba(0,0,0,0.4);} }
  .profile-modal { animation:modalPop .48s cubic-bezier(.4,.2,.2,1); }
  @keyframes modalPop { 0% { opacity:0; transform:translateY(18px) scale(.94);} 55% { opacity:1; transform:translateY(-2px) scale(1.01);} 100% { opacity:1; transform:translateY(0) scale(1);} }
  /* Button subtle press + focus unify */
  .ph-btn { transition: box-shadow .25s, transform .2s, background-color .3s, border-color .3s; }
  .ph-btn:active { transform:translateY(1px) scale(.985); }
  .ph-btn:focus-visible { box-shadow:0 0 0 3px rgba(51,153,255,.35); }
  /* Utility (reduce motion respect) */
  @media (prefers-reduced-motion: reduce){
    .amenities-anim-root, .amenities-anim-root * { animation:none !important; transition:none !important; }
  }
`}</style>
    </div>
  );
}
