import React, { useEffect, useState, useCallback, useRef } from 'react';
import './RoomsBrowse.css'; // reuse rb-* styles

export default function ServicesBrowse({ inline=false, onClose }) {
  const [q, setQ] = useState('');
  const [hotelId, setHotelId] = useState('');
  const [status, setStatus] = useState('');
  const [hotels, setHotels] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [orderService, setOrderService] = useState(null);
  const [orderQty, setOrderQty] = useState(1);
  const [orderNote, setOrderNote] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderMsg, setOrderMsg] = useState('');
  const userEmail = (()=>{ try { const u = JSON.parse(localStorage.getItem('hmsUser')||'null'); return u?.email || ''; } catch { return ''; } })();
  const qtyRef = useRef(null);

  const loadHotels = useCallback(async ()=>{
    try {
      const r = await fetch('/api/hotels');
      if(!r.ok) throw new Error();
      const list = await r.json();
      if(Array.isArray(list)) setHotels(list);
    } catch { setHotels([]); }
  }, []);

  const loadServices = useCallback(async ()=>{
    setLoading(true); setError('');
    try {
      const url = new URL('/api/services', window.location.origin);
      if(q) url.searchParams.set('q', q);
      if(hotelId) url.searchParams.set('hotelId', hotelId);
      const r = await fetch(url.toString());
      if(!r.ok) throw new Error('Không tải được dịch vụ');
      const j = await r.json();
      const list = Array.isArray(j.items)? j.items: [];
      const filtered = status ? list.filter(s => (s.status||'').toLowerCase() === status.toLowerCase()) : list;
      setItems(filtered);
    } catch(e){ setError(e.message||'Lỗi tải dữ liệu'); setItems([]);} finally { setLoading(false); }
  }, [q, hotelId, status]);

  useEffect(()=>{ loadHotels(); }, [loadHotels]);
  useEffect(()=>{ loadServices(); }, [loadServices]);

  const openDetail = (svc) => { setDetail(svc); setDetailOpen(true); };
  const closeDetail = () => { setDetailOpen(false); setDetail(null); };

  useEffect(()=>{
    const esc = e => { if(e.key==='Escape'){ if(orderService) { setOrderService(null); } else if(detailOpen) closeDetail(); else if(onClose && inline) onClose(); } };
    window.addEventListener('keydown', esc); return ()=> window.removeEventListener('keydown', esc);
  }, [detailOpen, inline, onClose, orderService]);

  useEffect(()=>{ if(orderService && qtyRef.current){ try { qtyRef.current.focus(); } catch {} } }, [orderService]);

  const statusBadge = (s) => {
    const v = String(s||'').toLowerCase();
    if(v==='active') return <span className="rb-badge available">Hoạt động</span>;
    if(v==='inactive') return <span className="rb-badge maintenance">Tạm dừng</span>;
    return <span className="rb-badge available">Hoạt động</span>;
  };

  // Normalize stored icon path similar to AdminServices logic.
  const resolveIconPath = (p) => {
    if(!p) return '';
    let v = String(p).trim();
    if(!v) return '';
    v = v.replace(/\\/g,'/');
    if(/^https?:\/\//i.test(v)) return v; // absolute URL stays
    if(!v.startsWith('/')) v = '/' + v; // ensure leading slash for public assets
    return v;
  };

  return (
    <div style={{ padding: inline? '8px 14px 24px' : '24px 24px 40px' }}>
      {inline && <button className="rb-btn gradient" style={{ marginBottom:14, borderRadius:28 }} onClick={()=>onClose&&onClose()}>&larr; Quay lại</button>}

  <div className="rb-overlay-animate rb-panel" onMouseDown={e=>e.stopPropagation()}>
        <div className="rb-heading-wrap">
          <h2 className="rb-heading">Danh sách dịch vụ</h2>
          <div className="rb-total-count">Tổng: {items.length} {loading && <span className="rb-muted" style={{ fontWeight:400 }}>(Đang tải...)</span>}</div>
        </div>
        <div className="rb-filters">
          <div className="rb-field">
            <label>Từ khóa</label>
            <input className="rb-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Tên / mô tả" />
          </div>
          <div className="rb-field">
            <label>Khách sạn</label>
            <div className="rb-select-wrap">
              <select className="rb-select" value={hotelId} onChange={e=>setHotelId(e.target.value)}>
                <option value="">Tất cả</option>
                {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          </div>
          <div className="rb-field">
            <label>Trạng thái</label>
            <div className="rb-select-wrap">
              <select className="rb-select" value={status} onChange={e=>setStatus(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="Active">Hoạt động</option>
                <option value="Inactive">Tạm dừng</option>
              </select>
            </div>
          </div>
        </div>
        <div className="rb-table-shell">
          <div className="rb-table-head" style={{ gridTemplateColumns:'90px 1fr 1.5fr 120px 140px 120px 120px' }}>
            <div className="rb-cell">Icon</div>
            <div className="rb-cell">Tên</div>
            <div className="rb-cell">Mô tả</div>
            <div className="rb-cell">Giá</div>
            <div className="rb-cell">Khách sạn</div>
            <div className="rb-cell">Trạng thái</div>
            <div className="rb-cell">Đặt</div>
          </div>
          <div className="rb-table-body">
            {loading ? <div className="rb-row"><div className="rb-cell">Đang tải...</div></div> : error ? <div className="rb-row"><div className="rb-cell" style={{ color:'#b42318' }}>{error}</div></div> : items.length===0 ? <div className="rb-row"><div className="rb-cell">Không có dịch vụ.</div></div> : items.map((s, idx) => (
              <div key={s.id} className="rb-row" style={{ gridTemplateColumns:'90px 1fr 1.5fr 120px 140px 120px 120px', animationDelay:`${Math.min(idx,12)*30}ms` }}>
                <div className="rb-cell">
                  {s.icon ? <img src={resolveIconPath(s.icon)} alt="icon" style={{ width:54, height:54, objectFit:'cover', borderRadius:10, border:'1px solid #eee', background:'#fafafa' }} onError={(e)=>{ e.currentTarget.style.display='none'; e.currentTarget.parentElement && (e.currentTarget.parentElement.innerHTML='<div style=\'width:54px;height:54px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#666;border:1px dashed #ccc;border-radius:10px;background:#fff\'>No icon</div>'); }} /> : <div className="rb-img-wrap" style={{ width:54, height:54, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, border:'1px dashed #ccc', borderRadius:10, color:'#666', background:'#fff' }}>No icon</div>}
                </div>
                <div className="rb-cell" style={{ fontWeight:600 }}>
                  <button className="rb-btn outline" style={{ padding:'4px 6px', minHeight:32, fontSize:'.65rem' }} onClick={()=>openDetail(s)}>{s.name}</button>
                </div>
                <div className="rb-cell rb-desc" title={s.description}>{s.description || '—'}</div>
                <div className="rb-cell" style={{ fontSize:13 }}>{Number(s.price||0).toLocaleString('vi-VN')} VND</div>
                <div className="rb-cell">{s.hotelName || '—'}</div>
                <div className="rb-cell">{statusBadge(s.status)}</div>
                <div className="rb-cell">
                  <button className="rb-btn primary" disabled={String(s.status||'').toLowerCase()==='inactive'} onClick={()=>{ setOrderService(s); setOrderQty(1); setOrderNote(''); setOrderMsg(''); }} style={{ width:'100%' }}>Đặt</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {detailOpen && detail && (
        <div className="rb-modal-backdrop" onMouseDown={(e)=>{ if(e.target===e.currentTarget) closeDetail(); }}>
          <div className="rb-modal" onMouseDown={e=>e.stopPropagation()}>
            <button className="rb-modal-close" onClick={closeDetail} aria-label="Đóng">×</button>
            <h3 style={{ marginTop:0, marginBottom:14 }}>{detail.name}</h3>
            <div style={{ display:'flex', gap:22, flexWrap:'wrap' }}>
              <div style={{ flex:'0 0 200px' }}>
                <div className="rb-img-wrap" style={{ width:160, height:160, borderRadius:12, marginBottom:10 }}>
                  {detail.icon ? <img src={resolveIconPath(detail.icon)} alt="icon" onError={(e)=>{ e.currentTarget.style.display='none'; e.currentTarget.parentElement && (e.currentTarget.parentElement.innerHTML='<div style=\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:13px;color:#666;border:1px dashed #ccc;border-radius:12px;background:#fff\'>No icon</div>'); }} /> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'#666', border:'1px dashed #ccc', borderRadius:12 }}>No icon</div>}
                </div>
                <div style={{ fontSize:'.75rem', lineHeight:1.4 }}>
                  <div><strong>Giá:</strong> {Number(detail.price||0).toLocaleString('vi-VN')} VND</div>
                  <div><strong>Trạng thái:</strong> {statusBadge(detail.status)}</div>
                  <div><strong>Khách sạn:</strong> {detail.hotelName || '—'}</div>
                </div>
              </div>
              <div style={{ flex:'1 1 300px', minWidth:250 }}>
                <p style={{ whiteSpace:'pre-wrap', lineHeight:1.5, fontSize:'.8rem' }}>{detail.description || 'Không có mô tả.'}</p>
              </div>
            </div>
            <div style={{ marginTop:20, textAlign:'right' }}>
              <button className="rb-btn outline" onClick={closeDetail}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {orderService && (
        <div className="rb-modal-backdrop" onMouseDown={e=>{ if(e.target===e.currentTarget) setOrderService(null); }}>
          <div className="rb-modal" onMouseDown={e=>e.stopPropagation()} style={{ maxWidth:520 }}>
            <button className="rb-modal-close" onClick={()=>setOrderService(null)} aria-label="Đóng">×</button>
            <h3 style={{ marginTop:0, marginBottom:14, fontSize:'1.05rem' }}>Đặt dịch vụ</h3>
            <div style={{ fontSize:'.75rem', marginBottom:12 }}><strong>Dịch vụ:</strong> {orderService.name}</div>
            {!userEmail && <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', padding:8, borderRadius:6, fontSize:'.7rem', marginBottom:12 }}>Bạn cần đăng nhập để đặt dịch vụ.</div>}
            <form onSubmit={async (e)=>{ e.preventDefault(); if(!userEmail) return; setOrderLoading(true); setOrderMsg(''); try { const res = await fetch(`/api/services/${orderService.id}/order`, { method:'POST', headers:{ 'Content-Type':'application/json', 'x-user-email': userEmail }, body: JSON.stringify({ quantity: orderQty, note: orderNote }) }); if(!res.ok){ const t = await res.json().catch(()=>({})); throw new Error(t.message||'Đặt thất bại'); } setOrderMsg('Đặt thành công!'); setTimeout(()=>{ setOrderService(null); }, 900); } catch(err){ setOrderMsg(err.message||'Lỗi đặt'); } finally { setOrderLoading(false); } }}>
              <div className="rb-field" style={{ marginBottom:10 }}>
                <label>Số lượng</label>
                <input ref={qtyRef} type="number" min={1} className="rb-input" value={orderQty} onChange={e=>setOrderQty(Number(e.target.value)||1)} required />
              </div>
              <div className="rb-field" style={{ marginBottom:14 }}>
                <label>Ghi chú</label>
                <textarea className="rb-input" style={{ minHeight:80, resize:'vertical' }} value={orderNote} onChange={e=>setOrderNote(e.target.value)} placeholder="Yêu cầu thêm (không bắt buộc)" />
              </div>
              {orderMsg && <div style={{ marginBottom:10, fontSize:'.7rem', color: orderMsg.includes('thành công')? '#059669':'#b42318' }}>{orderMsg}</div>}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button type="button" className="rb-btn outline" onClick={()=>setOrderService(null)}>Hủy</button>
                <button type="submit" className="rb-btn primary" disabled={orderLoading||!userEmail}>{orderLoading? 'Đang gửi...' : 'Xác nhận'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
