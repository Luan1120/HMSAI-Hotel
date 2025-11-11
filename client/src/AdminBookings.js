import React, { useEffect, useRef, useState } from 'react';
import './HomePage.css';
import { authHeaders, getUserRole } from './auth';

const STATUS_FILTERS = [
  { key: '', label: 'Tất cả trạng thái' },
  { key: 'success', label: 'Thành công' },
  { key: 'confirmed', label: 'Đã xác nhận' },
  { key: 'pending', label: 'Chờ xác nhận' },
  { key: 'canceled', label: 'Đã hủy' },
];

// Color helper & badge renderer
function bookingStatusClass(key){
  const v = String(key||'').toLowerCase();
  if(v==='success') return 'status-badge status-green';
  if(v==='canceled') return 'status-badge status-red';
  if(v==='pending' || v==='confirmed') return 'status-badge status-yellow';
  return 'status-badge';
}
function renderStatusBadge(k){
  const v = String(k||'').toLowerCase();
  let label = '—';
  if (v === 'success') label = 'Thành công';
  else if (v === 'confirmed') label = 'Đã xác nhận';
  else if (v === 'pending') label = 'Chờ xác nhận';
  else if (v === 'canceled') label = 'Đã hủy';
  return <span className={bookingStatusClass(v)}>{label}</span>;
}

