import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { isLoggedIn } from './auth';
import './RoomsBrowse.css';
import showToast from './toast';

/* Public rooms browsing page
   Features:
   - Filters: keyword (room number / type), hotel, room type
   - Uses /api/admin/rooms for richer data if user is Admin/Staff (auth header) else falls back to room types + derived rooms not available => we attempt public-like fetch.
   NOTE: Currently there is no public rooms endpoint returning individual rooms; we will call /api/admin/rooms without auth -> backend will 401.
   Fallback strategy: fetch room types (/api/room-types) + display them as pseudo-room rows with aggregate info.
*/
export default function RoomsBrowse({ inline=false, onClose, restoredDraft=null, incomingBooking=null }){
  // Helper to normalize status strings into canonical tokens
  const canonicalStatus = (s) => {
    const v = String(s||'').trim().toLowerCase();
    if(!v) return 'available';
    if(v.includes('book')) return 'booked';
    if(v.includes('occup')) return 'occupied';
    if(v.includes('clean')) return 'cleaning';
    if(v.includes('maint')) return 'maintenance';
    if(v.includes('unavail') || v.includes('unavailable')) return 'unavailable';
    if(v==='available' || v==='trống' || v==='trong') return 'available';
    return v;
  };

  const isDisabledStatus = (s) => {
    const st = canonicalStatus(s);
    return ['booked','maintenance','unavailable','occupied','cleaning'].includes(st);
  };
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
  const [pendingBooking, setPendingBooking] = useState(null);
  const lastIncomingRef = useRef(null);
  const [bkCheckIn, setBkCheckIn] = useState('');
  const [bkCheckOut, setBkCheckOut] = useState('');
  const [bkAdults, setBkAdults] = useState(1);
  const [bkChildren, setBkChildren] = useState(0);
  const [bkPayMethod, setBkPayMethod] = useState('MOMO');
  const [bkAgree, setBkAgree] = useState(false);
  const [bkLoading, setBkLoading] = useState(false);
  const [bkMsg, setBkMsg] = useState('');
  const [bkAvailable, setBkAvailable] = useState(true);
  // local ISO date string (yyyy-mm-dd) to avoid UTC timezone issues from toISOString()
  const localISODate = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();
  // Prevent duplicate rapid submissions / re-init after success redirect
  const [bkSubmitted, setBkSubmitted] = useState(false);
  // Promotions removed
  const [promoCode, setPromoCode] = useState('');
  const [availablePromos, setAvailablePromos] = useState([]);
  const [showPromosList, setShowPromosList] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoLoadError, setPromoLoadError] = useState('');
  const flashTotalRef = useRef(null);
  const bkFirstFieldRef = useRef(null);
  const authEmail = (()=>{ try { const u = JSON.parse(localStorage.getItem('hmsUser')||'null'); return u?.email || ''; } catch { return ''; } })();
  const nights = useMemo(()=>{ if(!bkCheckIn || !bkCheckOut) return 0; const inD=new Date(bkCheckIn); const outD=new Date(bkCheckOut); const ms= outD - inD; return ms>0? Math.round(ms/86400000):0; }, [bkCheckIn, bkCheckOut]);
  const totalPrice = useMemo(()=> nights * Number(bookingRoom?.price||0), [nights, bookingRoom]);
  const finalPrice = useMemo(() => {
    try {
      if (appliedPromo && (typeof appliedPromo.final !== 'undefined') && appliedPromo.final !== null) return Number(appliedPromo.final);
      if (appliedPromo && typeof appliedPromo.discount === 'number') return Math.max(0, Number(totalPrice) - Number(appliedPromo.discount));
    } catch (e) { /* ignore */ }
    return Number(totalPrice);
  }, [totalPrice, appliedPromo]);
  const dateError = useMemo(()=>{ if(!bkCheckIn || !bkCheckOut) return ''; const inD=new Date(bkCheckIn); const outD=new Date(bkCheckOut); if(!(outD>inD)) return 'Ngày trả phải sau ngày nhận'; return ''; }, [bkCheckIn, bkCheckOut]);
  const submitEnabled = !!authEmail && !bkLoading && !bkSubmitted && bookingRoom && bkCheckIn && bkCheckOut && !dateError && bkAdults>=1 && nights>0 && bkAgree && !isDisabledStatus(bookingRoom?.status) && bkAvailable;

  const isPrivileged = useMemo(()=>{ try { const u = JSON.parse(localStorage.getItem('hmsUser')||'null'); return ['admin','staff'].includes(String(u?.role||'').toLowerCase()); } catch { return false; } }, []);
  const isAdmin = useMemo(()=>{ try { const u = JSON.parse(localStorage.getItem('hmsUser')||'null'); return String(u?.role||'').toLowerCase().includes('admin'); } catch { return false; } }, []);

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
  // Removed debug log for rooms fetch URL
      const res = await fetch(url, { headers:{ 'Accept':'application/json' } });
      if(!res.ok){
        const text = await res.text().catch(()=> '');
        throw new Error('Không tải được phòng' + (text? ' - ' + text.substring(0,120): '')); }
      const j = await res.json();
      if(!j || typeof j !== 'object') throw new Error('Phản hồi không hợp lệ');
  const list = Array.isArray(j.items)? j.items: (Array.isArray(j.rooms)? j.rooms: []);
  // Removed debug log for count of received rooms
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
      // After loading rooms, fetch availability for the near-term (today->tomorrow) so UI disables booked rooms on initial render
      try {
  const today = localISODate;
  const tomorrow = (()=>{ const d=new Date(); d.setDate(d.getDate()+1); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; })();
        const url = new URL('/api/rooms/availability', window.location.origin);
        url.searchParams.set('checkIn', today);
        url.searchParams.set('checkOut', tomorrow);
        if(hotelId) url.searchParams.set('hotelId', hotelId);
        const ares = await fetch(url.toString());
        if(ares.ok){ const aj = await ares.json(); const map = new Map((aj.items||[]).map(x=> [Number(x.roomId), !!x.available]));
          setRooms(prev => prev.map(r => ({ ...r, available: map.has(Number(r.id)) ? map.get(Number(r.id)) : true })));
        }
      } catch(e){ /* ignore availability fetch errors */ }
    } catch(e){ console.error('[RoomsBrowse] loadRooms error', e); setError(e.message||'Lỗi tải dữ liệu'); setRooms([]);} finally { setLoading(false); }
  };

  useEffect(()=>{ loadHotels(); loadTypes(); }, []);
  useEffect(()=>{ loadTypes(hotelId); }, [hotelId]);
  useEffect(()=>{ loadRooms(); }, [q, hotelId, typeId]);

  // Khi có restoredDraft từ HomePage (quay lại từ PaymentConfirm) -> tự động mở booking modal với dữ liệu cũ
  useEffect(()=>{
    if(restoredDraft && restoredDraft.rooms && Array.isArray(restoredDraft.rooms) && restoredDraft.rooms.length === 1 && !bookingOpen){
      // Chỉ hỗ trợ khôi phục 1 phòng (trường hợp đặt nhanh) hiện tại
      const r0 = restoredDraft.rooms[0];
      // Tìm phòng tương ứng trong danh sách đã load (nếu room id có trong restored draft)
      const found = rooms.find(r => Number(r.id) === Number(r0.id));
      if(found){
        // Mở booking modal với room found
        setBookingRoom(found);
        setBkCheckIn(restoredDraft.checkIn || '');
        setBkCheckOut(restoredDraft.checkOut || '');
        setBkAdults(Number(restoredDraft.adults||1));
        setBkChildren(Number(restoredDraft.children||0));
        setBookingOpen(true);
        // Áp dụng lại promo nếu có (để user chủ động re-apply; thực tế cần validate lại)
        if(restoredDraft.promo && restoredDraft.promo.code){
          try { setPromoCode(String(restoredDraft.promo.code).toUpperCase()); } catch {}
        }
        // Xóa draft trong sessionStorage sau khi dùng để tránh lặp
        try { sessionStorage.removeItem('hmsReturnBookingDraft'); } catch {}
      }
    }
  }, [restoredDraft, rooms, bookingOpen]);

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

  // Open booking modal for a room but refresh latest room detail first to avoid duplicate bookings
  const openBookingForRoom = async (r) => {
    try { const uRole = (()=>{ try { const u = JSON.parse(localStorage.getItem('hmsUser')||'null'); return u?.role || 'Customer'; } catch { return 'Customer'; } })(); if(String(uRole).toLowerCase().includes('admin')) { setBkMsg('Tài khoản Admin không được phép đặt phòng'); setBookingOpen(true); setBookingRoom(null); return; } } catch {}
    if(!r?.id) return;
    setBkMsg('');
    try {
      // Try to fetch the latest room detail from server
      const res = await fetch(`/api/rooms/${r.id}`);
      if(!res.ok) throw new Error('Không tải được trạng thái phòng');
      const j = await res.json();
      const rf = j.room || null;
      const imgsRaw = Array.isArray(rf?.images || r.images)? (rf?.images || r.images) : [];
      const imgs = imgsRaw.map(im=> normalizeImage(im)).filter(Boolean);
      const merged = {
        ...r,
        ...rf,
        images: imgs,
        image: imgs[0] || r.image,
        // ensure status field exists and use server-provided status if present
        status: (rf && (rf.status || rf.Status)) || r.status || 'Available'
      };
      // If user selected dates already, call availability endpoint to verify
      let available = true;
      if(bkCheckIn && bkCheckOut){
        try {
          const avRes = await fetch(`/api/rooms/${r.id}/availability?checkIn=${encodeURIComponent(bkCheckIn)}&checkOut=${encodeURIComponent(bkCheckOut)}`);
          if(avRes.ok){ const av = await avRes.json(); available = !!av.available; }
        } catch(e){ /* ignore availability check failure */ }
      }
      setBkAvailable(available);
      setBookingRoom(merged);
      // If the room is already in disabled status, show a message but still open modal so user can see details
      if(isDisabledStatus(merged.status) || available === false){
        setBkMsg('Phòng hiện không khả dụng (đã được đặt hoặc đang bảo trì). Không thể đặt.');
      }
      setBookingOpen(true);
      setBkCheckIn(''); setBkCheckOut(''); setBkAdults(1); setBkChildren(0); setBkSubmitted(false);
    } catch(e){
      console.error('openBookingForRoom error', e);
      // fallback to original object if fetch failed
      setBookingRoom(r);
      setBookingOpen(true);
      setBkMsg('Không thể kiểm tra trạng thái phòng, vui lòng thử lại.');
    }
  };

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

  useEffect(() => {
    if (!pendingBooking) return;
    const detail = pendingBooking.detail ? pendingBooking.detail : pendingBooking;
    if (!detail) {
      setPendingBooking(null);
      return;
    }
    const roomId = detail.roomId ? Number(detail.roomId) : null;
    if (roomId) {
      openBookingForRoom({ id: roomId });
      setPendingBooking(null);
      return;
    }
    if (detail.name) {
      const targetName = String(detail.name).toLowerCase();
      const match = rooms.find(r => String(r.roomType || r.name || '').toLowerCase() === targetName);
      if (match) {
        openBookingForRoom(match);
        setPendingBooking(null);
        return;
      }
      if (!q || q.toLowerCase() !== targetName) {
        setQ(detail.name);
      }
    }
    setPendingBooking(null);
  }, [pendingBooking, rooms, openBookingForRoom, q]);

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

  const loggedIn = isLoggedIn();

  useEffect(() => {
    if (!incomingBooking) return;
    if (lastIncomingRef.current === incomingBooking) return;
    lastIncomingRef.current = incomingBooking;
    setPendingBooking(incomingBooking);
  }, [incomingBooking]);
  // Helper: validate promo code with server and return normalized promo object
  const validatePromoServer = async (code) => {
    if (!code) throw new Error('Thiếu mã');
    try {
  const q = new URL('/api/promotions/validate', window.location.origin);
  q.searchParams.set('code', String(code).trim());
  q.searchParams.set('amount', String(totalPrice || 0));
  if (bookingRoom?.hotelId) q.searchParams.set('hotelId', String(bookingRoom.hotelId));
  if (bookingRoom?.id) q.searchParams.set('roomIds', String(bookingRoom.id));
      const r = await fetch(q.toString());
      if (!r.ok) { const t = await r.json().catch(()=>({})); throw new Error(t.message || 'Mã không hợp lệ'); }
  const j = await r.json();
  // Removed debug log for promo validation response
      // Prefer server-provided numbers. Local fields are fallback only.
      const promo = j.promo || {};
      const serverDiscount = typeof j.discount !== 'undefined' ? Number(j.discount) : null;
      const serverFinal = typeof j.final !== 'undefined' ? Number(j.final) : null;
      const dType = promo.discountType || j.discountType || null;
      const dVal = Number(promo.discountValue ?? j.discount ?? 0);
      // Enforce hotel mismatch RIGHT HERE (defensive, though server should already reject)
      if (promo && promo.hotelId && bookingRoom?.hotelId && Number(promo.hotelId) !== Number(bookingRoom.hotelId)) {
        throw new Error('Mã ưu đãi không áp dụng cho khách sạn này');
      }
      return {
        code: (j.code || promo.code || String(code)).toString().toUpperCase(),
        discount: serverDiscount !== null ? serverDiscount : Number(0),
        discountType: dType,
        discountValue: Number(dVal || 0),
        final: serverFinal !== null ? serverFinal : Number(0),
        raw: promo || null,
        serverRaw: j
      };
    } catch (e) { throw e; }
  };

  // Auto-drop promo if user switches sang phòng khách sạn khác (phòng khác hotel) sau khi áp dụng
  useEffect(() => {
    if (!appliedPromo || !appliedPromo.raw) return;
    const promoHotel = appliedPromo.raw.hotelId || appliedPromo.raw.HotelId || appliedPromo.raw.hotelID || appliedPromo.raw.HotelID || appliedPromo.raw.hotel || null;
    if (promoHotel && bookingRoom?.hotelId && Number(promoHotel) !== Number(bookingRoom.hotelId)) {
      setAppliedPromo(null);
      showToast('Đã gỡ mã ưu đãi không thuộc khách sạn hiện tại', { type: 'warning', duration: 2600 });
    }
  }, [bookingRoom?.hotelId]);

  function flashTotal() {
    try {
      const els = [];
      const a = document.querySelectorAll('.rb-booking-summary span:last-child, .rb-booking-summary strong');
      a.forEach(x => els.push(x));
      if (!els.length) return;
      els.forEach(el => { el.classList.add('total-highlight'); el.classList.add('apply'); });
      clearTimeout(flashTotalRef.current);
      flashTotalRef.current = setTimeout(() => { els.forEach(el => el.classList.remove('apply')); }, 600);
    } catch (e) { /* ignore */ }
  }

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
        {/* Promos list modal (quick booking) */}
        {showPromosList && (
          <div className="qr-overlay" onClick={() => setShowPromosList(false)}>
            <div className="qr-box" onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: '96%' }}>
              <div className="qr-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>Danh sách Ưu đãi</span>
                <button className="qr-close" onClick={() => setShowPromosList(false)}>Đóng</button>
              </div>
              <div style={{ maxHeight: 420, overflowY: 'auto', padding: 8 }}>
                {availablePromos.length === 0 ? (
                  <div style={{ padding: 12, color: '#666' }}>Không có ưu đãi nào.</div>
                ) : (
                  availablePromos.map(p => (
                    <div key={p.id} style={{ borderBottom: '1px solid #eee', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{p.code} {p.description ? `— ${p.description}` : ''}</div>
                        <div style={{ color: '#555', fontSize: 13 }}>
                          {p.discountType === 'PERCENT' ? (`Giảm ${p.discountValue}%${p.maxDiscount ? ` (tối đa ${Number(p.maxDiscount).toLocaleString('vi-VN')}đ)` : ''}`) : (`Giảm ${Number(p.discountValue||0).toLocaleString('vi-VN')}đ`)}
                          {p.minOrderAmount ? ` • Điều kiện: tối thiểu ${Number(p.minOrderAmount).toLocaleString('vi-VN')}đ` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="ph-btn" onClick={async () => {
                          try {
                            const normalized = await validatePromoServer(p.code);
                            setAppliedPromo(normalized);
                            setPromoCode(normalized.code);
                            setShowPromosList(false);
                            flashTotal();
                            showToast('Đã chọn ưu đãi: ' + normalized.code + ' • Giảm ' + normalized.discount.toLocaleString('vi-VN') + 'đ', { duration: 2000, type: 'success' });
                          } catch (e) {
                            showToast(e.message || 'Không áp dụng được ưu đãi này', { duration: 2400, type: 'error' });
                          }
                        }}>Chọn</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
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
                      <button
                        className="rb-btn primary"
                        type="button"
                        disabled={isDisabledStatus(r.status) || (r.available === false) || isAdmin}
                        onClick={() => {
                          if (isAdmin) { showToast('Tài khoản Admin không được phép đặt phòng', { duration: 2200, type: 'warn' }); return; }
                          if (isDisabledStatus(r.status) || (r.available === false)) return;
                          openBookingForRoom(r);
                        }}
                      >
                        {(isDisabledStatus(r.status) || (r.available === false)) ? 'ĐÃ ĐƯỢC ĐẶT' : 'Đặt phòng'}
                      </button>
                      <button className="rb-btn outline" type="button" onClick={() => openReviews(r)}>Đánh giá</button>
                      <button className="rb-btn outline" type="button" onClick={() => openDetail(r)}>Chi tiết</button>
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
                <button className="rb-btn primary" disabled={isDisabledStatus((detailFull?.status || detail.status || '')) || (detailFull?.available === false) || (detail?.available === false)} onClick={()=>{ if(isDisabledStatus((detailFull?.status || detail.status || '')) || (detailFull?.available === false) || (detail?.available === false)) return; openBookingForRoom(detailFull || detail); }}>
                  {(isDisabledStatus((detailFull?.status || detail.status || '')) || (detailFull?.available === false) || (detail?.available === false)) ? 'ĐÃ ĐƯỢC ĐẶT' : 'Đặt phòng'}
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
                  // final server-side availability check to avoid race conditions
                  if(!submitEnabled){ return; }
                  try {
                    if(bookingRoom && bookingRoom.id){
                      const avUrl = `/api/rooms/${bookingRoom.id}/availability?checkIn=${encodeURIComponent(bkCheckIn)}&checkOut=${encodeURIComponent(bkCheckOut)}`;
                      const chkRes = await fetch(avUrl);
                      if(chkRes.ok){ const chk = await chkRes.json(); if(chk && chk.available === false){ setBkMsg('Phòng không còn khả dụng cho khoảng ngày chọn. Vui lòng chọn phòng khác.'); return; } }
                    }
                  } catch(err){ /* ignore check failure, proceed with caution */ }
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
                    // attach promo data if applied (server-validated normalized object)
                    if (appliedPromo && appliedPromo.code) {
                      summary.promo = {
                        code: appliedPromo.code,
                        discount: Number(appliedPromo.discount || 0),
                        discountType: appliedPromo.discountType || (appliedPromo.raw && appliedPromo.raw.discountType) || null,
                        discountValue: Number(appliedPromo.discountValue || 0),
                        final: appliedPromo.final || null,
                        raw: appliedPromo.raw || null
                      };
                    }
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
                    // Lưu draft vào sessionStorage để nếu user quay lại có thể khôi phục
                    try { sessionStorage.setItem('hmsReturnBookingDraft', JSON.stringify(summary)); } catch {}
                    const originPayload = encodeURIComponent(JSON.stringify({ __roomsBookingDraft: summary }));
                    window.location.href = '/payment/confirm?'+q+`&origin=${originPayload}`;
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
                            min={localISODate}
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
                          min={bkCheckIn ? (()=>{ const d=new Date(bkCheckIn); d.setDate(d.getDate()+1); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; })() : (()=>{ const d=new Date(); d.setDate(d.getDate()+1); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; })()}
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
                    {(!dateError && bkCheckIn && bkCheckOut && bkAvailable===false) && <div className="rb-msg error" role="alert">Phòng không khả dụng cho khoảng ngày đã chọn.</div>}
                    {nights > 0 && (
                      <div className="rb-booking-summary" aria-live="polite">
                        <span><strong>{nights}</strong> đêm x {Number(bookingRoom.price||0).toLocaleString('vi-VN')} VND</span>
                        <span style={{ fontWeight:800 }}>
                          {appliedPromo ? (
                            <span style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
                              <span style={{ fontSize:12, color:'#6b7280', textDecoration: 'line-through' }}>{Number(totalPrice).toLocaleString('vi-VN')} VND</span>
                              <span style={{ fontWeight:900, color:'#111' }}>{Number(finalPrice).toLocaleString('vi-VN')} VND</span>
                            </span>
                          ) : (
                            <span>{Number(totalPrice).toLocaleString('vi-VN')} VND</span>
                          )}
                        </span>
                      </div>
                    )}
                    <div className="rb-booking-promo" style={{ marginTop:8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input placeholder="Nhập mã ưu đãi" value={promoCode} onChange={(e)=> setPromoCode(e.target.value.toUpperCase())} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd' }} />
                        <button type="button" className="ph-btn" disabled={!(totalPrice>0)} onClick={async ()=>{
                          if (!(totalPrice>0)) { showToast('Vui lòng chọn phòng và ngày để áp dụng mã ưu đãi', { duration: 2000, type: 'warn' }); return; }
                          try {
                            const normalized = await validatePromoServer(promoCode.trim());
                            setAppliedPromo(normalized);
                            setPromoCode(normalized.code);
                            flashTotal();
                            showToast('Áp dụng mã: ' + normalized.code + ' • Giảm ' + normalized.discount.toLocaleString('vi-VN') + 'đ', { duration: 2000, type: 'success' });
                          } catch (e) {
                            setAppliedPromo(null);
                            showToast(e.message || 'Lỗi kiểm tra mã', { duration: 2400, type: 'error' });
                          }
                        }}>Áp dụng</button>
                        <button type="button" className="ph-btn ph-btn--secondary" disabled={!(totalPrice>0)} onClick={async ()=>{
                          if (!(totalPrice>0)) { showToast('Vui lòng chọn phòng và ngày để xem ưu đãi', { duration: 2000, type: 'warn' }); return; }
                          try {
                            setPromoLoading(true); setPromoLoadError('');
                            const listUrl = new URL('/api/promotions', window.location.origin);
                            if (bookingRoom?.hotelId) listUrl.searchParams.set('hotelId', String(bookingRoom.hotelId));
                            if (bookingRoom?.id) listUrl.searchParams.set('roomIds', String(bookingRoom.id));
                            const r = await fetch(listUrl.toString());
                            if(!r.ok) { const txt = await r.text().catch(()=>null); throw new Error(txt || 'Không lấy được danh sách'); }
                            const j = await r.json(); setAvailablePromos(Array.isArray(j.items)? j.items : []); setShowPromosList(true);
                          } catch(e){ setPromoLoadError(e.message || 'Lỗi tải ưu đãi'); showToast(e.message||'Lỗi tải ưu đãi', { duration: 2600, type: 'error' }); }
                          finally { setPromoLoading(false); }
                        }}>Chọn</button>
                        {appliedPromo && (
                          <div style={{ fontWeight:800 }}>
                            {appliedPromo.code} • {appliedPromo.discountType === 'PERCENT' ? (
                              `Giảm ${Number(appliedPromo.discount||0).toLocaleString('vi-VN')} (- ${appliedPromo.discountValue}%)`
                            ) : (
                              `Giảm ${Number(appliedPromo.discount||0).toLocaleString('vi-VN')}đ`
                            )}
                          </div>
                        )}
                        {promoLoading && <div style={{ color:'#2563eb', fontSize:13 }}>Đang tải ưu đãi...</div>}
                        {promoLoadError && <div style={{ color:'#b42318', fontSize:13 }}>{promoLoadError}</div>}
                      </div>
                    </div>
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
                      <button type="submit" className="rb-btn primary" disabled={!submitEnabled || isDisabledStatus(bookingRoom?.status) || (bookingRoom?.available === false)}>
                        {(isDisabledStatus(bookingRoom?.status) || (bookingRoom?.available === false)) ? 'ĐÃ ĐƯỢC ĐẶT' : (bkLoading? 'Đang xử lý...' : 'Thanh toán') }
                      </button>
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
