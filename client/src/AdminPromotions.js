import React, { useEffect, useMemo, useRef, useState } from 'react';
import './HomePage.css';
import { authHeaders, getUserRole } from './auth';

/* Quản lý Ưu đãi / Mã khuyến mãi
   - Danh sách + tìm kiếm + lọc trạng thái
   - Tạo mới / Chỉnh sửa / Bật tắt (isActive)
   - Preview tính giảm theo số tiền đơn hàng nhập thử
   Trạng thái hiển thị:
     Active    => isActive=1 && now within [startDate,endDate]
     Scheduled => isActive=1 && now < startDate
     Expired   => now > endDate
     Disabled  => isActive=0
*/
export default function AdminPromotions(){
  const role = getUserRole();
  const isAdminOrStaff = ['Admin','Staff'].includes(role);
  const isAdmin = role === 'Admin';

  const [items, setItems] = useState([]); // promotions
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null); // row object being edited inline modal
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [previewAmount, setPreviewAmount] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAllOnPage, setSelectAllOnPage] = useState(false);
  const debounceRef = useRef(null);
  const now = useMemo(()=> new Date(), []);
  const localToday = useMemo(()=>{
    const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0,10);
  }, []);

  const emptyForm = {
    code: '',
    description: '',
    discountType: 'PERCENT',
    discountValue: '',
    startDate: '',
    endDate: '',
    minOrderAmount: '',
    maxDiscount: '',
    isActive: true,
    hotelId: '' // '' = tất cả (null tại server)
  };
  const [form, setForm] = useState(emptyForm);
  const [hotels, setHotels] = useState([]);
  const modalScrollRef = useRef(0);
  const firstFieldRef = useRef(null);

  const loadHotels = async () => {
    try {
      const res = await fetch('/api/hotels', { headers: authHeaders(), cache:'no-store' });
      if(!res.ok) throw new Error('Không tải được danh sách khách sạn');
      const j = await res.json();
      if(Array.isArray(j)) setHotels(j); else if(Array.isArray(j.items)) setHotels(j.items); else setHotels([]);
  } catch(e){ /* Removed debug warn for loadHotels error */ setHotels([]); }
  };

  const statusOf = (p) => {
    if(!p) return 'Unknown';
    const s = new Date(p.startDate);
    const e = new Date(p.endDate);
    if(!p.isActive) return 'Disabled';
    if(now < s) return 'Scheduled';
    if(now > e) return 'Expired';
    return 'Active';
  };

  const filtered = useMemo(()=>{
    const text = q.trim().toLowerCase();
    return items.filter(p => {
      const st = statusOf(p);
      if(statusFilter !== 'all' && st.toLowerCase() !== statusFilter) return false;
      if(text && !(`${p.code}`.toLowerCase().includes(text) || (p.description||'').toLowerCase().includes(text))) return false;
      return true;
    });
  }, [items, q, statusFilter]);

  const paged = useMemo(()=>{
    const start = (page-1)*pageSize;
    return filtered.slice(start, start+pageSize);
  }, [filtered, page]);

  const pageCount = useMemo(()=> Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length]);

  const computeDiscount = (promo, orderAmount) => {
    const amt = Number(orderAmount||0); if(!promo || !(amt>0)) return { discount:0, final: amt };
    if(promo.discountType === 'PERCENT') {
      let raw = amt * (Number(promo.discountValue||0)/100);
      if(promo.maxDiscount) raw = Math.min(raw, Number(promo.maxDiscount));
      return { discount: raw, final: Math.max(0, amt - raw) };
    }
    const raw = Number(promo.discountValue||0);
    return { discount: Math.min(raw, amt), final: Math.max(0, amt - raw) };
  };

  const load = async() => {
    if(!isAdminOrStaff) return;
    setLoading(true); setError('');
    try {
      // Tạm thời gọi thử endpoint nếu có, nếu 404 → giả lập mock
      const res = await fetch('/api/admin/promotions', { headers: authHeaders(), cache:'no-store' });
      if(!res.ok) throw new Error('Không tải được danh sách ưu đãi');
      const j = await res.json();
      const list = Array.isArray(j.items)? j.items: Array.isArray(j.promotions)? j.promotions: [];
      setItems(list.map(r=> ({ ...r })));
    } catch(e){
      // Removed debug warn for promotions load error
      setError(e.message || 'Lỗi tải dữ liệu');
      // Không còn tự động tạo mock để tránh nhầm trạng thái thực tế vs giả lập
      setItems([]);
    } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); loadHotels(); }, []);

  // Lock background scroll + focus first input when modal open
  useEffect(()=>{
    if(createOpen){
      modalScrollRef.current = window.scrollY || 0;
      // Scroll page to top so modal luôn xuất hiện ở đầu
      try { window.scrollTo(0,0); } catch {}
      // lock body at top
      document.body.style.position='fixed';
      document.body.style.top = '0';
      document.body.style.left='0';
      document.body.style.right='0';
      document.body.style.width='100%';
      document.body.classList.add('promo-modal-open');
      // ensure viewport not scrolled weirdly & focus
      window.requestAnimationFrame(()=>{ firstFieldRef.current && firstFieldRef.current.focus(); });
    } else {
      if(document.body.classList.contains('promo-modal-open')){
        const restore = modalScrollRef.current || 0;
        document.body.style.position='';
        document.body.style.top='';
        document.body.style.left='';
        document.body.style.right='';
        document.body.style.width='';
        document.body.classList.remove('promo-modal-open');
        window.scrollTo(0, restore);
      }
    }
  }, [createOpen]);

  useEffect(()=>{ if(debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(()=> setPage(1), 300); return ()=> debounceRef.current && clearTimeout(debounceRef.current); }, [q, statusFilter]);

  const openCreate = () => { setForm(emptyForm); setCreateOpen(true); };

  const validateForm = (data) => {
    if(!data.code.trim()) return 'Nhập mã ưu đãi';
    if(!/^[-A-Z0-9_]+$/i.test(data.code.trim())) return 'Mã chỉ gồm chữ, số, -, _';
    if(!data.discountType) return 'Chọn loại giảm';
    const val = Number(data.discountValue); if(!(val>0)) return 'Giá trị giảm phải > 0';
    if(data.discountType==='PERCENT' && val>100) return 'Phần trăm ≤ 100';
    // Normalize to date-only for validation (strip any time component)
    const sDate = data.startDate ? String(data.startDate).slice(0,10) : '';
    const eDate = data.endDate ? String(data.endDate).slice(0,10) : '';
    if(!sDate || !eDate) return 'Chọn thời gian hiệu lực';
    if(new Date(eDate) <= new Date(sDate)) return 'Ngày kết thúc phải sau ngày bắt đầu';
    if(data.minOrderAmount && !(Number(data.minOrderAmount)>=0)) return 'Đơn tối thiểu không hợp lệ';
    if(data.discountType==='PERCENT' && data.maxDiscount && !(Number(data.maxDiscount)>0)) return 'Giảm tối đa phải > 0';
    return '';
  };

  const submitCreate = async () => {
    const err = validateForm(form); if(err){ alert(err); return; }
    setCreating(true);
    try {
      // Strip time component: send date-only (YYYY-MM-DD) to server/DB
      const startDateOnly = form.startDate ? String(form.startDate).slice(0,10) : null;
      const endDateOnly = form.endDate ? String(form.endDate).slice(0,10) : null;
  // Force newly created promotions to be active by default
  const payload = { ...form, isActive: true, hotelId: form.hotelId ? Number(form.hotelId) : null, discountValue: Number(form.discountValue), minOrderAmount: form.minOrderAmount? Number(form.minOrderAmount): null, maxDiscount: form.maxDiscount? Number(form.maxDiscount): null, startDate: startDateOnly, endDate: endDateOnly };
      const res = await fetch('/api/admin/promotions', { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('Tạo ưu đãi thất bại');
      setCreateOpen(false); setForm(emptyForm); load();
    } catch(e){ alert(e.message || 'Lỗi tạo'); } finally { setCreating(false); }
  };

  const openEdit = (row) => { setEditing(row); setForm({ ...emptyForm, ...row, startDate: row.startDate?.slice(0,16) || '', endDate: row.endDate?.slice(0,16) || '' }); setCreateOpen(true); };
  
  // Normalize edit values to date-only (YYYY-MM-DD)
  const openEditNormalized = (row) => { setEditing(row); setForm({ ...emptyForm, ...row, startDate: row.startDate ? String(row.startDate).slice(0,10) : '', endDate: row.endDate ? String(row.endDate).slice(0,10) : '' }); setCreateOpen(true); };

  const submitEdit = async () => {
    if(!editing) return; const err = validateForm(form); if(err){ alert(err); return; }
    setSaving(true);
    try {
      // Send date-only values (YYYY-MM-DD) to avoid time components being stored
      const startDateOnly = form.startDate ? String(form.startDate).slice(0,10) : null;
      const endDateOnly = form.endDate ? String(form.endDate).slice(0,10) : null;
  const payload = { description: form.description, hotelId: form.hotelId ? Number(form.hotelId) : null, discountType: form.discountType, discountValue: Number(form.discountValue), startDate: startDateOnly, endDate: endDateOnly, minOrderAmount: form.minOrderAmount? Number(form.minOrderAmount): null, maxDiscount: form.maxDiscount? Number(form.maxDiscount): null, isActive: form.isActive };
      const res = await fetch(`/api/admin/promotions/${editing.id}`, { method:'PUT', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('Cập nhật thất bại');
      setCreateOpen(false); setEditing(null); load();
    } catch(e){ alert(e.message || 'Lỗi cập nhật'); } finally { setSaving(false); }
  };

  const toggleActive = async (row) => {
    // Optimistic
    setItems(prev => prev.map(p => p.id===row.id? { ...p, isActive: !p.isActive }: p));
    try {
      const res = await fetch(`/api/admin/promotions/${row.id}/activate`, { method:'PATCH', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ isActive: !row.isActive }) });
      if(!res.ok) throw new Error('Cập nhật trạng thái thất bại');
    } catch(e){
      setItems(prev => prev.map(p => p.id===row.id? { ...p, isActive: row.isActive }: p));
      alert(e.message || 'Lỗi');
    }
  };

  const del = async (row) => {
    if(!window.confirm('Xóa ưu đãi này?')) return;
    try {
      const res = await fetch(`/api/admin/promotions/${row.id}`, { method:'DELETE', headers: authHeaders() });
      if(!res.ok) throw new Error('Xóa thất bại');
      load();
    } catch(e){ alert(e.message || 'Lỗi xóa'); }
  };

  // Bulk actions
  const toggleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    if (selectAllOnPage) {
      // unselect same page ids
      setSelectedIds(prev => {
        const next = new Set(prev);
        paged.forEach(p => next.delete(p.id));
        return next;
      });
      setSelectAllOnPage(false);
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        paged.forEach(p => next.add(p.id));
        return next;
      });
      setSelectAllOnPage(true);
    }
  };

  const bulkActivate = async (on) => {
    if(selectedIds.size===0) return alert('Chưa chọn ưu đãi nào');
    if(!window.confirm(`Bạn có chắc muốn ${on? 'bật':'tắt'} ${selectedIds.size} ưu đãi?`)) return;
    try {
      // optimistic update
      setItems(prev => prev.map(it => selectedIds.has(it.id) ? { ...it, isActive: on } : it));
      // server call for each id (server may support batch; fallback to per-id)
      await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/admin/promotions/${id}/activate`, { method:'PATCH', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ isActive: on }) } ).then(r=>{ if(!r.ok) throw new Error('Lỗi cập nhật'); } )));
      alert('Cập nhật trạng thái thành công');
      setSelectedIds(new Set()); setSelectAllOnPage(false);
      load();
    } catch(e){ alert(e.message||'Lỗi cập nhật'); load(); }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      alert('Sao chép mã: ' + code);
    } catch(e){ alert('Không thể sao chép'); }
  };

  const exportCSV = () => {
  const rows = filtered.map(p => ({ code: p.code, description: p.description||'', type: p.discountType, value: p.discountValue, hotelType: p.hotelType || '', minOrder: p.minOrderAmount||'', maxDiscount: p.maxDiscount||'', start: p.startDate||'', end: p.endDate||'', active: p.isActive?1:0 }));
    const csv = [Object.keys(rows[0] || {}).join(','), ...rows.map(r=> Object.values(r).map(v => '"' + String(v||'').replace(/"/g,'""') + '"').join(','))].join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'promotions.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  if(!isAdminOrStaff) return <div style={{ padding:16 }}>Chức năng dành cho quản trị / nhân viên.</div>;

  return (
    <div className="af-container amenities-anim-root" style={{ padding:12 }}>
      <h2 className="home-rooms-title" style={{ textAlign:'left', marginTop:0 }}>Quản lý ưu đãi / mã khuyến mãi</h2>
      <div className="reports-toolbar af-toolbar" style={{ marginBottom:10, flexWrap:'wrap', gap:8 }}>
        <div className="reports-field af-field-grow" style={{ minWidth:240 }}>
          <input className="reports-input" placeholder="Tìm theo mã hoặc mô tả..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div className="reports-field" style={{ minWidth:200 }}>
          <select className="reports-select promo-select-inline" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="expired">Expired</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div className="reports-field" style={{ display:'flex', gap:8 }}>
          {isAdmin && <button className="ph-btn" onClick={openCreate}>+ Thêm ưu đãi</button>}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
            <input type="checkbox" checked={selectAllOnPage} onChange={toggleSelectAllOnPage} /> Chọn trang
          </label>
          <button className="ph-btn" onClick={()=> bulkActivate(true)} title="Bật ưu đãi cho các mục đã chọn">Bật</button>
          <button className="ph-btn" onClick={()=> bulkActivate(false)} title="Tắt ưu đãi cho các mục đã chọn">Tắt</button>
          <button className="ph-btn" onClick={exportCSV} title="Xuất CSV của danh sách đang lọc">Xuất CSV</button>
        </div>
      </div>
      {loading ? <div style={{ color:'#666' }}>Đang tải...</div> : error ? <div style={{ color:'#b42318' }}>{error}</div> : (
        <div style={{ overflowX:'auto' }}>
          <table className="ph-table-el af-table" style={{ width:'100%', minWidth:1080 }}>
            <thead>
              <tr>
                <th style={{ width:40 }}><input type="checkbox" checked={selectAllOnPage} onChange={toggleSelectAllOnPage} /></th>
                <th>Mã</th>
                <th>Mô tả</th>
                <th>Loại</th>
                <th>Khách sạn</th>
                <th>Giá trị</th>
                <th>Hiệu lực</th>
                <th>Điều kiện</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {paged.length===0 ? <tr><td colSpan={10} style={{ textAlign:'center', color:'#666' }}>Không có ưu đãi.</td></tr> : paged.map(p => {
                const st = statusOf(p);
                const amt = Number(previewAmount||0);
                const { discount, final } = computeDiscount(p, (amt && (!p.minOrderAmount || amt >= Number(p.minOrderAmount)))? amt: 0);
                return (
                  <tr key={p.id} className="amenity-row">
                    <td style={{ textAlign:'center' }}>
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={()=> toggleSelectOne(p.id)} />
                    </td>
                    <td className="ph-td" style={{ fontWeight:600 }} title={`ID: ${p.id}`}>{p.code}</td>
                    <td className="ph-td" style={{ maxWidth:220 }} title={p.description}>{p.description || '—'}</td>
                    <td className="ph-td">{p.discountType === 'PERCENT'? 'Phần trăm':'Cố định'}</td>
                    <td className="ph-td" style={{ fontSize:12 }}>
                      {p.hotelId ? <span className="promo-hotel-badge" data-ht="name">{p.hotelName || (hotels.find(h=>h.id===p.hotelId)?.name)||`#${p.hotelId}`}</span> : <span style={{ opacity:.6 }}>Tất cả</span>}
                    </td>
                    <td className="ph-td">{p.discountType === 'PERCENT'? `${p.discountValue}%${p.maxDiscount? ` (tối đa ${Number(p.maxDiscount).toLocaleString('vi-VN')}đ)` : ''}` : `${Number(p.discountValue).toLocaleString('vi-VN')} đ`}</td>
                    <td className="ph-td" style={{ fontSize:12 }}>
                      <div>{p.startDate ? new Date(p.startDate).toLocaleDateString('vi-VN') : '—'}</div>
                      <div style={{ opacity:.8 }}>{p.endDate ? new Date(p.endDate).toLocaleDateString('vi-VN') : '—'}</div>
                    </td>
                    <td className="ph-td" style={{ fontSize:12 }}>
                      {p.minOrderAmount ? <div>Tối thiểu: {Number(p.minOrderAmount).toLocaleString('vi-VN')}đ</div> : <div>—</div>}
                      {p.discountType==='PERCENT' && p.maxDiscount && <div>Giảm tối đa: {Number(p.maxDiscount).toLocaleString('vi-VN')}đ</div>}
                      {previewAmount && discount>0 && (
                        <div style={{ marginTop:6 }}>
                          <div style={{ color:'#047857', fontWeight:600 }}>Giảm {Math.round(discount).toLocaleString('vi-VN')}đ <span style={{ color:'#6b7280', fontWeight:400 }}>({p.discountType==='PERCENT'? `-${p.discountValue}%` : `- ${Math.round(discount).toLocaleString('vi-VN')}đ`})</span></div>
                          <div style={{ color:'#065f46', fontWeight:700 }}>Còn: {Math.round(final).toLocaleString('vi-VN')}đ</div>
                        </div>
                      )}
                    </td>
                    <td className="ph-td" style={{ fontWeight:600 }}>
                      <span className={`promo-badge promo-${st.toLowerCase()}`}>{st}</span>
                    </td>
                    <td className="ph-td" style={{ whiteSpace:'nowrap' }}>
                      <button className="ph-btn" onClick={()=> copyCode(p.code)}>Sao chép mã</button>
                      <button className="ph-btn ph-btn--success" onClick={()=> openEditNormalized(p)}>Sửa</button>
                      <button className="ph-btn ph-btn--warning" onClick={()=> toggleActive(p)}>{p.isActive? 'Tắt':'Bật'}</button>
                      {isAdmin && <button className="ph-btn ph-btn--danger" onClick={()=> del(p)}>Xóa</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop:10, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <label style={{ fontSize:13 }}>Xem thử đơn hàng (VND):</label>
          <input type="number" style={{ width:140 }} value={previewAmount} onChange={e=> setPreviewAmount(e.target.value)} placeholder="Nhập số tiền" />
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
          <button className="ph-btn" disabled={page<=1} onClick={()=> setPage(p=> Math.max(1,p-1))}>◀</button>
          <span style={{ fontSize:13 }}>Trang {page}/{pageCount}</span>
          <button className="ph-btn" disabled={page>=pageCount} onClick={()=> setPage(p=> Math.min(pageCount,p+1))}>▶</button>
        </div>
      </div>

      {createOpen && (
        <div className="profile-overlay promo-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget){ setCreateOpen(false); setEditing(null);} }}>
          <div className="profile-modal promo-modal" onMouseDown={e=> e.stopPropagation()} style={{ width:740, maxWidth:'96%' }}>
            <h3 className="promo-modal__title">{editing? 'Chỉnh sửa ưu đãi' : 'Tạo ưu đãi mới'}</h3>
            <div className="promo-status-preview">
              {(() => {
                // Dự kiến trạng thái dựa vào form hiện tại
                const mock = { ...form, isActive:true };
                const st = (!mock.startDate || !mock.endDate) ? 'Chưa đủ dữ liệu' : statusOf({ ...mock, startDate: mock.startDate, endDate: mock.endDate, isActive:true });
                return <><span>Trạng thái dự kiến: </span><span className={`promo-badge promo-${(st||'').toLowerCase().replace(/ /g,'')}`}>{st}</span></>;
              })()}
            </div>
            <div className="profile-modal__form promo-form">
              <label className="promo-field">Mã ưu đãi
                <input ref={firstFieldRef} className="promo-input" value={form.code} disabled={!!editing} onChange={e=> setForm(f=> ({ ...f, code:e.target.value.toUpperCase() }))} placeholder="WELCOME10" />
              </label>
              <label className="promo-field">Loại giảm
                <select className="promo-select-inline promo-input promo-discount-type" data-type={form.discountType} value={form.discountType} onChange={e=> setForm(f=> ({ ...f, discountType:e.target.value }))}>
                  <option value="PERCENT">Phần trăm</option>
                  <option value="FIXED">Cố định</option>
                </select>
              </label>
              <label className="promo-field">Giá trị giảm
                <input className="promo-input" type="number" value={form.discountValue} onChange={e=> setForm(f=> ({ ...f, discountValue:e.target.value }))} placeholder="10 hoặc 100000" />
              </label>
              <label className="promo-field">Giảm tối đa (nếu %)
                <input className="promo-input" type="number" value={form.maxDiscount} disabled={form.discountType!=='PERCENT'} onChange={e=> setForm(f=> ({ ...f, maxDiscount:e.target.value }))} placeholder="200000" />
              </label>
              <label className="promo-field">Khách sạn áp dụng
                <select className="promo-select-inline promo-input" value={form.hotelId} onChange={e=> setForm(f=> ({ ...f, hotelId:e.target.value }))}>
                  <option value="">Tất cả khách sạn</option>
                  {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </label>
              <label className="promo-field">Đơn tối thiểu
                <input className="promo-input" type="number" value={form.minOrderAmount} onChange={e=> setForm(f=> ({ ...f, minOrderAmount:e.target.value }))} placeholder="500000" />
              </label>
              <label className="promo-field">Ngày bắt đầu
                <input className="promo-input" type="date" min={localToday} value={form.startDate} onChange={e=> setForm(f=> ({ ...f, startDate:e.target.value }))} />
              </label>
              <label className="promo-field">Ngày kết thúc
                <input className="promo-input" type="date" min={form.startDate || localToday} value={form.endDate} onChange={e=> setForm(f=> ({ ...f, endDate:e.target.value }))} />
              </label>
              <label className="promo-field promo-field--full">Mô tả
                <textarea className="promo-input" rows={3} value={form.description} onChange={e=> setForm(f=> ({ ...f, description:e.target.value }))} placeholder="Mô tả ngắn..." />
              </label>
            </div>
            <div className="promo-preview-box">
              <strong>Xem nhanh:</strong>{' '}
              {(() => {
                const testAmt = Number(previewAmount||0);
                if(!(testAmt>0)) return <span>Nhập số tiền đơn hàng ở dưới danh sách để xem mức giảm.</span>;
                const mockPromo = { ...form, discountValue: Number(form.discountValue||0), maxDiscount: form.maxDiscount? Number(form.maxDiscount): null };
                const { discount, final } = computeDiscount(mockPromo, testAmt);
                if(!discount) return <span>Không áp dụng (chưa đủ điều kiện hoặc dữ liệu thiếu).</span>;
                return <span>Giảm {Math.round(discount).toLocaleString('vi-VN')}đ còn {Math.round(final).toLocaleString('vi-VN')}đ.</span>;
              })()}
            </div>
            <div className="promo-actions">
              {editing ? (
                <>
                  <button className="ph-btn promo-action-btn" onClick={submitEdit} disabled={saving}>{saving? 'Đang lưu...':'Lưu thay đổi'}</button>
                  <button className="ph-btn ph-btn--secondary promo-action-btn" onClick={()=> { setCreateOpen(false); setEditing(null); }}>Hủy</button>
                </>
              ) : (
                <>
                  <button className="ph-btn promo-action-btn" onClick={submitCreate} disabled={creating}>{creating? 'Đang tạo...':'Tạo mới'}</button>
                  <button className="ph-btn ph-btn--secondary promo-action-btn" onClick={()=> { setCreateOpen(false); setEditing(null); }}>Hủy</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
  .promo-badge { display:inline-block; padding:4px 8px; font-size:11px; line-height:1; border-radius:20px; letter-spacing:.3px; }
        .promo-active { background:#e6f7ec; color:#087443; border:1px solid #b2e7c9; }
        .promo-scheduled { background:#f0f4ff; color:#1d4ed8; border:1px solid #c7d8ff; }
        .promo-expired { background:#ffe8e6; color:#b42318; border:1px solid #f5b5ae; }
        .promo-disabled { background:#f1f5f9; color:#475569; border:1px solid #d3dce4; }

        .af-table { border-collapse: separate; border-spacing: 0 2px; }
        .af-table thead th { background:#fafbfc; position:sticky; top:0; z-index:5; }
        .af-table th, .af-table td { padding:8px 10px; vertical-align:middle; }
        .af-table tbody tr { background:#fff; transition:background .25s, box-shadow .25s; }
        .af-table tbody tr:nth-child(odd) { background:linear-gradient(180deg,#ffffff,#fdfdfd); }
        .af-table tbody tr:hover { background:#f5f9ff; box-shadow:0 2px 6px rgba(0,0,0,.05); }
        .af-table input, .af-table select, .af-table textarea { font-size:14px; border:1px solid #d7dbe0; border-radius:6px; background:#fff; }
        .af-table input, .af-table select { height:34px; line-height:1.3; padding:5px 10px 8px; }
        .af-table textarea { padding:6px 8px; }

        /* Inline promotion selects - prevent descender clipping (g,y,p,q) & polish */
        .promo-select-inline { 
          height:44px; min-height:44px; line-height:1.3; padding:0 44px 0 12px; font-size:14px; 
          border:1px solid #cfd6dd; border-radius:10px; background:#fff; font-weight:500; 
          box-shadow:0 1px 0 rgba(0,0,0,.02); appearance:none; -webkit-appearance:none; -moz-appearance:none; 
          background-image: linear-gradient(#fff,#fff), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center, 0 0; background-size:14px 14px, auto; 
          transition:border-color .25s, box-shadow .25s, background-color .35s; cursor:pointer;
        }
        .promo-select-inline:focus { border-color:#f59e0b; box-shadow:0 0 0 3px rgba(245,158,11,.28); outline:none; }
        .promo-select-inline:hover { border-color:#94a3b8; }
        .promo-select-inline option { line-height:1.35; }

        /* Badge subtle elevation */
        .promo-badge { position:relative; font-weight:600; box-shadow:0 1px 0 rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.02); }
        .promo-badge::after { content:""; position:absolute; inset:0; border-radius:inherit; box-shadow:0 2px 4px rgba(0,0,0,.08); opacity:0; transition:opacity .25s; }
        tr:hover .promo-badge::after { opacity:.4; }

        /* Action buttons spacing */
        .af-table td button.ph-btn { margin:2px 4px 2px 0; }

  .ph-btn { cursor:pointer; }
  .profile-overlay { backdrop-filter: blur(3px); background: rgba(15,23,42,0.55); display:flex; align-items:center; justify-content:center; position:fixed; inset:0; z-index:1200; animation:promoOverlayFade .4s ease; }
  @keyframes promoOverlayFade { from { opacity:0; } to { opacity:1; } }
  .profile-modal { box-shadow: 0 24px 70px -18px rgba(0,0,0,.35), 0 4px 14px rgba(0,0,0,.14); border: 1px solid rgba(255,255,255,0.25); background: linear-gradient(165deg,#ffffff,#fffdfa); position:relative; }
  .promo-modal { border-radius:20px; padding:22px 26px 26px; animation:promoModalIn .45s cubic-bezier(.4,.22,.22,1); }
  /* Đưa modal sát đỉnh: giảm translateY ban đầu để không nằm phần giữa */
  @keyframes promoModalIn { 0% { opacity:0; transform:translateY(8px) scale(.97); } 60% { opacity:1; transform:translateY(0) scale(1.005);} 100% { opacity:1; transform:translateY(0) scale(1);} }
  .promo-modal__title { margin:2px 0 6px; text-align:center; font-weight:800; letter-spacing:.5px; }
  .promo-status-preview { text-align:center; font-size:12px; margin-bottom:14px; color:#475569; animation:fadeUp .5s .15s both; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:translateY(0);} }
  .profile-modal__form { grid-template-columns: repeat(2, minmax(200px,1fr)); }
  .promo-form { display:grid; gap:18px 20px; }
  .promo-field { display:flex; flex-direction:column; gap:6px; font-size:13px; font-weight:600; color:#0f172a; position:relative; opacity:0; animation:promoFieldIn .55s cubic-bezier(.4,.22,.22,1) forwards; }
  .promo-field:nth-child(1){ animation-delay:.06s; }
  .promo-field:nth-child(2){ animation-delay:.10s; }
  .promo-field:nth-child(3){ animation-delay:.14s; }
  .promo-field:nth-child(4){ animation-delay:.18s; }
  .promo-field:nth-child(5){ animation-delay:.22s; }
  .promo-field:nth-child(6){ animation-delay:.26s; }
  .promo-field:nth-child(7){ animation-delay:.30s; }
  .promo-field--full { grid-column:1 / -1; }
  @keyframes promoFieldIn { 0% { opacity:0; transform:translateY(10px);} 60% { opacity:1; } 100% { opacity:1; transform:translateY(0);} }
  .promo-input { background:#fff; border:1px solid #d8dee5; border-radius:10px; padding:0 12px; font-size:14px; line-height:1.3; box-shadow:0 1px 0 rgba(0,0,0,.02); transition:border-color .25s, box-shadow .28s, background-color .35s; height:44px; display:flex; align-items:center; width:100%; box-sizing:border-box; }
  .promo-input:focus { outline:none; border-color:#f59e0b; box-shadow:0 0 0 3px rgba(245,158,11,.28), 0 4px 14px -2px rgba(0,0,0,.15); }
  .promo-input:disabled { background:#f1f5f9; color:#64748b; }
  .promo-input:hover:not(:disabled) { border-color:#94a3b8; }
  textarea.promo-input { resize:vertical; min-height:92px; }
  .promo-preview-box { margin-top:16px; background:#f8fafc; padding:12px 14px; border-radius:14px; font-size:13px; border:1px solid #eef2f6; animation:fadeUp .6s .25s both; }
  .promo-actions { margin-top:22px; display:flex; gap:14px; justify-content:center; animation:fadeUp .55s .32s both; }
  .promo-action-btn { font-weight:700; min-width:140px; position:relative; }
  .promo-action-btn:not(:disabled) { transition:transform .25s, box-shadow .28s, background .35s; }
  .promo-action-btn:not(:disabled):hover { transform:translateY(-2px); box-shadow:0 8px 24px -6px rgba(0,0,0,.25); }
  .promo-action-btn:not(:disabled):active { transform:translateY(0) scale(.97); box-shadow:0 4px 14px -4px rgba(0,0,0,.22); }
  .promo-action-btn:disabled { opacity:.7; cursor:progress; }
  @media (max-width:720px){ .profile-modal__form { grid-template-columns: 1fr; } .promo-field { animation-delay:.05s !important; } }
  @media (prefers-reduced-motion: reduce){
    .promo-modal, .promo-field, .promo-status-preview, .promo-preview-box, .promo-actions { animation:none !important; }
  }
  /* ================= COLORFUL ACCENTS ADDITION ================ */
  .promo-modal { background: linear-gradient(145deg,#ffffff 0%,#fff9f2 65%); }
  .promo-modal-open { overflow:hidden; }
  /* Overlay canh top: giảm padding-top để modal nằm sát hơn phần trên cùng */
  .promo-overlay { overflow:auto; align-items:flex-start; justify-content:center; padding:8px 0 32px; }
  /* Ép modal dính sát đỉnh viewport tuyệt đối */
  .promo-overlay .promo-modal { position:fixed; top:6px; left:50%; transform:translateX(-50%); margin:0 !important; max-height:calc(100vh - 12px); overflow:auto; }
  @media (max-width:720px){ .promo-overlay .promo-modal { top:4px; width:96%; } }
  .promo-modal__title { position:relative; }
  .promo-modal__title::after { content:""; position:absolute; left:50%; transform:translateX(-50%); bottom:-6px; width:160px; height:6px; border-radius:4px; background:linear-gradient(90deg,#f59e0b,#fbbf24,#fde047); box-shadow:0 2px 6px -2px rgba(245,158,11,.6); }
  .promo-form { position:relative; }
  .promo-form::before { content:""; position:absolute; inset:-12px -18px -12px -18px; background:linear-gradient(135deg,#fff7eb,#ffffff 28%,#ffffff 72%,#fff7eb); border:1px solid #ffe2b9; border-radius:18px; z-index:0; box-shadow:0 4px 18px -6px rgba(245,158,11,.25); }
  .promo-form .promo-field { z-index:1; }
  .promo-field { padding:2px 4px 6px; border-radius:12px; transition: background .35s, box-shadow .35s; }
  .promo-field:hover { background:rgba(255,178,36,0.06); }
  .promo-input { background:linear-gradient(180deg,#ffffff,#fffdf8); }
  .promo-input:focus { background:#ffffff; }
  /* Discount type select dynamic color ring */
  .promo-discount-type { position:relative; font-weight:700; letter-spacing:.3px; }
  .promo-discount-type[data-type="PERCENT"] { box-shadow:0 0 0 1px #ffd089, 0 0 0 4px rgba(245,158,11,.25); background:linear-gradient(180deg,#fffaf2,#fff); }
  .promo-discount-type[data-type="FIXED"] { box-shadow:0 0 0 1px #93c5fd, 0 0 0 4px rgba(59,130,246,.25); background:linear-gradient(180deg,#f1f8ff,#ffffff); }
  .promo-discount-type:focus { box-shadow:0 0 0 1px #f59e0b,0 0 0 4px rgba(245,158,11,.35); }
  /* Buttons accent gradient */
  .promo-action-btn { background:linear-gradient(180deg,#f59e0b,#f59a0b); color:#fff; border:none; }
  .promo-action-btn:hover { background:linear-gradient(180deg,#f8b13e,#f59a0b); }
  .promo-action-btn:active { background:linear-gradient(180deg,#e88d04,#d97706); }
  .promo-action-btn.ph-btn--secondary { background:#fff; color:#374151; border:1px solid #e2e8f0; }
  .promo-action-btn.ph-btn--secondary:hover { background:#f8fafc; }
  .promo-hotel-badge { display:inline-block; padding:4px 6px; border-radius:10px; font-size:11px; font-weight:600; letter-spacing:.3px; background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; }
  .promo-hotel-badge[data-ht='Resort'] { background:#ecfdf5; color:#065f46; border-color:#a7f3d0; }
  .promo-hotel-badge[data-ht='Business'] { background:#eff6ff; color:#1e3a8a; border-color:#bfdbfe; }
  .promo-hotel-badge[data-ht='Boutique'] { background:#fdf2f8; color:#9d174d; border-color:#fbcfe8; }
  /* Preview box accent border */
  .promo-preview-box { border:1px solid #ffe2b9; background:linear-gradient(180deg,#fffefb,#fffaf2); }
  /* Scrollbar subtle theming inside modal (WebKit) */
  .promo-modal ::-webkit-scrollbar { width:10px; }
  .promo-modal ::-webkit-scrollbar-track { background:transparent; }
  .promo-modal ::-webkit-scrollbar-thumb { background:linear-gradient(#f59e0b,#f59a0b); border-radius:20px; border:2px solid #fff; }
  /* Accessible high-contrast tweak (prefers-contrast more) */
  @media (prefers-contrast: more){
    .promo-form::before { box-shadow:none; }
    .promo-action-btn { box-shadow:none; }
  }
      `}</style>
    </div>
  );
}
