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
  const debounceRef = useRef(null);
  const now = useMemo(()=> new Date(), []);

  const emptyForm = {
    code: '',
    description: '',
    discountType: 'PERCENT',
    discountValue: '',
    startDate: '',
    endDate: '',
    minOrderAmount: '',
    maxDiscount: '',
    isActive: true
  };
  const [form, setForm] = useState(emptyForm);

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
      console.warn('[AdminPromotions] load error:', e.message);
      setError(e.message || 'Lỗi tải dữ liệu');
      // Không còn tự động tạo mock để tránh nhầm trạng thái thực tế vs giả lập
      setItems([]);
    } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, []);

  useEffect(()=>{ if(debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(()=> setPage(1), 300); return ()=> debounceRef.current && clearTimeout(debounceRef.current); }, [q, statusFilter]);

  const openCreate = () => { setForm(emptyForm); setCreateOpen(true); };

  const validateForm = (data) => {
    if(!data.code.trim()) return 'Nhập mã ưu đãi';
    if(!/^[-A-Z0-9_]+$/i.test(data.code.trim())) return 'Mã chỉ gồm chữ, số, -, _';
    if(!data.discountType) return 'Chọn loại giảm';
    const val = Number(data.discountValue); if(!(val>0)) return 'Giá trị giảm phải > 0';
    if(data.discountType==='PERCENT' && val>100) return 'Phần trăm ≤ 100';
    if(!data.startDate || !data.endDate) return 'Chọn thời gian hiệu lực';
    if(new Date(data.endDate) <= new Date(data.startDate)) return 'Ngày kết thúc phải sau ngày bắt đầu';
    if(data.minOrderAmount && !(Number(data.minOrderAmount)>=0)) return 'Đơn tối thiểu không hợp lệ';
    if(data.discountType==='PERCENT' && data.maxDiscount && !(Number(data.maxDiscount)>0)) return 'Giảm tối đa phải > 0';
    return '';
  };

  const submitCreate = async () => {
    const err = validateForm(form); if(err){ alert(err); return; }
    setCreating(true);
    try {
      const payload = { ...form, discountValue: Number(form.discountValue), minOrderAmount: form.minOrderAmount? Number(form.minOrderAmount): null, maxDiscount: form.maxDiscount? Number(form.maxDiscount): null };
      const res = await fetch('/api/admin/promotions', { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error('Tạo ưu đãi thất bại');
      setCreateOpen(false); setForm(emptyForm); load();
    } catch(e){ alert(e.message || 'Lỗi tạo'); } finally { setCreating(false); }
  };

  const openEdit = (row) => { setEditing(row); setForm({ ...emptyForm, ...row, startDate: row.startDate?.slice(0,16) || '', endDate: row.endDate?.slice(0,16) || '' }); setCreateOpen(true); };

  const submitEdit = async () => {
    if(!editing) return; const err = validateForm(form); if(err){ alert(err); return; }
    setSaving(true);
    try {
      const payload = { description: form.description, discountType: form.discountType, discountValue: Number(form.discountValue), startDate: form.startDate, endDate: form.endDate, minOrderAmount: form.minOrderAmount? Number(form.minOrderAmount): null, maxDiscount: form.maxDiscount? Number(form.maxDiscount): null, isActive: form.isActive };
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

  if(!isAdminOrStaff) return <div style={{ padding:16 }}>Chức năng dành cho quản trị / nhân viên.</div>;

  return (
    <div className="af-container amenities-anim-root" style={{ padding:12 }}>
      <h2 className="home-rooms-title" style={{ textAlign:'left', marginTop:0 }}>Quản lý ưu đãi / mã khuyến mãi</h2>
      <div className="reports-toolbar af-toolbar" style={{ marginBottom:10, flexWrap:'wrap', gap:8 }}>
        <div className="reports-field af-field-grow" style={{ minWidth:240 }}>
          <input className="reports-input" placeholder="Tìm theo mã hoặc mô tả..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div className="reports-field" style={{ minWidth:180 }}>
          <select className="reports-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{ height:38 }}>
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
      </div>
      {loading ? <div style={{ color:'#666' }}>Đang tải...</div> : error ? <div style={{ color:'#b42318' }}>{error}</div> : (
        <div style={{ overflowX:'auto' }}>
          <table className="ph-table-el af-table" style={{ width:'100%', minWidth:1080 }}>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Mô tả</th>
                <th>Loại</th>
                <th>Giá trị</th>
                <th>Hiệu lực</th>
                <th>Điều kiện</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {paged.length===0 ? <tr><td colSpan={8} style={{ textAlign:'center', color:'#666' }}>Không có ưu đãi.</td></tr> : paged.map(p => {
                const st = statusOf(p);
                const amt = Number(previewAmount||0);
                const { discount, final } = computeDiscount(p, (amt && (!p.minOrderAmount || amt >= Number(p.minOrderAmount)))? amt: 0);
                return (
                  <tr key={p.id} className="amenity-row">
                    <td className="ph-td" style={{ fontWeight:600 }} title={`ID: ${p.id}`}>{p.code}</td>
                    <td className="ph-td" style={{ maxWidth:220 }} title={p.description}>{p.description || '—'}</td>
                    <td className="ph-td">{p.discountType === 'PERCENT'? 'Phần trăm':'Cố định'}</td>
                    <td className="ph-td">{p.discountType === 'PERCENT'? `${p.discountValue}%${p.maxDiscount? ` (tối đa ${Number(p.maxDiscount).toLocaleString('vi-VN')}đ)` : ''}` : `${Number(p.discountValue).toLocaleString('vi-VN')} đ`}</td>
                    <td className="ph-td" style={{ fontSize:12 }}>
                      <div>{new Date(p.startDate).toLocaleString('vi-VN')}</div>
                      <div style={{ opacity:.8 }}>{new Date(p.endDate).toLocaleString('vi-VN')}</div>
                    </td>
                    <td className="ph-td" style={{ fontSize:12 }}>
                      {p.minOrderAmount ? <div>Tối thiểu: {Number(p.minOrderAmount).toLocaleString('vi-VN')}đ</div> : <div>—</div>}
                      {p.discountType==='PERCENT' && p.maxDiscount && <div>Giảm tối đa: {Number(p.maxDiscount).toLocaleString('vi-VN')}đ</div>}
                      {previewAmount && discount>0 && <div style={{ marginTop:4, color:'#047857' }}>Giảm: {Math.round(discount).toLocaleString('vi-VN')}đ<br/>Còn: {Math.round(final).toLocaleString('vi-VN')}đ</div>}
                    </td>
                    <td className="ph-td" style={{ fontWeight:600 }}>
                      <span className={`promo-badge promo-${st.toLowerCase()}`}>{st}</span>
                    </td>
                    <td className="ph-td" style={{ whiteSpace:'nowrap' }}>
                      <button className="ph-btn ph-btn--success" onClick={()=> openEdit(p)}>Sửa</button>
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
        <div className="profile-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget){ setCreateOpen(false); setEditing(null);} }}>
          <div className="profile-modal" onMouseDown={e=> e.stopPropagation()} style={{ width:720, maxWidth:'96%', background:'#fff', borderRadius:14, padding:18 }}>
            <h3 style={{ marginTop:0, textAlign:'center' }}>{editing? 'Chỉnh sửa ưu đãi' : 'Tạo ưu đãi mới'}</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(240px,1fr))', gap:16 }}>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Mã ưu đãi
                <input value={form.code} disabled={!!editing} onChange={e=> setForm(f=> ({ ...f, code:e.target.value.toUpperCase() }))} placeholder="WELCOME10" />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Loại giảm
                <select value={form.discountType} onChange={e=> setForm(f=> ({ ...f, discountType:e.target.value }))}>
                  <option value="PERCENT">Phần trăm</option>
                  <option value="FIXED">Cố định</option>
                </select>
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Giá trị giảm
                <input type="number" value={form.discountValue} onChange={e=> setForm(f=> ({ ...f, discountValue:e.target.value }))} placeholder="10 hoặc 100000" />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Giảm tối đa (nếu %)
                <input type="number" value={form.maxDiscount} disabled={form.discountType!=='PERCENT'} onChange={e=> setForm(f=> ({ ...f, maxDiscount:e.target.value }))} placeholder="200000" />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Đơn tối thiểu
                <input type="number" value={form.minOrderAmount} onChange={e=> setForm(f=> ({ ...f, minOrderAmount:e.target.value }))} placeholder="500000" />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Ngày bắt đầu
                <input type="datetime-local" value={form.startDate} onChange={e=> setForm(f=> ({ ...f, startDate:e.target.value }))} />
              </label>
              <label style={{ display:'flex', flexDirection:'column', gap:4 }}>Ngày kết thúc
                <input type="datetime-local" value={form.endDate} onChange={e=> setForm(f=> ({ ...f, endDate:e.target.value }))} />
              </label>
              <label style={{ display:'flex', flexDirection:'row', gap:8, alignItems:'center', marginTop:6 }}>Kích hoạt
                <input type="checkbox" checked={!!form.isActive} onChange={e=> setForm(f=> ({ ...f, isActive:e.target.checked }))} />
              </label>
              <label style={{ gridColumn:'1 / -1', display:'flex', flexDirection:'column', gap:4 }}>Mô tả
                <textarea rows={3} value={form.description} onChange={e=> setForm(f=> ({ ...f, description:e.target.value }))} placeholder="Mô tả ngắn..." />
              </label>
            </div>
            {/* Live preview */}
            <div style={{ marginTop:12, background:'#f8fafc', padding:'10px 12px', borderRadius:10, fontSize:13 }}>
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
            <div style={{ marginTop:18, display:'flex', gap:12, justifyContent:'center' }}>
              {editing ? (
                <>
                  <button className="ph-btn" onClick={submitEdit} disabled={saving}>{saving? 'Đang lưu...':'Lưu thay đổi'}</button>
                  <button className="ph-btn ph-btn--secondary" onClick={()=> { setCreateOpen(false); setEditing(null); }}>Hủy</button>
                </>
              ) : (
                <>
                  <button className="ph-btn" onClick={submitCreate} disabled={creating}>{creating? 'Đang tạo...':'Tạo mới'}</button>
                  <button className="ph-btn ph-btn--secondary" onClick={()=> { setCreateOpen(false); setEditing(null); }}>Hủy</button>
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

        .af-table th, .af-table td { padding:6px 8px; vertical-align:middle; }
        .af-table input, .af-table select, .af-table textarea { font-size:14px; border:1px solid #d7dbe0; border-radius:6px; background:#fff; }
        .af-table input, .af-table select { height:32px; line-height:32px; padding:4px 8px; }
        .af-table textarea { padding:6px 8px; }

        .ph-btn { cursor:pointer; }
        .profile-overlay { backdrop-filter: blur(2px); }
      `}</style>
    </div>
  );
}
