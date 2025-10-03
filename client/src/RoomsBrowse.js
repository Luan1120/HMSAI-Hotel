import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './RoomsBrowse.css';

/* Public rooms browsing page
   Features:
   - Filters: keyword (room number / type), hotel, room type
   - Uses /api/admin/rooms for richer data if user is Admin/Staff (auth header) else falls back to room types + derived rooms not available => we attempt public-like fetch.
   NOTE: Currently there is no public rooms endpoint returning individual rooms; we will call /api/admin/rooms without auth -> backend will 401.
   Fallback strategy: fetch room types (/api/room-types) + display them as pseudo-room rows with aggregate info.
*/
export default function RoomsBrowse({ inline=false, onClose }){
  // Helper to normalize image paths returned from API (may be stored without leading slash or uploads prefix)
  const normalizeImage = (p) => {
    if(!p) return null;
    try {
      // Already absolute (http/https/data) or starts with /uploads or /static
      if(/^https?:\/\//i.test(p) || /^data:/i.test(p)) return p;
      if(p.startsWith('/')) return p; // assume valid root-relative
      // If filename only, prepend uploads path
      return '/uploads/' + p.replace(/^\/+/, '');
    } catch { return p; }
  };
  const [q, setQ] = useState('');
  const [hotelId, setHotelId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [hotels, setHotels] = useState([]);
  const [types, setTypes] = useState([]);
  const [rooms, setRooms] = useState([]); // unified view
  const [detail, setDetail] = useState(null); // basic selected row (list data)
  const [detailFull, setDetailFull] = useState(null); // full fetched room detail
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewsModal, setReviewsModal] = useState(null); // { roomId, loading, data }
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsData, setReviewsData] = useState(null); // { reviews, avgRating }
  const [reviewsError, setReviewsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingRoom, setBookingRoom] = useState(null);
  const [bkCheckIn, setBkCheckIn] = useState('');
  const [bkCheckOut, setBkCheckOut] = useState('');
  const [bkAdults, setBkAdults] = useState(1);
  const [bkChildren, setBkChildren] = useState(0);
  const [bkPayMethod, setBkPayMethod] = useState('MOMO');
  const [bkAgree, setBkAgree] = useState(false);
  const [bkLoading, setBkLoading] = useState(false);
  const [bkMsg, setBkMsg] = useState('');
  // Prevent duplicate rapid submissions / re-init after success redirect
  const [bkSubmitted, setBkSubmitted] = useState(false);
  // Promotions removed
  const bkFirstFieldRef = useRef(null);
  const authEmail = (()=>{ try { const u = JSON.parse(localStorage.getItem('hmsUser')||'null'); return u?.email || ''; } catch { return ''; } })();
  const nights = useMemo(()=>{ if(!bkCheckIn || !bkCheckOut) return 0; const inD=new Date(bkCheckIn); const outD=new Date(bkCheckOut); const ms= outD - inD; return ms>0? Math.round(ms/86400000):0; }, [bkCheckIn, bkCheckOut]);
  const totalPrice = useMemo(()=> nights * Number(bookingRoom?.price||0), [nights, bookingRoom]);
  const finalPrice = totalPrice; // no promotions
  const dateError = useMemo(()=>{ if(!bkCheckIn || !bkCheckOut) return ''; const inD=new Date(bkCheckIn); const outD=new Date(bkCheckOut); if(!(outD>inD)) return 'Ngày trả phải sau ngày nhận'; return ''; }, [bkCheckIn, bkCheckOut]);
  const submitEnabled = !!authEmail && !bkLoading && !bkSubmitted && bookingRoom && bkCheckIn && bkCheckOut && !dateError && bkAdults>=1 && nights>0 && bkAgree;

  const isPrivileged = useMemo(()=>{ try { const u = JSON.parse(localStorage.getItem('hmsUser')||'null'); return ['admin','staff'].includes(String(u?.role||'').toLowerCase()); } catch { return false; } }, []);

  const loadHotels = async () => {
    try {
      const res = await fetch('/api/hotels');
      if(!res.ok) throw new Error();
      const list = await res.json();
      setHotels(Array.isArray(list)? list: []);
    } catch { setHotels([]); }
  };
  const loadTypes = async (hid) => {
    try {
      const url = new URL('/api/room-types', window.location.origin);
      if(hid) url.searchParams.set('hotelId', hid);
      const res = await fetch(url);
      if(!res.ok) throw new Error();
      const list = await res.json();
      setTypes(Array.isArray(list)? list: []);
    } catch { setTypes([]); }
  };

  const loadRooms = async () => {
    setLoading(true); setError('');
    try {
      const origin = window.location.origin;
      const url = new URL('/api/rooms', origin);
      if(q) url.searchParams.set('q', q);
      if(hotelId) url.searchParams.set('hotelId', hotelId);
      if(typeId) url.searchParams.set('typeId', typeId);
      console.log('[RoomsBrowse] Fetch rooms:', url.toString());
      const res = await fetch(url, { headers:{ 'Accept':'application/json' } });
      if(!res.ok){
        const text = await res.text().catch(()=> '');
        throw new Error('Không tải được phòng' + (text? ' - ' + text.substring(0,120): '')); }
      const j = await res.json();
      if(!j || typeof j !== 'object') throw new Error('Phản hồi không hợp lệ');
      const list = Array.isArray(j.items)? j.items: (Array.isArray(j.rooms)? j.rooms: []);
      console.log('[RoomsBrowse] Received rooms count:', list.length);
      setRooms(list.map(r => {
        const imgsRaw = Array.isArray(r.images)? r.images : [];
        const imgs = imgsRaw.map(im=> normalizeImage(im)).filter(Boolean);
        const first = imgs.length? imgs[0] : null;
        return {
          id: r.id,
          roomNumber: r.roomNumber || '-',
            floor: r.floor || null,
            hotelName: r.hotelName,
            roomType: r.roomType,
            price: r.price,
            status: r.status || 'Available',
            description: r.description || '',
            image: first,
            images: imgs
        };
      }));
    } catch(e){ console.error('[RoomsBrowse] loadRooms error', e); setError(e.message||'Lỗi tải dữ liệu'); setRooms([]);} finally { setLoading(false); }
  };

  useEffect(()=>{ loadHotels(); loadTypes(); }, []);
  useEffect(()=>{ loadTypes(hotelId); }, [hotelId]);
  useEffect(()=>{ loadRooms(); }, [q, hotelId, typeId]);

  const statusLabel = (s) => {
    const v = String(s||'').toLowerCase();
    if(v==='available') return <span className="rb-badge available">Trống</span>;
    if(v==='occupied') return <span className="rb-badge booked">Đang ở</span>;
    if(v==='cleaning') return <span className="rb-badge maintenance">Dọn dẹp</span>;
    if(v==='maintenance') return <span className="rb-badge maintenance">Bảo trì</span>;
    return <span className="rb-badge available">Trống</span>;
  };

  const openDetail = async (r) => {
    setDetail(r);
    setDetailFull(null);
    if(!r?.id) return;
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/rooms/${r.id}`);
      if(!res.ok) throw new Error('Không tải được chi tiết');
      const j = await res.json();
      setDetailFull(j.room || null);
    } catch(e){ console.error('detail fetch error', e); } finally { setDetailLoading(false); }
  };
  const closeDetail = () => { setDetail(null); setDetailFull(null); };

  const openReviews = async (r) => {
    if(!r?.id) return;
    setReviewsModal(r);
    setReviewsLoading(true); setReviewsError(''); setReviewsData(null);
    try {
      const res = await fetch(`/api/rooms/${r.id}/reviews`);
      if(!res.ok) throw new Error('Không tải được đánh giá');
      const j = await res.json();
      setReviewsData({ reviews: j.reviews||[], avgRating: j.avgRating||0 });
    } catch(e){ setReviewsError(e.message||'Lỗi tải đánh giá'); } finally { setReviewsLoading(false); }
  };
  const closeReviews = () => { setReviewsModal(null); setReviewsData(null); };

  // ESC key to close detail modal
  useEffect(()=>{
    const handler = (e) => {
      if(e.key === 'Escape') {
        if(bookingOpen){ setBookingOpen(false); setBookingRoom(null); }
        else if(detail) closeDetail();
        else if(onClose && inline) onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return ()=> window.removeEventListener('keydown', handler);
  }, [detail, inline, onClose, bookingOpen]);

  useEffect(()=>{ if(bookingOpen && bkFirstFieldRef.current){ try { bkFirstFieldRef.current.focus(); } catch {} } }, [bookingOpen]);

  // Single horizontal scrollbar (top) refs
  const topScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const syncScrolling = (source, target) => {
    if(!source || !target) return;
    if(target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft;
  };
  useEffect(()=>{
  const topEl = topScrollRef.current;
  const botEl = bodyScrollRef.current;
  if(!topEl || !botEl) return;
  const onTop = () => syncScrolling(topEl, botEl);
  const onBot = () => syncScrolling(botEl, topEl);
  topEl.addEventListener('scroll', onTop);
  botEl.addEventListener('scroll', onBot);
    const resizeHandler = () => { // keep width track by forcing reflow
      if(topEl && botEl) {
        // match scrollLeft after resize
        syncScrolling(botEl, topEl);
      }
    };
    window.addEventListener('resize', resizeHandler);
    return ()=>{ topEl.removeEventListener('scroll', onTop); botEl.removeEventListener('scroll', onBot); window.removeEventListener('resize', resizeHandler); };
  }, [rooms.length]);

  return (
    <div className={inline? '' : 'home-root'} style={{ paddingTop: inline? 0 : 80 }}>
      {!inline && (
        <header className="home-header" style={{ position:'sticky', top:0 }}>
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
      )}
      <div style={{ padding: inline? '8px 14px 24px' : '24px 24px 40px' }}>
        {inline && (
          <button className="rb-btn gradient" style={{ marginBottom:14, borderRadius:28 }} onClick={()=>onClose && onClose()}>&larr; Quay lại</button>
        )}
  <div className="rb-overlay-animate rb-panel" onMouseDown={e=>e.stopPropagation()}>
          <div className="rb-heading-wrap">
            <h2 className="rb-heading">Danh sách phòng</h2>
            <div className="rb-total-count" aria-live="polite">Tổng: {rooms.length} {loading && <span className="rb-muted" style={{ fontWeight:400 }}>(Đang tải...)</span>}</div>
          </div>
          <div className="rb-filters">
            <div className="rb-field">
              <label>Từ khóa</label>
              <input className="rb-input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Số phòng / loại / khách sạn" />
            </div>
            <div className="rb-field">
              <label>Khách sạn</label>
              <div className="rb-select-wrap">
                <select className="rb-select" value={hotelId} onChange={e=>setHotelId(e.target.value)}>
                  <option value="">Tất cả</option>
                  {hotels.map(h=> <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
            </div>
            <div className="rb-field">
              <label>Hạng phòng</label>
              <div className="rb-select-wrap">
                <select className="rb-select" value={typeId} onChange={e=>setTypeId(e.target.value)}>
                  <option value="">Tất cả</option>
                  {types.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="rb-table-shell">
            <div className="rb-table-head" style={{ gridTemplateColumns:'150px 130px 1.1fr 1.1fr 120px 120px 2fr 200px' }}>
              <div className="rb-cell">Ảnh</div>
              <div className="rb-cell">Phòng</div>
              <div className="rb-cell">Khách sạn</div>
              <div className="rb-cell">Loại phòng</div>
              <div className="rb-cell">Giá/đêm</div>
              <div className="rb-cell">Trạng thái</div>
              <div className="rb-cell">Mô tả</div>
              <div className="rb-cell">Hành động</div>
            </div>
            <div ref={bodyScrollRef} className="rb-table-body">
              {loading ? <div className="rb-row"><div className="rb-cell">Đang tải...</div></div> : error ? <div className="rb-row"><div className="rb-cell" style={{ color:'#b42318' }}>{error}</div></div> : rooms.length===0 ? <div className="rb-row"><div className="rb-cell">Không có phòng phù hợp.</div></div> : rooms.map((r, idx) => {
                const roomLabel = r.roomNumber === '-' ? '-' : `${r.roomNumber}${r.floor ? ' - T' + r.floor : ''}`;
                return (
                  <div key={r.id} className="rb-row" style={{ gridTemplateColumns:'150px 130px 1.1fr 1.1fr 120px 120px 2fr 200px', animationDelay: `${Math.min(idx, 12)*30}ms` }}>
                    <div className="rb-cell image-cell">
                      <div className="rb-img-wrap">
                        {r.image ? <img src={r.image} alt="img" /> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#777' }}>No image</div>}
                      </div>
                    </div>
                    <div className="rb-cell" title={roomLabel}>{roomLabel}</div>
                    <div className="rb-cell">{r.hotelName}</div>
                    <div className="rb-cell">{r.roomType}</div>
                    <div className="rb-cell" style={{ fontSize:13 }}>{Number(r.price||0).toLocaleString('vi-VN')} VND</div>
                    <div className="rb-cell">{statusLabel(r.status)}</div>
                    <div className="rb-cell rb-desc" title={r.description}>{r.description || '—'}</div>
                    <div className="rb-cell rb-actions" style={{ gap:8 }}>
                      <button className="rb-btn primary" type="button" disabled={['Booked','Maintenance','Unavailable','Occupied'].includes((r.status||'').toString())} onClick={()=>{ if(['Booked','Maintenance','Unavailable','Occupied'].includes((r.status||'').toString())) return; setBookingRoom(r); setBookingOpen(true); setBkCheckIn(''); setBkCheckOut(''); setBkAdults(1); setBkChildren(0); setBkMsg(''); setBkSubmitted(false); }}>
                        {['Booked','Maintenance','Unavailable','Occupied'].includes((r.status||'').toString()) ? 'ĐÃ ĐƯỢC ĐẶT' : 'Đặt phòng'}
                      </button>
                      <button className="rb-btn outline" type="button" onClick={()=>openReviews(r)}>Đánh giá</button>
                      <button className="rb-btn outline" type="button" onClick={()=>openDetail(r)}>Chi tiết</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {detail && (
          <div className="rb-modal-backdrop" onMouseDown={(e)=>{ if(e.target===e.currentTarget) closeDetail(); }}>
            <div className="rb-modal" onMouseDown={e=>e.stopPropagation()}>
              <button className="rb-modal-close" onClick={closeDetail} aria-label="Đóng">×</button>
              <h3 style={{ marginTop:0, marginBottom:14, fontSize:'1.15rem' }}>
                {detailFull?.roomNumber ? `${detailFull.roomNumber}${detailFull.floor? ' - T'+detailFull.floor:''}` : (detail.roomType)}
              </h3>
              {detailLoading && <div className="rb-muted" style={{ fontSize:'.75rem' }}>Đang tải chi tiết...</div>}
              <div style={{ display:'flex', gap:24, flexWrap:'wrap', opacity: detailLoading? .6: 1 }}>
                <div style={{ flex:'0 0 260px' }}>
                  <div className="rb-img-wrap" style={{ width:'100%', height:180 }}>
                    { (detailFull?.images && detailFull.images[0]) ? <img src={normalizeImage(detailFull.images[0])} alt="" /> : (detail.image ? <img src={detail.image} alt="" /> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#666' }}>No image</div>) }
                  </div>
                  <div style={{ marginTop:10, fontSize:'.75rem', lineHeight:1.3 }}>
                    <div><strong>Loại:</strong> {detailFull?.roomType || detail.roomType}</div>
                    <div><strong>Giá:</strong> {Number((detailFull?.price ?? detail.price)||0).toLocaleString('vi-VN')} VND/đêm</div>
                    {detailFull?.maxAdults != null && <div><strong>Người lớn tối đa:</strong> {detailFull.maxAdults}</div>}
                    {detailFull?.maxChildren != null && <div><strong>Trẻ em tối đa:</strong> {detailFull.maxChildren}</div>}
                    <div><strong>Trạng thái:</strong> {statusLabel(detailFull?.status || detail.status)}</div>
                  </div>
                  {detailFull?.images?.length > 1 && (
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:10 }}>
                      {detailFull.images.slice(1,6).map((im,i)=>(
                        <div key={i} className="rb-img-wrap" style={{ width:54, height:40 }}>
                          <img src={normalizeImage(im)} alt="thumb" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ flex:'1 1 300px', minWidth:240 }}>
                  <p style={{ whiteSpace:'pre-wrap', lineHeight:1.45, fontSize:'.78rem' }}>{detailFull?.description || detail.description || 'Không có mô tả.'}</p>
                </div>
              </div>
              <div style={{ marginTop:22, display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button className="rb-btn primary" disabled={['Booked','Maintenance','Unavailable','Occupied'].includes(((detailFull?.status)||(detail.status)||'').toString())} onClick={()=>{ if(['Booked','Maintenance','Unavailable','Occupied'].includes(((detailFull?.status)||(detail.status)||'').toString())) return; 
                  // Prefer enriched detailFull (has full images array) if available
                  if(detailFull){
                    const imgs = Array.isArray(detailFull.images)? detailFull.images.map(im=> normalizeImage(im)).filter(Boolean): [];
                    setBookingRoom({ ...detail, ...detailFull, images: imgs, image: imgs[0]||detail.image });
                  } else {
                    setBookingRoom(detail);
                  }
                  setBookingOpen(true); setBkCheckIn(''); setBkCheckOut(''); setBkAdults(1); setBkChildren(0); setBkMsg(''); setBkSubmitted(false); }}>
                  {['Booked','Maintenance','Unavailable','Occupied'].includes(((detailFull?.status)||(detail.status)||'').toString()) ? 'ĐÃ ĐƯỢC ĐẶT' : 'Đặt phòng'}
                </button>
                <button className="rb-btn outline" onClick={closeDetail}>Đóng</button>
              </div>
            </div>
          </div>
        )}

        {bookingOpen && bookingRoom && (
          <div className="rb-modal-backdrop" onMouseDown={(e)=>{ if(e.target===e.currentTarget) { setBookingOpen(false); setBookingRoom(null); } }}>
            <div className="rb-modal rb-booking-fast-animate" role="dialog" aria-modal="true" aria-label="Đặt phòng nhanh" onMouseDown={e=>e.stopPropagation()} style={{ maxWidth:600 }}>
              <button className="rb-modal-close" onClick={()=>{ setBookingOpen(false); setBookingRoom(null); }} aria-label="Đóng">×</button>
              <div className="rb-booking-fast">
                <h3>Đặt phòng nhanh</h3>
                <div className="rb-booking-room-image" style={{ marginBottom:14 }}>
                  <div className="rb-img-wrap" style={{ width:'100%', height:160, borderRadius:14, overflow:'hidden', boxShadow:'0 2px 6px rgba(0,0,0,0.15)' }}>
                    { (bookingRoom.images && bookingRoom.images[0]) ? <img src={bookingRoom.images[0]} alt="Phòng" /> : (bookingRoom.image ? <img src={bookingRoom.image} alt="Phòng" /> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#666' }}>Không có ảnh</div>) }
                  </div>
                  {bookingRoom.images && bookingRoom.images.length > 1 && (
                    <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                      {bookingRoom.images.slice(1,6).map((im,i)=>(
                        <button key={i} type="button" onClick={()=>{ const copy=[...bookingRoom.images]; const main=copy[0]; copy[0]=copy[i+1]; copy[i+1]=main; setBookingRoom({ ...bookingRoom, images: copy, image: copy[0] }); }} className="rb-img-wrap" style={{ width:54, height:40, cursor:'pointer', opacity:.9 }} title="Xem ảnh">
                          <img src={im} alt="thumb" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rb-booking-meta">
                  <strong>Phòng:</strong> {bookingRoom.roomNumber === '-' ? bookingRoom.roomType : bookingRoom.roomNumber}{bookingRoom.floor? ` • Tầng ${bookingRoom.floor}`:''}<br />
                  <strong>Loại:</strong> {bookingRoom.roomType}<br />
                  <strong>Giá:</strong> {Number(bookingRoom.price||0).toLocaleString('vi-VN')} VND/đêm
                </div>
                <form onSubmit={async (e)=>{ 
                  e.preventDefault(); 
                  setBkMsg(''); 
                  if(!authEmail){ setBkMsg('Vui lòng đăng nhập để đặt phòng.'); return; }
                  if(!submitEnabled){ return; }
                  try { 
                    setBkLoading(true);
                    setBkSubmitted(true);
                    // Tạo token và summary tương tự RoomTypeInline flow để chuyển sang trang thanh toán
                    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
                    const pad2 = (n)=> String(n).padStart(2,'0');
                    const nowD = new Date();
                    const bookingCode = `HMS${nowD.getFullYear()}${pad2(nowD.getMonth()+1)}${pad2(nowD.getDate())}`;
                    const roomNames = `Phòng ${bookingRoom.roomNumber}${bookingRoom.floor?` • Tầng ${bookingRoom.floor}`:''}`;
                    const summary = {
                      token,
                      code: bookingCode,
                      hotelId: bookingRoom.hotelId || null,
                      hotel: bookingRoom.hotelName || '',
                      roomType: bookingRoom.roomType || '',
                      roomNames,
                      checkIn: bkCheckIn,
                      checkOut: bkCheckOut,
                      checkInTime: '14:00',
                      checkOutTime: '12:00',
                      payMethod: bkPayMethod || 'MOMO',
                      userEmail: authEmail,
                      adults: bkAdults,
                      children: bkChildren,
                      rooms: [{ id: bookingRoom.id, number: bookingRoom.roomNumber, floor: bookingRoom.floor, price: bookingRoom.price, name: bookingRoom.roomNumber, adults: bkAdults, children: bkChildren }],
                      amount: (Number(bookingRoom.price||0) * nights) || 0,
                    };
                    // promotions removed
                    try { localStorage.setItem('hmsBooking:'+token, JSON.stringify(summary)); } catch {}
                    const q = [
                      `token=${encodeURIComponent(token)}`,
                      `code=${encodeURIComponent(summary.code)}`,
                      // pass gross amount; discount is read from summary on PaymentConfirm
                      `amount=${encodeURIComponent(summary.amount)}`,
                      `hid=${encodeURIComponent(summary.hotelId||'')}`,
                      `rn=${encodeURIComponent(roomNames)}`,
                      `rt=${encodeURIComponent(summary.roomType||'')}`,
                      `ci=${encodeURIComponent(summary.checkIn||'')}`,
                      `co=${encodeURIComponent(summary.checkOut||'')}`,
                      `ad=${encodeURIComponent(summary.adults)}`,
                      `ch=${encodeURIComponent(summary.children)}`
                    ].join('&');
                    window.location.href = '/payment/confirm?'+q;
                  } catch(err){
                    setBkMsg(err.message||'Lỗi khởi tạo thanh toán');
                    setBkSubmitted(false);
                  } finally { setBkLoading(false); }
                }}>
                  <div className="rb-booking-grid">
                    <div className="rb-booking-row">
                      <div className="rb-booking-field">
                        <label>Ngày nhận</label>
                        <input
                          ref={bkFirstFieldRef}
                          type="date"
                          min={new Date().toISOString().slice(0,10)}
                          value={bkCheckIn}
                          onChange={e=>{
                            const v = e.target.value;
                            setBkCheckIn(v);
                            // If check-out is before/equals new check-in, reset check-out
                            if(bkCheckOut && bkCheckOut <= v){
                              setBkCheckOut('');
                            }
                          }}
                          required
                        />
                      </div>
                      <div className="rb-booking-field">
                        <label>Ngày trả</label>
                        <input
                          type="date"
                          min={bkCheckIn ? (()=>{ const d=new Date(bkCheckIn); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })() : new Date().toISOString().slice(0,10)}
                          value={bkCheckOut}
                          onChange={e=>setBkCheckOut(e.target.value)}
                          disabled={!bkCheckIn}
                          required
                        />
                      </div>
                    </div>
                    <div className="rb-booking-row">
                      <div className="rb-booking-field">
                        <label>Người lớn</label>
                        <select
                          value={bkAdults}
                          onChange={e=>setBkAdults(Number(e.target.value))}
                        >
                          {Array.from({ length: (bookingRoom.maxAdults || 2) }, (_,i)=> i+1).map(v=> (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div className="rb-booking-field">
                        <label>Trẻ em</label>
                        <select
                          value={bkChildren}
                          onChange={e=>setBkChildren(Number(e.target.value))}
                        >
                          {Array.from({ length: (bookingRoom.maxChildren || 0) + 1 }, (_,i)=> i).map(v=> (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {dateError && <div className="rb-msg error" role="alert">{dateError}</div>}
                    {nights > 0 && (
                      <div className="rb-booking-summary" aria-live="polite">
                        <span><strong>{nights}</strong> đêm x {Number(bookingRoom.price||0).toLocaleString('vi-VN')} VND</span>
                        <span style={{ fontWeight:800 }}>{Number(totalPrice).toLocaleString('vi-VN')} VND</span>
                      </div>
                    )}
                    {/* Promotion UI removed */}
                    {(!authEmail) && <div className="rb-msg error">Vui lòng đăng nhập để đặt phòng.</div>}
                    {bkMsg && <div className={`rb-msg ${bkMsg.includes('thành công')? 'success':'error'}`}>{bkMsg}</div>}
                    <div className="rb-booking-row" style={{ marginTop:4 }}>
                      <div className="rb-booking-field" style={{ flex: '1 1 100%' }}>
                        <label>Phương thức thanh toán</label>
                        <select value={bkPayMethod} onChange={e=>setBkPayMethod(e.target.value)}>
                          <option value="MOMO">Ví điện tử MOMO</option>
                          <option value="ZALOPAY">ZaloPay</option>
                          <option value="VNPAY">VNPay</option>
                          <option value="CARD">Thẻ tín dụng/ghi nợ</option>
                        </select>
                      </div>
                    </div>
                    <label className="rb-terms">
                      <input type="checkbox" style={{ marginTop:2 }} checked={bkAgree} onChange={e=>setBkAgree(e.target.checked)} />
                      <span>Vui lòng đọc kĩ và đồng ý với điều khoản bằng cách đánh dấu vào ô bên cạnh</span>
                    </label>
                    <div className="rb-booking-actions">
                      <button type="button" className="rb-btn outline" onClick={()=>{ setBookingOpen(false); setBookingRoom(null); }}>Hủy</button>
                      <button type="submit" className="rb-btn primary" disabled={!submitEnabled}>{bkLoading? 'Đang xử lý...' : 'Thanh toán'}</button>
                    </div>
                  </div>
                </form>
                <div className="rb-booking-note">Cần nhiều phòng hoặc tùy chọn nâng cao? Vào giao diện hạng phòng để chọn nhiều phòng và phương thức thanh toán.</div>
              </div>
            </div>
          </div>
        )}

        {reviewsModal && (
          <div className="rb-modal-backdrop" onMouseDown={(e)=>{ if(e.target===e.currentTarget) closeReviews(); }}>
            <div className="rb-modal" onMouseDown={e=>e.stopPropagation()} style={{ maxWidth:860 }}>
              <button className="rb-modal-close" onClick={closeReviews} aria-label="Đóng">×</button>
              <h3 style={{ marginTop:0, marginBottom:10, fontSize:'1.05rem' }}>Đánh giá phòng {reviewsModal.roomNumber || reviewsModal.roomType}</h3>
              {reviewsLoading && <div className="rb-muted" style={{ fontSize:'.75rem' }}>Đang tải đánh giá...</div>}
              {reviewsError && <div style={{ color:'#b42318', fontSize:'.75rem' }}>{reviewsError}</div>}
              {(!reviewsLoading && !reviewsError) && (
                <div style={{ marginTop:6 }}>
                  <div style={{ fontSize:'.8rem', marginBottom:10 }}>
                    Trung bình: <strong>{(reviewsData?.avgRating||0).toFixed(1)}</strong>/5 ⭐
                  </div>
                  <div style={{ maxHeight:380, overflow:'auto', paddingRight:4, border:'1px solid #e5e7eb', borderRadius:8 }}>
                    {(!reviewsData || !reviewsData.reviews?.length) && <div className="rb-muted" style={{ padding:12, fontSize:'.75rem' }}>Chưa có đánh giá.</div>}
                    {reviewsData?.reviews?.map(rv => (
                      <div key={rv.id} style={{ padding:'10px 12px', borderBottom:'1px solid #eef2f6', fontSize:'.75rem', lineHeight:1.35 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', gap:12 }}>
                          <strong>{rv.customer}</strong>
                          <span style={{ color:'#f59e0b', fontWeight:600 }}>{rv.rating.toFixed(1)}⭐</span>
                        </div>
                        <div style={{ marginTop:4 }}>{rv.comment || <span className="rb-muted">(Không có nội dung)</span>}</div>
                        <div style={{ marginTop:4, fontSize:'.65rem', color:'#64748b' }}>{new Date(rv.createdAt).toLocaleString('vi-VN')}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop:18, textAlign:'right' }}>
                <button className="rb-btn outline" onClick={closeReviews}>Đóng</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
