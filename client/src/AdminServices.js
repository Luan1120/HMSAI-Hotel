import React, { useEffect, useRef, useState } from 'react';
import './HomePage.css';
import { authHeaders, getUserRole } from './auth';

export default function AdminServices(){
  const isAdminOrStaff = ['Admin','Staff'].includes(getUserRole());
  const isAdmin = getUserRole()==='Admin';
  const [q,setQ] = useState('');
  const [statusFilter,setStatusFilter] = useState('all');
  const [hotelFilter,setHotelFilter] = useState('all');
  const [items,setItems] = useState([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [createOpen,setCreateOpen] = useState(false);
  const [newRow,setNewRow] = useState({ name:'', description:'', price:'', status:'Active', hotelId:'', icon:'' });
  const [creating,setCreating] = useState(false);
  const [hotels,setHotels] = useState([]); // <-- added hotels state
  const debounceRef = useRef(null);
  const rootRef = useRef(null);
  // Refs for icon upload handling
  const fileInputRef = useRef(null);
  // When null => uploading for create-new modal, else holds service Id for row update
  const pendingIconForId = useRef(null);
  useEffect(()=>{ if(rootRef.current){ requestAnimationFrame(()=> rootRef.current.classList.add('is-mounted')); } },[]);

  const load = async (opts={}) => {
    if(!isAdminOrStaff) return;
    const qq = opts.q ?? q; const ss = opts.status ?? statusFilter; const hf = opts.hotel ?? hotelFilter;
    setLoading(true); setError('');
    try {
      const url = new URL('/api/admin/services', window.location.origin);
      if(qq) url.searchParams.set('q', qq);
      if(ss && ss!=='all') url.searchParams.set('status', ss==='active' ? 'Active' : 'Paused');
      if(hf && hf!=='all') url.searchParams.set('hotelId', hf);
      const res = await fetch(url.toString(), { headers: authHeaders(), cache:'no-store' });
      if(!res.ok) throw new Error('Không tải được dịch vụ');
      const j = await res.json();
      const normalizeStatus = (val) => {
        const v = String(val||'').trim().toLowerCase();
        if(['active','hoạt động','hoat dong','on','enabled','1','true'].includes(v)) return 'Active';
        if(['paused','tạm dừng','tam dung','off','disabled','0','false'].includes(v)) return 'Paused';
        // Default fallback
        return 'Active';
      };
      const list = Array.isArray(j.items) ? j.items.map(r => ({ ...r, Status: normalizeStatus(r.Status) })) : [];
      setItems(list);
    } catch(e){ setError(e.message || 'Lỗi'); setItems([]); } finally { setLoading(false); }
  };
  useEffect(()=>{ if(isAdminOrStaff) load({ q:'', status:'all' }); },[]);
  useEffect(()=>{ if(!isAdminOrStaff) return; if(debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(()=> load({}), 300); return ()=> debounceRef.current && clearTimeout(debounceRef.current); },[q,statusFilter,hotelFilter]);
  useEffect(()=>{ if(isAdminOrStaff){ fetch('/api/admin/hotels', { headers: authHeaders() }).then(r=> r.ok? r.json(): {items:[]}).then(j=> setHotels(Array.isArray(j.items)? j.items: [])).catch(()=> setHotels([])); } }, [isAdminOrStaff]);

  // (legacy per-row edit handlers removed; saving handled by saveRow with drafts map)

  const del = async (it)=>{
    if(!window.confirm('Xóa dịch vụ này?')) return;
    try { const res = await fetch(`/api/admin/services/${it.Id}`, { method:'DELETE', headers: authHeaders() }); if(!res.ok) throw new Error('Xóa thất bại'); await load({}); } catch(e){ alert(e.message || 'Lỗi xóa'); }
  };

  const create = async ()=>{
    if(!newRow.name.trim()) { alert('Nhập tên dịch vụ'); return; }
    if(!newRow.hotelId){ alert('Chọn khách sạn'); return; }
    setCreating(true);
    try {
      const payload = { name:newRow.name, description:newRow.description, price: newRow.price? Number(newRow.price):0, status: newRow.status, hotelId: newRow.hotelId, icon: newRow.icon || null };
      const res = await fetch('/api/admin/services', { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('Tạo thất bại');
      setNewRow({ name:'', description:'', price:'', status:'Active', hotelId:'', icon:'' }); setCreateOpen(false); await load({});
    } catch(e){ alert(e.message || 'Lỗi'); } finally { setCreating(false); }
  };

  const [drafts,setDrafts] = useState({});
  const [selectedId,setSelectedId] = useState(null);

  // Initialize / sync drafts when items change (only add missing ids, keep user edits)
  useEffect(()=>{
    setDrafts(prev => {
      const next = { ...prev };
      items.forEach(it => {
        if(!next[it.Id]) next[it.Id] = { Name: it.Name||'', Description: it.Description||'', Price: it.Price||0, Status: it.Status||'Active', HotelId: it.HotelId || '', Icon: it.Icon || '' };
        else {
          if(next[it.Id].HotelId===undefined) next[it.Id].HotelId = it.HotelId || '';
          if(next[it.Id].Icon===undefined) next[it.Id].Icon = it.Icon || '';
          // Sync status to backend value to avoid stale draft showing 'Hoạt động' while item is paused (or vice versa)
          // We intentionally overwrite to keep UI consistent after background reloads.
          next[it.Id].Status = it.Status || 'Active';
        }
      });
      Object.keys(next).forEach(id => { if(!items.find(it => String(it.Id)===String(id))) delete next[id]; });
      return next;
    });
  }, [items]);

  const updateDraft = (id, field, value) => setDrafts(d => ({ ...d, [id]: { ...(d[id]||{}), [field]: value } }));

  const rowChangedPayload = (id, original) => {
    const dr = drafts[id]; if(!dr) return null;
    const payload = {};
    if (dr.Name !== original.Name) payload.name = dr.Name;
    if (dr.Description !== original.Description) payload.description = dr.Description;
    if (String(dr.Price) !== String(original.Price)) payload.price = dr.Price;
    if (dr.Status !== original.Status) payload.status = dr.Status;
    if (String(dr.HotelId||'') !== String(original.HotelId||'')) { payload.hotelId = dr.HotelId || null; }
    if ((dr.Icon||'') !== (original.Icon||'')) payload.icon = dr.Icon || null;
    return Object.keys(payload).length ? payload : null;
  };

  const saveRow = async (it) => {
    const payload = rowChangedPayload(it.Id, it);
    if(!payload){ alert('Không có thay đổi.'); return; }
    try {
      const res = await fetch(`/api/admin/services/${it.Id}`, { method:'PUT', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('Lưu thất bại');
      await load({});
    } catch(e){ alert(e.message || 'Lỗi lưu'); }
  };

  const setAvailability = async (it, nextStatus) => {
    const hotelId = (drafts[it.Id] && drafts[it.Id].HotelId) || it.HotelId || '';
    if(!hotelId){ alert('Thiếu khách sạn cho dịch vụ'); return; }
    const originalStatus = it.Status;
    // Optimistic UI update
    setItems(prev => prev.map(s => s.Id===it.Id ? { ...s, Status: nextStatus } : s));
    setDrafts(d => ({ ...d, [it.Id]: { ...(d[it.Id]||{}), Status: nextStatus } }));
    try {
      const payload = { status: nextStatus, hotelId };
      const res = await fetch(`/api/admin/services/${it.Id}`, { method:'PUT', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('Cập nhật trạng thái thất bại');
      // Optionally refresh in background to ensure consistency
      load({});
    } catch(e){
      // Revert on failure
      setItems(prev => prev.map(s => s.Id===it.Id ? { ...s, Status: originalStatus } : s));
      setDrafts(d => ({ ...d, [it.Id]: { ...(d[it.Id]||{}), Status: originalStatus } }));
      alert(e.message || 'Lỗi');
    }
  };

  const rowChanged = (it) => {
    const dr = drafts[it.Id]; if(!dr) return false;
    return dr.Name!==it.Name || dr.Description!==it.Description || String(dr.Price)!==String(it.Price) || dr.Status!==it.Status || String(dr.HotelId||'') !== String(it.HotelId||'') || (dr.Icon||'') !== (it.Icon||'');
  };

  // Trigger file chooser for an existing row (serviceId) or for create modal (null)
  const triggerIconUpload = (serviceId=null) => {
    pendingIconForId.current = serviceId; // null => new service modal
    if(fileInputRef.current){
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const onIconFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    // Basic client-side validation (optional)
    if(!/^image\//.test(f.type)) { alert('Vui lòng chọn file hình ảnh'); return; }
    if(f.size > 2*1024*1024) { alert('Ảnh quá lớn (tối đa 2MB)'); return; }
    const form = new FormData(); form.append('file', f);
    try {
      const res = await fetch('/api/admin/services/upload-icon', { method:'POST', headers: authHeaders(), body: form });
      if(!res.ok) throw new Error('Upload thất bại');
      const j = await res.json();
      const path = j.path;
      if(pendingIconForId.current){
        const sid = pendingIconForId.current;
        setDrafts(d => ({ ...d, [sid]: { ...(d[sid]||{}), Icon: path } }));
        pendingIconForId.current = null;
      } else {
        // New service modal
        setNewRow(r => ({ ...r, icon: path }));
      }
    } catch(err){
      alert(err.message || 'Lỗi upload icon');
    }
  };

  // Normalize icon path so existing DB values like "dichvu/icon.png" or "tiennghi/ac.svg"
  // (inserted manually pointing to client/public subfolders) render correctly.
  // We only force a leading slash for non-absolute (non-http) local paths and collapse backslashes.
  const resolveIconPath = (p) => {
    if(!p) return '';
    let v = String(p).trim();
    if(!v) return '';
    v = v.replace(/\\/g,'/');
    if(/^https?:\/\//i.test(v)) return v; // absolute URL untouched
    if(!v.startsWith('/')) v = '/' + v; // ensure leading slash for public assets
    return v;
  };

  if(!isAdminOrStaff) return <div style={{ padding:16 }}>Chức năng dành cho quản trị / nhân viên.</div>;

  return (
    <div ref={rootRef} className="af-container amenities-anim-root" style={{ padding:12 }}>
      <h2 className="home-rooms-title" style={{ textAlign:'left', marginTop:0 }}>Quản lý dịch vụ khách sạn</h2>
      <div className="reports-toolbar af-toolbar" style={{ marginBottom:10 }}>
        <div className="reports-field af-field-grow">
          <input className="reports-input" style={{ width:'100%' }} placeholder="Tìm kiếm dịch vụ..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div className="reports-field" style={{ minWidth:200 }}>
          <select className="reports-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{ height:38 }}>
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="paused">Tạm dừng</option>
          </select>
        </div>
        <div className="reports-field" style={{ minWidth:220 }}>
          <select className="reports-select" value={hotelFilter} onChange={e=>setHotelFilter(e.target.value)} style={{ height:38 }}>
            <option value="all">Tất cả khách sạn</option>
            {hotels.map(h=> <option key={h.id||h.Id} value={h.id||h.Id}>{h.name||h.Name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom:8 }}>
        {isAdmin && <button className="ph-btn" onClick={()=> setCreateOpen(true)}>+ Thêm dịch vụ</button>}
      </div>
      {loading ? <div style={{ color:'#666' }}>Đang tải...</div> : error ? <div style={{ color:'#b42318' }}>{error}</div> : (
        <table className="ph-table-el af-table" style={{ width:'100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign:'center' }}>ID</th>
              <th style={{ textAlign:'center' }}>Tên dịch vụ</th>
              <th style={{ textAlign:'center' }}>Icon</th>
              <th style={{ textAlign:'center' }}>Mô tả</th>
              <th style={{ textAlign:'center' }}>Giá (VND)</th>
              <th style={{ textAlign:'center' }}>Trạng thái</th>
              <th style={{ textAlign:'center' }}>Khách sạn</th>
              <th style={{ textAlign:'center' }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {items.length===0 ? <tr><td colSpan={8} style={{ color:'#666', textAlign:'center' }}>Không có dữ liệu.</td></tr> : items.map((it,idx)=> {
              const dr = drafts[it.Id] || { Name:'', Description:'', Price:0, Status:'Active' };
              const statusClass = (dr.Status === 'Active') ? 'svc-status-active' : 'svc-status-paused';
              return (
                <tr key={it.Id} onClick={()=> setSelectedId(it.Id)} className={"amenity-row" + (rowChanged(it)? ' svc-row--changed':'') + (selectedId===it.Id ? ' svc-row--selected':'')} style={{ '--row-index': idx }}>
                  <td className="ph-td" style={{ textAlign:'left' }}>{it.Id}</td>
                  <td className="ph-td" style={{ textAlign:'left' }}><input value={(drafts[it.Id]||{}).Name || ''} onFocus={()=> setSelectedId(it.Id)} onChange={e=>updateDraft(it.Id,'Name', e.target.value)} /></td>
                  <td className="ph-td" style={{ textAlign:'left', width:120 }}>
                    {(it.Icon || (drafts[it.Id]||{}).Icon) ? (
                      <div style={{ display:'flex', flexDirection:'row', alignItems:'center', gap:8 }}>
                        <img src={resolveIconPath((drafts[it.Id]||{}).Icon || it.Icon)} alt="icon" style={{ width:44,height:44,objectFit:'cover', borderRadius:8, border:'1px solid #ddd', background:'#fafafa' }} />
                        <button type="button" onClick={()=> triggerIconUpload(it.Id)} style={{
                          width:38, height:38, border:'1px solid #d0d5dd', background:'#fff', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0
                        }} title="Thay icon">
                          <img src="/replace.png" alt="Replace" style={{ width:20,height:20, objectFit:'contain' }} />
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="ph-btn" style={{ height:34, fontSize:12 }} onClick={()=> triggerIconUpload(it.Id)}>+ Icon</button>
                    )}
                  </td>
                  <td className="ph-td" style={{ textAlign:'left' }}><input value={(drafts[it.Id]||{}).Description || ''} onFocus={()=> setSelectedId(it.Id)} onChange={e=>updateDraft(it.Id,'Description', e.target.value)} /></td>
                  <td className="ph-td" style={{ textAlign:'left', minWidth:120 }}><input type="number" value={(drafts[it.Id]||{}).Price} onFocus={()=> setSelectedId(it.Id)} onChange={e=>updateDraft(it.Id,'Price', e.target.value)} /></td>
                  <td className="ph-td" style={{ textAlign:'left' }}>
                    <select value={(drafts[it.Id]||{}).Status} onFocus={()=> setSelectedId(it.Id)} onChange={e=>updateDraft(it.Id,'Status', e.target.value)} className={`reports-select ${statusClass}`} style={{ height:32 }}>
                      <option value="Active">Hoạt động</option>
                      <option value="Paused">Tạm dừng</option>
                    </select>
                  </td>
                  <td className="ph-td" style={{ textAlign:'left' }}>
                    <select value={(drafts[it.Id]||{}).HotelId} onFocus={()=> setSelectedId(it.Id)} onChange={e=>updateDraft(it.Id,'HotelId', e.target.value)} className="reports-select" style={{ height:32 }}>
                      <option value="">Chọn khách sạn</option>
                      {hotels.map(ht=> <option key={ht.id || ht.Id} value={ht.id || ht.Id}>{ht.name || ht.Name}</option>)}
                    </select>
                  </td>
                  <td className="ph-td action" style={{ whiteSpace:'nowrap', textAlign:'left' }}>
                    <button className="ph-btn ph-btn--success" onClick={()=>saveRow(it)}>Sửa</button>
                    {isAdmin && <button className="ph-btn ph-btn--danger" onClick={()=>del(it)}>Xóa</button>}
                    <button className="ph-btn ph-btn--warning" disabled={!((drafts[it.Id]||{}).HotelId || it.HotelId)} onClick={()=> setAvailability(it, (it.Status)==='Active'? 'Paused':'Active')}>{(it.Status)==='Active'? 'Tạm dừng':'Kích hoạt'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {createOpen && (
        <div className="profile-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget) setCreateOpen(false); }}>
          <div className="profile-modal" onMouseDown={e=> e.stopPropagation()} style={{ width:640, maxWidth:'96%', background:'#fff', borderRadius:12, padding:16 }}>
            <h3 style={{ marginTop:0, textAlign:'center' }}>Thêm dịch vụ</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Tên dịch vụ
                <input value={newRow.name} onChange={e=>setNewRow(r=>({...r, name:e.target.value }))} placeholder="Giặt ủi..." />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Giá (VND)
                <input type="number" value={newRow.price} onChange={e=>setNewRow(r=>({...r, price:e.target.value }))} placeholder="100000" />
              </label>
              <label style={{ gridColumn:'1 / span 2', display:'flex', flexDirection:'column', gap:4 }}>Mô tả
                <textarea rows={3} value={newRow.description} onChange={e=>setNewRow(r=>({...r, description:e.target.value }))} placeholder="Mô tả ngắn" />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Trạng thái
                <select className="reports-select" style={{ height:38 }} value={newRow.status} onChange={e=>setNewRow(r=>({...r, status:e.target.value }))}>
                  <option value="Active">Hoạt động</option>
                  <option value="Paused">Tạm dừng</option>
                </select>
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Khách sạn
                <select className="reports-select" style={{ height:38 }} value={newRow.hotelId} onChange={e=>setNewRow(r=>({...r, hotelId:e.target.value }))}>
                  <option value="">Chọn khách sạn</option>
                  {hotels.map(ht=> <option key={ht.id || ht.Id} value={ht.id || ht.Id}>{ht.name || ht.Name}</option>)}
                </select>
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Icon
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {newRow.icon ? (
                    <img src={resolveIconPath(newRow.icon)} alt="icon" style={{ width:56,height:56,objectFit:'cover', border:'1px solid #ddd', borderRadius:10, background:'#fafafa' }} />
                  ) : (
                    <span style={{ fontSize:12, color:'#666' }}>Chưa chọn</span>
                  )}
                  <button type="button" onClick={()=> { pendingIconForId.current=null; fileInputRef.current && fileInputRef.current.click(); }} style={{
                    display:'flex', alignItems:'center', gap:6, background:'#fff', border:'1px solid #d0d5dd', borderRadius:8, padding:'6px 10px', cursor:'pointer'
                  }}>
                    <img src="/replace.png" alt="Upload" style={{ width:18, height:18 }} />
                    <span style={{ fontSize:13 }}>Chọn / Thay</span>
                  </button>
                  {newRow.icon && <button type="button" className="ph-btn ph-btn--danger" onClick={()=> setNewRow(r=>({...r, icon:''}))}>Xóa</button>}
                </div>
              </label>
            </div>
            <div style={{ marginTop:16, display:'flex', gap:12, justifyContent:'center' }}>
              <button className="ph-btn" onClick={create} disabled={creating}>{creating? 'Đang tạo...':'Tạo'}</button>
              <button className="ph-btn ph-btn--secondary" onClick={()=>setCreateOpen(false)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={onIconFile} />
      <style>{`
        .amenities-anim-root { opacity:0; transform:translateY(12px); transition: opacity .5s ease, transform .55s cubic-bezier(.4,.2,.2,1); }
        .amenities-anim-root.is-mounted { opacity:1; transform:translateY(0); }
        .amenities-anim-root table.af-table { animation:tableFade .55s .12s both ease; }
        @keyframes tableFade { from { opacity:0; transform:translateY(8px);} to { opacity:1; transform:translateY(0);} }

        /* Compact, uniform sizing */
        .af-table th, .af-table td { padding:6px 8px; vertical-align:middle; }
        .af-table input, .af-table select { height:32px; line-height:32px; padding:4px 8px; font-size:14px; border:1px solid #d7dbe0; border-radius:6px; background:#fff; }
        .af-table select { padding-right:28px; }
        .af-table .action .ph-btn { height:32px; line-height:30px; padding:0 14px; font-size:13px; margin-right:6px; }
        .af-table .action .ph-btn:last-child { margin-right:0; }
        .af-table .reports-select { height:32px !important; }

        /* Prevent inputs from stretching row */
        .af-table input[type=number] { width:110px; }
        .af-table td:nth-child(3) input { min-width:180px; }

        /* Changed row highlight: border only, no size change */
        .svc-row--changed { position:relative; background:transparent; box-shadow:0 0 0 2px #f9b334 inset; }
        .svc-row--changed::before { display:none !important; }
        .svc-row--changed input, .svc-row--changed select { background:#fff; }

  /* Selected row highlight */
  .svc-row--selected { background: #fffbe6; }
  .svc-row--selected.svc-row--changed { box-shadow:0 0 0 2px #f59f00 inset; }

        /* Smooth focus */
        .af-table input:focus, .af-table select:focus { outline:none; border-color:#f2a300; box-shadow:0 0 0 2px rgba(242,163,0,.2); }

        /* Responsive tightening on narrow screens */
        @media (max-width: 1100px){
          .af-table th, .af-table td { padding:4px 6px; }
          .af-table .action .ph-btn { padding:0 10px; font-size:12px; }
        }

        .af-table td:nth-child(2){ width:72px; }

        .reports-select.svc-status-active { background:#e6f7ec; color:#086637; border-color:#bfe6ce; }
        .reports-select.svc-status-paused { background:#ffe8e6; color:#b42318; border-color:#f5b5ae; }
        .reports-select.svc-status-active:focus { box-shadow:0 0 0 2px rgba(8,102,55,.25); }
        .reports-select.svc-status-paused:focus { box-shadow:0 0 0 2px rgba(180,35,24,.25); }
      `}</style>
    </div>
  );
}
