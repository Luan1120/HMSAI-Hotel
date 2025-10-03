import React, { useEffect, useMemo, useState } from 'react';
import { getUserRole, getUserEmail, isLoggedIn } from './auth';
import './HomePage.css';

export default function RoomTypeInline({ name, onClose }) {
  const [data, setData] = useState({ roomType: null, rooms: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState({ checkIn: '', checkOut: '' });
  const [roomCount, setRoomCount] = useState(1);
  // Promotions feature removed
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedMap, setSelectedMap] = useState({});
  const [zoomUrl, setZoomUrl] = useState('');
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCheckoutDetails, setShowCheckoutDetails] = useState(false);
  const [payMethod, setPayMethod] = useState('MOMO');
  const role = getUserRole();
  const [agree, setAgree] = useState(false);
  // QR flow removed – only direct redirect payment flow retained
  const [showReviews, setShowReviews] = useState(false);
  const [reviews, setReviews] = useState({ list: [], avg: 0, loading: false, error: '' });

  // Removed QR base URL detection effect

  useEffect(() => {
    if (!name) return;
    let active = true;
    setLoading(true);
    setError('');
    setSelectedIndex(-1);
    setSelectedMap({});
    const params = new URLSearchParams();
    if (dateRange.checkIn) params.set('checkIn', dateRange.checkIn);
    if (dateRange.checkOut) params.set('checkOut', dateRange.checkOut);
  // Cache bust: ensure fresh status for red/yellow/green dots
  params.set('_', String(Date.now()));
  fetch(`/api/room-types/${encodeURIComponent(name)}/rooms${params.toString() ? ('?' + params.toString()) : ''}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((j) => { if (active) setData(j); })
      .catch((err) => { if (active) setError(err.message || 'Lỗi tải dữ liệu'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [name, dateRange.checkIn, dateRange.checkOut]);

  const selectedRoom = useMemo(() => data.rooms[selectedIndex] || null, [data.rooms, selectedIndex]);
  const galleryImages = useMemo(() => {
    if (!selectedRoom) return [];
    const arr = [];
    if (selectedRoom.image) arr.push(selectedRoom.image);
    return arr;
  }, [selectedRoom]);
  const selectedIds = useMemo(() => Object.keys(selectedMap).map(id => Number(id)), [selectedMap]);
  const selectedRooms = useMemo(() => data.rooms.filter(r => selectedIds.includes(r.id)), [data.rooms, selectedIds]);
  const nights = useMemo(() => {
    if (!dateRange.checkIn || !dateRange.checkOut) return 0;
    const inD = new Date(dateRange.checkIn);
    const outD = new Date(dateRange.checkOut);
    const ms = outD.setHours(0, 0, 0, 0) - inD.setHours(0, 0, 0, 0);
    return ms > 0 ? Math.ceil(ms / (1000 * 60 * 60 * 24)) : 0;
  }, [dateRange]);
  const baseSum = useMemo(() => selectedRooms.reduce((s, r) => s + Number(r.basePrice || 0), 0), [selectedRooms]);
  const totalPrice = useMemo(() => baseSum * (nights || 0), [baseSum, nights]);
  const totalGuests = useMemo(() => selectedRooms.reduce((sum, r) => {
    const sel = selectedMap[String(r.id)] || { adults: 0, children: 0 };
    return sum + Number(sel.adults || 0) + Number(sel.children || 0);
  }, 0), [selectedRooms, selectedMap]);
  const now = new Date();
  const isValidDates = useMemo(() => {
    if (!dateRange.checkIn || !dateRange.checkOut) return false;
    const inD = new Date(dateRange.checkIn);
    const outD = new Date(dateRange.checkOut);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return inD > today && outD > inD;
  }, [dateRange, now]);

  // Helpers for date inputs and warnings
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const minCheckInDate = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate() + 1);
  const minCheckInStr = fmtDate(minCheckInDate);
  const minCheckOutStr = useMemo(() => {
    if (dateRange.checkIn) {
      const inD = new Date(dateRange.checkIn);
      const d = new Date(inD.getFullYear(), inD.getMonth(), inD.getDate() + 1);
      return fmtDate(d);
    }
    const d = new Date(minCheckInDate.getFullYear(), minCheckInDate.getMonth(), minCheckInDate.getDate() + 1);
    return fmtDate(d);
  }, [dateRange.checkIn, now]);

  const dateError = useMemo(() => {
    if (!dateRange.checkIn || !dateRange.checkOut) return '';
    const inD = new Date(dateRange.checkIn);
    const outD = new Date(dateRange.checkOut);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!(inD > today)) return 'Ngày nhận phải sau ngày hiện tại';
    if (!(outD > inD)) return 'Ngày trả phải sau ngày nhận';
    return '';
  }, [dateRange, now]);
  const loggedIn = isLoggedIn();
  // Điều kiện dữ liệu đã đủ (không xét đăng nhập)
  const baseReady = useMemo(() => selectedRooms.length > 0 && totalGuests > 1 && isValidDates && nights > 0, [selectedRooms.length, totalGuests, isValidDates, nights]);
  // Điều kiện thực sự có thể mở checkout
  const canBook = loggedIn && baseReady;
  const canPay = useMemo(() => canBook && agree && !!payMethod, [canBook, agree, payMethod]);

  useEffect(() => {
    // If reduced roomCount below current selected, trim selection deterministically
    const max = Math.max(1, Number(roomCount || 1));
    const ids = Object.keys(selectedMap);
    if (ids.length > max) {
      const keep = new Set(ids.slice(0, max));
      const next = {};
      ids.slice(0, max).forEach(id => { next[id] = selectedMap[id]; });
      setSelectedMap(next);
    }
  }, [roomCount]);

  const toggleSelectRoom = (room) => {
    const id = String(room.id);
    const isSelected = !!selectedMap[id];
    if (isSelected) {
      const next = { ...selectedMap };
      delete next[id];
      setSelectedMap(next);
      return;
    }
    const max = Math.max(1, Number(roomCount || 1));
    const ids = Object.keys(selectedMap);
    if (ids.length >= max) {
      if (max === 1) {
        // replace existing selection with the new room
        setSelectedMap({ [id]: { adults: 0, children: 0 } });
      } else {
        return; // reach limit for multi-selection
      }
    } else {
      setSelectedMap({ ...selectedMap, [id]: { adults: 0, children: 0 } });
    }
  };

  const updateCounts = (room, kind, value) => {
    const id = String(room.id);
    if (!selectedMap[id]) return;
    setSelectedMap({ ...selectedMap, [id]: { ...selectedMap[id], [kind]: Number(value) } });
  };

  if (!name) return null;

  return (
    <section className="rt-inline">
      <div className="rt-toolbar">
        <div className="rt-field rt-field--wide">
          <label>Ngày nhận - trả phòng</label>
          <div className="rt-date-group">
            <input
              type="date"
              min={minCheckInStr}
              aria-invalid={dateRange.checkIn ? (new Date(dateRange.checkIn) <= todayLocal) : false}
              value={dateRange.checkIn}
              onChange={(e) => {
                const newIn = e.target.value;
                setDateRange((v) => {
                  let newOut = v.checkOut;
                  if (newOut && !(new Date(newOut) > new Date(newIn))) {
                    newOut = '';
                  }
                  return { ...v, checkIn: newIn, checkOut: newOut };
                });
              }}
            />
            <input
              type="date"
              min={minCheckOutStr}
              aria-invalid={dateRange.checkOut && dateRange.checkIn ? (new Date(dateRange.checkOut) <= new Date(dateRange.checkIn)) : false}
              value={dateRange.checkOut}
              onChange={(e) => setDateRange(v => ({ ...v, checkOut: e.target.value }))}
            />
          </div>
          {dateError && (
            <div className="rt-date-error" style={{ color: '#d93025', fontSize: 12, marginTop: 6 }}>{dateError}</div>
          )}
        </div>
        <div className="rt-field">
          <label>Số phòng</label>
          <input type="number" min={1} value={roomCount} onChange={(e) => setRoomCount(Math.max(1, Number(e.target.value)))} />
        </div>
        {/* Promotion input removed */}
  <button className="rt-search-btn" disabled={!dateRange.checkIn || !dateRange.checkOut || !isValidDates}>TÌM KIẾM</button>
        {onClose && <button className="rt-close-btn" onClick={onClose}>ĐÓNG</button>}
      </div>

      {loading && <div>Đang tải...</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}

      {!loading && !error && (
        <div className="rt-grid">
          <section className="rt-list">
            <div className="rt-legend">
              <span className="rt-legend-item"><span className="rt-status-dot red"></span> Đã được đặt</span>
              <span className="rt-legend-item"><span className="rt-status-dot yellow"></span> Đang được đặt</span>
              <span className="rt-legend-item"><span className="rt-status-dot green"></span> Trống</span>
            </div>
            {data.rooms.length === 0 ? (
              <div>Chưa có phòng nào thuộc hạng phòng này.</div>
            ) : (
              data.rooms.map((r, idx) => {
                const isSelected = !!selectedMap[String(r.id)];
                const hasDates = !!(dateRange.checkIn && dateRange.checkOut);
                const isBooked = hasDates ? !!r.isBooked : (r.status === 'Occupied');
                const adultsMax = Number(r.maxAdults || 0);
                const childrenMax = Number(r.maxChildren || 0);
                const adultsVal = isSelected ? selectedMap[String(r.id)].adults : 0;
                const childrenVal = isSelected ? selectedMap[String(r.id)].children : 0;
                return (
                  <div className={`rt-card ${isSelected ? 'selected' : ''}`} key={r.id}>
                    <div className="rt-main">
                      <div className="rt-thumb">
                        {r.image && <img src={r.image} alt={r.roomNumber} onClick={() => setZoomUrl(r.image)} />}
                      </div>
                      <div className="rt-info">
                        <h3 className="rt-name" onClick={() => { setSelectedIndex(idx); setGalleryIndex(0); setShowDetails(true); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{`Phòng ${r.roomNumber}${r.floor != null ? ` * Tầng ${r.floor}` : ''}`}</span>
                          <span className={`rt-status-dot ${isBooked ? 'red' : isSelected ? 'yellow' : 'green'}`} title={isBooked ? 'Đã đặt' : isSelected ? 'Đang đặt' : 'Trống'}></span>
                        </h3>
                        <div className="rt-cap">Tối đa {adultsMax} người lớn | {childrenMax} trẻ em</div>
                        <div className="rt-price">Giá từ {Number(r.basePrice || 0).toLocaleString('vi-VN')} VND/đêm</div>
                      </div>
                      <div className="rt-actions">
                        <button
                          type="button"
                          className="rt-choose"
                          onClick={() => { if (isBooked) return; toggleSelectRoom(r); }}
                          disabled={isBooked}
                          title={isBooked ? 'Phòng đã được đặt trong khoảng thời gian này' : ''}
                        >
                          {isBooked ? 'ĐÃ ĐẶT' : (isSelected ? 'BỎ CHỌN' : 'CHỌN')}
                        </button>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="rt-extra">
                        <div className="rt-note-row">
                          <div className="rt-note">Đã bao gồm ăn sáng • Không hoàn trả phí khi hủy phòng</div>
                          <div className="rt-selects">
                            <label>
                              Chọn số người lớn
                              <select value={adultsVal} onChange={(e) => updateCounts(r, 'adults', e.target.value)}>
                                {Array.from({ length: adultsMax + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                              </select>
                            </label>
                            <label>
                              . Trẻ em
                              <select value={childrenVal} onChange={(e) => updateCounts(r, 'children', e.target.value)}>
                                {Array.from({ length: childrenMax + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                              </select>
                            </label>
                          </div>
                        </div>
                        <div className="rt-price-2">Giá từ {Number(r.basePrice || 0).toLocaleString('vi-VN')} VND/đêm</div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>

          <aside className="rt-detail">
            {/* Booking info view (default) */}
            {(!showDetails || !(selectedIndex >= 0 && selectedRoom)) && !showCheckout && (
              <div className="rt-detail-inner">
                <div className="rt-summary">
                  <div className="rt-summary-title" style={{ cursor: selectedRoom ? 'pointer' : 'default' }}
                    onClick={() => { if (selectedRoom) setShowDetails(true); }}>
                    Thông tin đặt phòng
                  </div>
                  <div className="rt-summary-hotel">{data.roomType?.name || name}</div>
                  <div className="rt-summary-dates">{dateRange.checkIn || 'dd/mm/yyyy'} - {dateRange.checkOut || 'dd/mm/yyyy'}</div>
                  <div className="rt-summary-sep" />
                  <div className="rt-summary-title">Thông tin phòng</div>
                  <div className="rt-summary-list">
                    {selectedRooms.length === 0 ? (
                      <div className="rt-summary-line">Chưa chọn phòng</div>
                    ) : (
                      selectedRooms.map((r) => {
                        const sel = selectedMap[String(r.id)];
                        return (
                          <div key={r.id} className="rt-summary-room">
                            <div className="rt-summary-line">Phòng: {r.roomNumber}{r.floor != null ? ` • Tầng ${r.floor}` : ''}</div>
                            <div className="rt-summary-line">Người lớn: {sel?.adults ?? 0}</div>
                            <div className="rt-summary-line">Trẻ em: {sel?.children ?? 0}</div>
                            <div className="rt-summary-line">Giá: {Number(r.basePrice || 0).toLocaleString('vi-VN')} VND/đêm</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="rt-summary-sep" />
                  {!baseReady && (
                    <div className="rt-warning">Lưu ý: Hãy chọn phòng, Ngày nhận - ngày trả, và số lượng khách (tổng &gt; 1) để chuẩn bị đặt phòng.</div>
                  )}
                  {baseReady && !loggedIn && (
                    <div className="rt-warning">Bạn đã chọn đủ thông tin. Vui lòng đăng nhập để tiếp tục đặt phòng.</div>
                  )}
                  <div className="rt-summary-total">
                    <span>Tổng cộng ({nights} đêm)</span>
                    <span>{Number(totalPrice).toLocaleString('vi-VN')} VND</span>
                  </div>
                  <div className="rt-actions-vertical">
                    <button
                      type="button"
                      className="rt-review-btn"
                      onClick={async ()=>{
                        setShowReviews(true);
                        setReviews(r=>({ ...r, loading: true, error: '' }));
                        try {
                          const params = new URLSearchParams();
                          if (selectedRoom) params.set('roomId', String(selectedRoom.id)); else params.set('roomType', data.roomType?.name || name);
                          params.set('_', String(Date.now()));
                          const res = await fetch(`/api/public-reviews?${params.toString()}`, { cache: 'no-store' });
                          if (!res.ok) throw new Error('Không tải được đánh giá');
                          const j = await res.json();
                          setReviews({ list: Array.isArray(j.reviews)? j.reviews: [], avg: Number(j.avgRating||0), loading: false, error: '' });
                        } catch (e) {
                          setReviews({ list: [], avg: 0, loading: false, error: e.message || 'Lỗi tải đánh giá' });
                        }
                      }}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      xem đánh giá
                    </button>
                    <button
                      className={`rt-book-btn ${baseReady ? 'enabled' : ''} ${canBook ? 'can-book' : ''}`}
                      disabled={!baseReady}
                      onClick={() => {
                        if (!loggedIn) return; // chỉ không mở checkout
                        setShowCheckoutDetails(false); setShowCheckout(true);
                      }}
                      onMouseEnter={(e) => {
                        if (baseReady && !loggedIn) {
                          e.currentTarget.setAttribute('data-tip', 'Vui lòng Đăng nhập để đặt phòng!');
                        }
                      }}
                      onMouseLeave={(e) => { e.currentTarget.removeAttribute('data-tip'); }}
                    >
                      {canBook ? 'ĐẶT PHÒNG' : (baseReady ? 'ĐẶT PHÒNG' : 'ĐẶT PHÒNG')}
                      {!loggedIn && baseReady && <span className="rt-btn-hint"> (Đăng nhập để tiếp tục)</span>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Details view (shown when title clicked) */}
            {showDetails && !showCheckout && selectedIndex >= 0 && selectedRoom && (
              <div className="rt-detail-inner">
                <div className="rt-summary">
                  <div className="rt-summary-title" style={{ cursor: 'pointer' }} onClick={() => setShowDetails(false)}>
                    Chi tiết phòng (nhấn để quay lại đặt phòng)
                  </div>
                  <div className="rt-gallery" style={{ marginBottom: 10 }}>
                    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', height: 180, background: '#f5f5f5' }}>
                      {galleryImages.length > 0 && (
                        <img src={galleryImages[galleryIndex % galleryImages.length]} alt="Ảnh phòng" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      )}
                    </div>
                    <div className="rt-gallery-controls" style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8 }}>
                      <button type="button" className="btn" disabled={galleryImages.length <= 1} onClick={() => setGalleryIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length)}>{'<'}</button>
                      <button type="button" className="btn" disabled={galleryImages.length <= 1} onClick={() => setGalleryIndex((i) => (i + 1) % galleryImages.length)}>{'>'}</button>
                    </div>
                  </div>
                  <div className="rt-summary-list">
                    <div className="rt-summary-line">Số phòng: {selectedRoom.roomNumber}</div>
                    {selectedRoom.floor != null && (
                      <div className="rt-summary-line">Tầng: {selectedRoom.floor}</div>
                    )}
                    {typeof selectedRoom.status !== 'undefined' && (
                      <div className="rt-summary-line">Trạng thái: {String(selectedRoom.status)}</div>
                    )}
                    <div className="rt-summary-line">Loại phòng: {data.roomType?.name || name}</div>
                    <div className="rt-summary-line">Sức chứa: {Number(selectedRoom.maxAdults || 0)} người lớn, {Number(selectedRoom.maxChildren || 0)} trẻ em</div>
                    <div className="rt-summary-line">Giá cơ bản: {Number(selectedRoom.basePrice || 0).toLocaleString('vi-VN')} VND/đêm</div>
                    {data.roomType?.description && (
                      <div className="rt-summary-line">Mô tả: {data.roomType.description}</div>
                    )}
                  </div>
                  <div className="rt-summary-sep" />
                  <div className="rt-actions-vertical">
                    <button
                      type="button"
                      className="rt-review-btn"
                      onClick={async ()=>{
                        setShowReviews(true);
                        setReviews(r=>({ ...r, loading: true, error: '' }));
                        try {
                          const params = new URLSearchParams();
                          params.set('roomId', String(selectedRoom.id));
                          params.set('_', String(Date.now()));
                          const res = await fetch(`/api/public-reviews?${params.toString()}`, { cache: 'no-store' });
                          if (!res.ok) throw new Error('Không tải được đánh giá');
                          const j = await res.json();
                          setReviews({ list: Array.isArray(j.reviews)? j.reviews: [], avg: Number(j.avgRating||0), loading: false, error: '' });
                        } catch (e) {
                          setReviews({ list: [], avg: 0, loading: false, error: e.message || 'Lỗi tải đánh giá' });
                        }
                      }}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      xem đánh giá
                    </button>
                    <button
                      className={`rt-book-btn ${baseReady ? 'enabled' : ''}`}
                      onClick={() => { if (!loggedIn) return; setShowDetails(false); setShowCheckoutDetails(false); setShowCheckout(true); }}
                      disabled={!baseReady}
                      onMouseEnter={(e) => { if (baseReady && !loggedIn) e.currentTarget.setAttribute('data-tip', 'Vui lòng Đăng nhập để đặt phòng!'); }}
                      onMouseLeave={(e) => e.currentTarget.removeAttribute('data-tip')}
                    >
                      {canBook ? 'ĐẶT PHÒNG' : 'ĐẶT PHÒNG'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Checkout view */}
            {showCheckout && (
              <div className="rt-detail-inner">
                <div className="checkout-panel">
                  <div className="checkout-main-title">Thanh Toán</div>
                  <div className="checkout-header">
                    <div className="checkout-title">Thông Tin Đặt Phòng</div>
                  </div>
                  <div className="checkout-body">
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>{data.roomType?.name || name}</div>
                    <div style={{ color: '#555', marginBottom: 8 }}>{(dateRange.checkIn || 'dd/mm/yyyy')} - {(dateRange.checkOut || 'dd/mm/yyyy')}</div>
                    <div className="checkout-info-row">
                      <div className="checkout-section-title" style={{ margin: 0 }}>Thông Tin Phòng</div>
                      <button type="button" className="checkout-inline-toggle" onClick={() => setShowCheckoutDetails((v) => !v)}>
                        {showCheckoutDetails ? 'Ẩn Thông Tin' : 'Xem Thông Tin'}
                      </button>
                    </div>
                    {showCheckoutDetails && (
                      <div className="checkout-room-list">
                        {selectedRooms.length === 0 ? (
                          <div>Chưa chọn phòng</div>
                        ) : (
                          selectedRooms.map((r) => {
                            const sel = selectedMap[String(r.id)];
                            return (
                              <div key={r.id} className="rt-summary-room">
                                <div className="rt-summary-line">Phòng: {r.roomNumber}{r.floor != null ? ` • Tầng ${r.floor}` : ''}</div>
                                <div className="rt-summary-line">Người lớn: {sel?.adults ?? 0} • Trẻ em: {sel?.children ?? 0}</div>
                                <div className="rt-summary-line">Giá: {Number(r.basePrice || 0).toLocaleString('vi-VN')} VND/đêm</div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                    <div className="checkout-line">
                      <span>Số đêm</span>
                      <span>{nights} đêm</span>
                    </div>
                    <div className="checkout-line">
                      <span>Giá phòng</span>
                      <span>{Number(totalPrice).toLocaleString('vi-VN')} VND</span>
                    </div>
                    {/* Discount line removed */}
                    {/* Phương thức thanh toán trực tuyến */}
                    {
                      <div className="checkout-line" style={{ alignItems: 'stretch', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontWeight: 700 }}>Phương thức thanh toán</div>
                        <select className="checkout-pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                          <option value="MOMO">Ví điện tử MOMO</option>
                          <option value="ZALOPAY">ZaloPay</option>
                          <option value="VNPAY">VNPay</option>
                          <option value="CARD">Thẻ tín dụng/ghi nợ</option>
                        </select>
                      </div>
                    }
                    <label className="checkout-terms">
                      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                      <span>Vui lòng đọc kĩ và đồng ý với điều khoản bằng cách đánh dấu vào ô bên cạnh</span>
                    </label>
                    <div className="checkout-total">
                      <span>Tổng cộng</span>
                      <span>{Number(totalPrice).toLocaleString('vi-VN')} VND</span>
                    </div>
                    <div className="checkout-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {/* Online payment flow */}
                      <button className="checkout-btn" disabled={!canPay} onClick={() => {
                        // Flow mới: chuyển hướng trực tiếp sang trang /payment/confirm
                        const t = Math.random().toString(36).slice(2) + Date.now().toString(36);
                        const totals = selectedRooms.reduce((acc, r) => {
                          const sel = selectedMap[String(r.id)] || { adults: 0, children: 0 }; acc.ad += Number(sel.adults||0); acc.ch += Number(sel.children||0); return acc; }, { ad:0, ch:0 });
                        const pad2 = (n)=> String(n).padStart(2,'0');
                        const nowD = new Date();
                        const bookingCode = `HMS${nowD.getFullYear()}${pad2(nowD.getMonth()+1)}${pad2(nowD.getDate())}`;
                        const roomNames = selectedRooms.map(r=>`Phòng ${r.roomNumber}${r.floor!=null?` • Tầng ${r.floor}`:''}`).join(', ');
                        let userEmail='';
                        try { const u=localStorage.getItem('hmsUser'); if(u) userEmail=(JSON.parse(u).email||'').trim(); } catch {}
                        const grossAmount = Number(totalPrice) || 0;
                        const summary = { token:t, code:bookingCode, hotelId:data.roomType?.hotelId||null, hotel:data.roomType?.hotelName||'', roomType:data.roomType?.name||name, roomNames, checkIn:dateRange.checkIn, checkOut:dateRange.checkOut, checkInTime:'14:00', checkOutTime:'12:00', payMethod, userEmail, adults:totals.ad, children:totals.ch, rooms:selectedRooms.map(r=>{ const sel=selectedMap[String(r.id)]||{adults:0,children:0}; return { id:r.id, number:r.roomNumber, floor:r.floor, price:r.basePrice, name:r.roomNumber, adults:sel.adults, children:sel.children }; }), amount:grossAmount };
                        // promotion fields removed from summary
                        try { localStorage.setItem('hmsBooking:'+t, JSON.stringify(summary)); } catch {}
                        // Pass gross amount in query (PaymentConfirm will apply discount from summary)
                        const q=[`token=${encodeURIComponent(t)}`,`code=${encodeURIComponent(summary.code)}`,`amount=${encodeURIComponent(grossAmount)}`,`hid=${encodeURIComponent(summary.hotelId||'')}`,`rn=${encodeURIComponent(roomNames)}`,`rt=${encodeURIComponent(summary.roomType||'')}`,`ci=${encodeURIComponent(summary.checkIn||'')}`,`co=${encodeURIComponent(summary.checkOut||'')}`,`ad=${encodeURIComponent(summary.adults)}`,`ch=${encodeURIComponent(summary.children)}`].join('&');
                        window.location.href = '/payment/confirm?'+q;
                      }}>THANH TOÁN</button>
                      {/* QR button removed */}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
      {/* QR overlay removed */}
      {showReviews && (
        <div className="qr-overlay" onClick={()=> setShowReviews(false)}>
          <div className="qr-box" onClick={(e)=> e.stopPropagation()} style={{ width: 680, maxWidth: '96%' }}>
            <div className="qr-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>Đánh giá phòng</span>
              <button className="qr-close" onClick={()=> setShowReviews(false)}>Đóng</button>
            </div>
            {reviews.loading ? (
              <div style={{ padding: 10, color: '#666' }}>Đang tải đánh giá...</div>
            ) : reviews.error ? (
              <div style={{ padding: 10, color: '#b42318' }}>{reviews.error}</div>
            ) : reviews.list.length === 0 ? (
              <div style={{ padding: 10, color: '#666' }}>Chưa có đánh giá nào cho phòng này.</div>
            ) : (
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 800, margin: '4px 0 10px' }}>Trung bình: {reviews.avg.toFixed(1)} / 5.0 ★</div>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {reviews.list.map(rv => (
                    <div key={rv.id} style={{ borderTop: '1px solid #eee', padding: '8px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 700 }}>{rv.user || 'Khách'}</div>
                        <div style={{ fontWeight: 700, color: '#444' }}>{Number(rv.rating||0).toFixed(1)} / 5.0 ★</div>
                      </div>
                      <div style={{ color: '#555', marginTop: 4 }}>{rv.comment || '(Không có nhận xét)'}</div>
                      <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>{rv.hotelName}{rv.roomName ? ` • Phòng ${rv.roomName}`: ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {zoomUrl && (
        <div className="rt-zoom" onClick={() => setZoomUrl('')}>
          <img src={zoomUrl} alt="Xem ảnh phòng" />
        </div>
      )}
    </section>
  );
}