export default function AdminBookings({ isModal, onClose, highlightBookingId }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);

  // Update booking status helper (optimistic)
  const updateStatus = async (booking, nextStatusKey) => {
    const id = booking.bookingId;
    const prev = booking.statusKey;
    // optimistic
    setItems(list => list.map(b => b.bookingId===id ? { ...b, statusKey: nextStatusKey } : b));
    try {
      const res = await fetch(`/api/admin/bookings/${id}/status`, {
        method:'PUT',
        headers:{ 'Content-Type':'application/json', ...authHeaders() },
        body: JSON.stringify({ status: nextStatusKey })
      });
      if(!res.ok) throw new Error('Cập nhật trạng thái thất bại');
    } catch(e){
      // revert
      setItems(list => list.map(b => b.bookingId===id ? { ...b, statusKey: prev } : b));
      alert(e.message || 'Lỗi cập nhật');
    }
  };

  const fetchList = async () => {
    setLoading(true); setError('');
    try {
      const url = new URL('/api/admin/bookings', window.location.origin);
      if (q) url.searchParams.set('q', q);
      if (status) url.searchParams.set('status', status);
  const res = await fetch(url, { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error('Không tải được danh sách đặt phòng');
      const j = await res.json();
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) { setError(e.message || 'Lỗi tải dữ liệu'); setItems([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, []);
  // When highlightBookingId is provided, wait for items to load then scroll to and highlight it
  useEffect(() => {
    if (!highlightBookingId || items.length === 0) return;
    // find the DOM row by data-booking-id
    setTimeout(() => {
      try {
        const el = document.querySelector(`[data-booking-id=\"${highlightBookingId}\"]`);
        if (el && el.scrollIntoView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlight-booking');
          setTimeout(() => { try { el.classList.remove('highlight-booking'); } catch {} }, 5000);
        }
      } catch (e) {}
    }, 300);
  }, [highlightBookingId, items]);
  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchList, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, status]);

  return (
    <div className="admin-rooms" style={{ padding: isModal ? 0 : '80px 12px 20px' }}>
      {!isModal && (
        <header className="home-header" style={{ position: 'sticky', top: 0 }}>
          <div className="home-header-left">
            <img src="/logo.png" alt="logo" className="home-header-logo" />
            <a href="/" className="home-header-title home-header-home-btn">TRANG CHỦ</a>
          </div>
        </header>
      )}
      <div className="ph-table" style={{ padding: 16 }}>
        <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Quản lý đặt phòng</h2>
        <form onSubmit={(e)=>e.preventDefault()} className="au-toolbar" style={{ gridTemplateColumns: '1fr auto auto' }}>
          <div className="au-group">
            <input className="au-input" placeholder="Tìm kiếm khách hàng..." value={q} onChange={e=>setQ(e.target.value)} />
          </div>
          <select className="ph-btn ph-btn--secondary" value={status} onChange={e=>setStatus(e.target.value)} style={{ height: 36 }}>
            {STATUS_FILTERS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="ph-btn au-add-btn" type="button" onClick={()=>alert('Chức năng thêm đặt phòng sẽ sớm có!')}>+ Thêm đặt phòng</button>
        </form>

        {loading ? <div style={{ color:'#666' }}>Đang tải...</div> : error ? <div style={{ color:'#b42318' }}>{error}</div> : (
          <div>
            <div className="ph-tr ph-head" style={{ gridTemplateColumns: '130px 1.5fr 1.1fr 0.9fr 1.2fr 1.1fr 1.1fr 1fr 1.3fr' }}>
              <div className="ph-td">Mã đơn</div>
              <div className="ph-td">Khách hàng</div>
              <div className="ph-td">SĐT</div>
              <div className="ph-td">Số phòng</div>
              <div className="ph-td">Loại phòng</div>
              <div className="ph-td">Ngày nhận</div>
              <div className="ph-td">Ngày trả</div>
              <div className="ph-td">Trạng thái</div>
              <div className="ph-td">Hành động</div>
            </div>
            {items.length === 0 ? (
              <div className="ph-td" style={{ padding: 12, color: '#666' }}>Không có đặt phòng nào.</div>
            ) : items.map(it => (
              <div key={it.bookingId} data-booking-id={it.bookingId} className="ph-tr" style={{ gridTemplateColumns: '130px 1.5fr 1.1fr 0.9fr 1.2fr 1.1fr 1.1fr 1fr 1.3fr' }}>
                <div className="ph-td">{it.code}</div>
                <div className="ph-td">{it.customerName || '—'}</div>
                <div className="ph-td">{it.customerPhone || '—'}</div>
                <div className="ph-td">{it.roomName || '—'}</div>
                <div className="ph-td">{it.roomType || '—'}</div>
                <div className="ph-td">{fmtDate(it.checkIn)}</div>
                <div className="ph-td">{fmtDate(it.checkOut)}</div>
                <div className="ph-td">{renderStatusBadge(it.statusKey)}</div>
                <div className="ph-td" style={{ display:'flex', gap:6, whiteSpace:'nowrap' }}>
                  {(() => {
                    const st = String(it.statusKey||'').toLowerCase();
                    const isPending = st === 'pending';
                    const disabled = !isPending;
                    return (
                      <>
                        <button
                          className={`ph-btn booking-action-btn ${isPending? 'booking-action--active':'booking-action--disabled'}`}
                          type="button"
                          disabled={disabled}
                          onClick={async()=>{
                            if(!isPending) return;
                            try {
                              const r = await fetch(`/api/payments/${it.bookingId}/confirm`, { method:'PUT', headers:{ ...authHeaders(), 'Content-Type':'application/json' } });
                              if(!r.ok){ const t=await r.text(); throw new Error(t); }
                              setItems(list => list.map(b => b.bookingId===it.bookingId ? { ...b, statusKey:'success' } : b));
                            } catch(e){ alert(e.message||'Lỗi xác nhận'); }
                          }}
                          title={isPending? 'Xác nhận thanh toán' : 'Đã xử lý'}
                        >Xác nhận</button>
                        <button
                          className={`ph-btn booking-action-btn ${isPending? 'booking-action--active':'booking-action--disabled'}`}
                          type="button"
                          disabled={disabled}
                          onClick={async()=>{
                            if(!isPending) return;
                            if(!window.confirm('Hủy đơn đặt phòng này?')) return;
                            try {
                              const r = await fetch(`/api/payments/${it.bookingId}/admin-cancel`, { method:'PUT', headers:{ ...authHeaders(), 'Content-Type':'application/json' } });
                              if(!r.ok){ const t=await r.text(); throw new Error(t); }
                              setItems(list => list.map(b => b.bookingId===it.bookingId ? { ...b, statusKey:'canceled' } : b));
                            } catch(e){ alert(e.message||'Lỗi hủy'); }
                          }}
                          title={isPending? 'Hủy đơn & hoàn 100%' : 'Đã xử lý'}
                        >Hủy</button>
                        <button className="ph-btn ph-btn--secondary" type="button" onClick={()=>setDetail(it)}>Chi tiết</button>
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detail && (
        <div className="profile-overlay" onMouseDown={(e)=>{ if (e.target===e.currentTarget) setDetail(null); }}>
          <div className="profile-modal" onMouseDown={(e)=>e.stopPropagation()} style={{ width: 720, maxWidth:'98%' }}>
            <div className="ph-table" style={{ padding: 16 }}>
              <h3 style={{ margin: 0 }}>Chi tiết đặt phòng</h3>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><b>Mã đơn:</b> {detail.code}</div>
                <div><b>Trạng thái:</b> {renderStatus(detail.statusKey)}</div>
                <div><b>Khách hàng:</b> {detail.customerName || '—'}</div>
                <div><b>SĐT:</b> {detail.customerPhone || '—'}</div>
                <div><b>Email:</b> {detail.customerEmail || '—'}</div>
                <div><b>Khách sạn:</b> {detail.hotelName || '—'}</div>
                <div><b>Phòng:</b> {detail.roomName || '—'}</div>
                <div><b>Loại phòng:</b> {detail.roomType || '—'}</div>
                <div><b>Ngày nhận:</b> {fmtDate(detail.checkIn)}</div>
                <div><b>Ngày trả:</b> {fmtDate(detail.checkOut)}</div>
                <div><b>Số đêm:</b> {detail.nights}</div>
                <div><b>Khách:</b> {detail.guests}</div>
                <div><b>Tổng tiền:</b> {Number(detail.total || 0).toLocaleString('vi-VN')} VNĐ</div>
                <div><b>Thanh toán:</b> {detail.method || '—'}</div>
              </div>
              <div style={{ marginTop: 12, textAlign: 'right' }}>
                <button className="ph-btn" onClick={()=>setDetail(null)}>Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .status-badge { font-size:12px; padding:2px 8px 3px; border-radius:999px; border:1px solid transparent; font-weight:500; display:inline-block; }
        .status-green { background:#e6f7ec; color:#086637; border-color:#bfe6ce; }
        .status-red { background:#ffe8e6; color:#b42318; border-color:#f5b5ae; }
        .status-yellow { background:#fff4d6; color:#8a6d00; border-color:#f2d291; }
        .booking-action-btn { min-width:82px; font-weight:700; letter-spacing:.3px; position:relative; overflow:hidden; }
        .booking-action--active {
          background:linear-gradient(135deg,#ffcc33,#ffe27a 55%,#fff3c1);
          color:#222;
          border:1px solid #f6c23e;
          box-shadow:0 2px 4px rgba(0,0,0,.12), 0 0 0 1px rgba(255,255,255,.4) inset;
          transition: background .25s ease, box-shadow .25s ease, transform .15s ease;
        }
        .booking-action--active:hover { background:linear-gradient(135deg,#ffbd00,#ffd659 55%,#ffeaa4); box-shadow:0 4px 10px rgba(0,0,0,.18); }
        .booking-action--active:active { transform:translateY(1px); }
        .booking-action--active:focus-visible { outline:2px solid #fff; outline-offset:2px; box-shadow:0 0 0 3px rgba(255,193,7,.55); }
        .booking-action--disabled {
          background:#d9d9d9;
          color:#555;
          cursor:not-allowed;
          border:1px solid #d0d0d0;
          box-shadow:0 1px 2px rgba(0,0,0,.06) inset, 0 0 0 1px #ececec;
          text-shadow:0 1px 0 rgba(255,255,255,.55);
        }
        .booking-action--disabled:hover { background:#d9d9d9; }
        .booking-action--disabled:focus-visible { outline:none; }
        .highlight-booking { box-shadow: 0 0 0 3px rgba(10,103,193,0.18); background: rgba(10,103,193,0.04); transition: background .4s ease; }
      `}</style>
    </div>
  );
}

function renderStatus(k) {
  const v = String(k||'').toLowerCase();
  if (v === 'success') return 'Thành công';
  if (v === 'confirmed') return 'Đã xác nhận';
  if (v === 'pending') return 'Chờ xác nhận';
  if (v === 'canceled') return 'Đã hủy';
  return '—';
}

function fmtDate(d){ if(!d) return '—'; const dt=new Date(d); const dd=String(dt.getDate()).padStart(2,'0'); const mm=String(dt.getMonth()+1).padStart(2,'0'); const yy=dt.getFullYear(); return `${dd}/${mm}/${yy}`; }
