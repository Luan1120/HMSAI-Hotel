import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './HomePage.css';

export default function PaymentHistory({ inline = false, onReview }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return toISODate(start);
  });
  const [toDate, setToDate] = useState(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth()+1, 0);
    return toISODate(end);
  });
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    try { const u = localStorage.getItem('hmsUser'); setUser(u? JSON.parse(u): null);} catch { setUser(null);} 
  }, []);

  const fetchList = async () => {
    if (!user?.email) return;
    setLoading(true); setError('');
    try {
      const url = new URL('/api/transactions', window.location.origin);
      url.searchParams.set('email', user.email);
      if (q) url.searchParams.set('q', q);
      if (status && status !== 'all') url.searchParams.set('status', status);
      if (fromDate) url.searchParams.set('from', fromDate);
      if (toDate) url.searchParams.set('to', toDate);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Không tải được dữ liệu');
      const j = await res.json();
      let raw = Array.isArray(j.items)? j.items: [];
      // Rehydrate refund info for canceled bookings (if server omitted it)
      raw = raw.map(it => {
        if(it.paymentStatus === 'canceled') {
          if(it.refundAmount == null) {
            // Try localStorage cache first
            try {
              const cache = localStorage.getItem('refund:'+it.bookingId);
              if(cache) {
                const parsed = JSON.parse(cache);
                if(parsed && typeof parsed.refundAmount !== 'undefined') {
                  return { ...it, refundAmount: parsed.refundAmount, cancellationFee: parsed.cancellationFee };
                }
              }
            } catch {}
            // Fallback compute (85% refund, 15% fee) based on total if available
            const total = Number(it.total)||0;
            if(total>0) {
              const refundAmount = Math.round(total * 0.85);
              const cancellationFee = total - refundAmount;
              return { ...it, refundAmount, cancellationFee };
            }
          }
        }
        return it;
      });
      setItems(raw);
    } catch (e) { setError(e.message || 'Lỗi tải dữ liệu'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, [user]);

  const filtered = useMemo(() => items, [items]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page-1)*pageSize, page*pageSize);

  const topScrollRef = useRef(null);
  const tableRef = useRef(null);

  return (
    <div className={inline ? '' : 'home-root'} style={{ paddingTop: inline ? 0 : 80 }}>
      {!inline && (
        <header className="home-header" style={{ position: 'sticky', top: 0 }}>
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
      <div style={{ padding: inline ? '6px' : '16px 12px' }}>
        <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 12 }}>Lịch sử giao dịch</h2>
        <div className="rt-toolbar" style={{ alignItems: 'center' }}>
          <div className="rt-field rt-field--wide">
            <label>Từ khóa</label>
            <input type="text" placeholder="VD: HMS20250904 hoặc HMS-AI Đà Nẵng" value={q} onChange={(e)=>setQ(e.target.value)} />
          </div>
          <div className="rt-field">
            <label>Từ ngày</label>
            <input type="date" value={fromDate} onChange={(e)=>setFromDate(e.target.value)} />
          </div>
          <div className="rt-field">
            <label>Đến ngày</label>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(e)=>setToDate(e.target.value)} />
          </div>
          <div className="rt-field">
            <label>Trạng thái</label>
            <select value={status} onChange={(e)=>setStatus(e.target.value)}>
              <option value="all">Tất cả</option>
              <option value="paid">Đã thanh toán</option>
              <option value="pending">Chờ thanh toán</option>
              <option value="canceled">Hủy</option>
            </select>
          </div>
          <button className="ph-btn" onClick={()=>{setPage(1); fetchList();}}>Tìm kiếm</button>
          <button className="ph-btn ph-btn--secondary" onClick={()=>exportCsv(filtered)}>Xuất CSV</button>
        </div>

        <div style={{ overflowX:'auto', maxWidth:'100%' }} ref={topScrollRef} className="ph-scroll-top">
          <div ref={tableRef} className="ph-table" role="table" aria-label="Lịch sử giao dịch" style={{ minWidth:1700 }}>
            <div className="ph-tr ph-head ph-hist" role="row">
              {['MÃ ĐẶT PHÒNG','KHÁCH SẠN','PHÒNG','LOẠI PHÒNG','NHẬN PHÒNG','TRẢ PHÒNG','SỐ ĐÊM','KHÁCH','GIÁ/ĐÊM','TỔNG TIỀN','THANH TOÁN','THỜI GIAN TT','PTTT','HÀNH ĐỘNG'].map(h=> (
                <div key={h} className="ph-td" role="columnheader">{h}</div>
              ))}
            </div>
            {loading ? (
              <div className="ph-empty">Đang tải...</div>
            ) : error ? (
              <div className="ph-empty" style={{ color: '#c1121f' }}>{error}</div>
            ) : pageItems.length === 0 ? (
              <div className="ph-empty">Chưa có giao dịch</div>
            ) : (
              pageItems.map((it) => (
                <div className="ph-tr ph-hist" role="row" key={it.bookingId}>
                  <div className="ph-td code">{it.code}</div>
                  <div className="ph-td">{it.hotelName}</div>
                  <div className="ph-td">{it.roomName || '—'}</div>
                  <div className="ph-td">{it.roomType || '—'}</div>
                  <div className="ph-td">{fmtDateTime(it.checkIn)}</div>
                  <div className="ph-td">{fmtDateTime(it.checkOut)}</div>
                  <div className="ph-td center">{it.nights}</div>
                  <div className="ph-td">{it.guests}</div>
                  <div className="ph-td right">{fmtMoney(it.pricePerNight)} VND</div>
                  <div className="ph-td right">{fmtMoney(it.total)} VND</div>
                  <div className="ph-td"><StatusBadge status={it.paymentStatus} /></div>
                  <div className="ph-td">{it.paidAt ? fmtDateTime(it.paidAt) : '—'}</div>
                  <div className="ph-td">{it.method || '—'}</div>
                  <div className="ph-td action ph-action-inline">
                    {(() => {
                      const reviewedKey = 'reviewedBooking:' + it.bookingId;
                      let reviewed = false; try { reviewed = !!localStorage.getItem(reviewedKey); } catch {}
                      const reviewLabel = reviewed ? 'Đã đánh giá' : 'Đánh giá';
                      const reviewNode = (typeof onReview === 'function') ? (
                        <a href="#" className={reviewed? 'ph-link disabled' : 'ph-link'} onClick={(e)=>{ e.preventDefault(); if(reviewed) return; onReview(it); try { localStorage.setItem(reviewedKey,'1'); } catch {}; setItems(list=> list.map(x=> x.bookingId===it.bookingId ? { ...x } : x)); }}>{reviewLabel}</a>
                      ) : (
                        <a href={buildReviewHref(it)} className={reviewed? 'ph-link disabled':'ph-link'} onClick={()=>{ if(!reviewed){ try { localStorage.setItem(reviewedKey,'1'); } catch {}; } }}>{reviewLabel}</a>
                      );
                      return <>{reviewNode}</>;
                    })()}
                    {it.paymentStatus==='pending' && (
                      <button
                        className="ph-cancel-btn"
                        onClick={async()=>{
                          if(!window.confirm('Hủy giao dịch này? Hoàn 85%, phí 15%.')) return;
                          try {
                            const uRaw = localStorage.getItem('hmsUser');
                            const email = uRaw? JSON.parse(uRaw).email: null;
                            if(!email) { alert('Chưa đăng nhập'); return; }
                            const r = await fetch(`/api/payments/${it.bookingId}/cancel`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) });
                            if(!r.ok){ const t=await r.text(); throw new Error(t); }
                            const j = await r.json();
                            setItems(list => list.map(x => x.bookingId===it.bookingId ? { ...x, paymentStatus:'canceled', refundAmount:j.refundAmount, cancellationFee:j.cancellationFee } : x));
                            // Persist refund info locally so it shows after navigation
                            try { localStorage.setItem('refund:'+it.bookingId, JSON.stringify({ refundAmount:j.refundAmount, cancellationFee:j.cancellationFee })); } catch {}
                          } catch(e){ alert(e.message||'Hủy thất bại'); }
                        }}
                        title="Hủy giao dịch"
                      >Hủy</button>
                    )}
                    {it.paymentStatus==='canceled' && (it.refundAmount!=null) && (
                      <span className="ph-refund-note">Hoàn: {Number(it.refundAmount).toLocaleString('vi-VN')} VND</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {/* Removed secondary scrollbar to keep UI clean */}

        <div className="ph-pager">
          <button disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))}>«</button>
          {Array.from({length: totalPages}, (_,i)=>i+1).slice(0,5).map(n => (
            <button key={n} className={n===page? 'active': ''} onClick={()=>setPage(n)}>{n}</button>
          ))}
          <button disabled={page>=totalPages} onClick={()=>setPage((p)=>Math.min(totalPages,p+1))}>»</button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    paid: { text: 'Đã thanh toán', cls: 'ok' },
    pending: { text: 'Chờ thanh toán', cls: 'pending' },
    canceled: { text: 'Hủy', cls: 'cancel' },
  };
  const s = map[status] || map.pending;
  return <span className={`ph-badge ${s.cls}`}>{s.text}</span>;
}

function toISODate(d){ const dt = new Date(d); const y=dt.getFullYear(); const m=String(dt.getMonth()+1).padStart(2,'0'); const day=String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function fmtDate(d){ const dt = new Date(d); const dd=String(dt.getDate()).padStart(2,'0'); const mm = String(dt.getMonth()+1).padStart(2,'0'); const yy = dt.getFullYear(); return `${dd}/${mm}/${yy}`; }
function fmtDateTime(d){ if(!d) return ''; const dt=new Date(d); const hh=String(dt.getHours()).padStart(2,'0'); const mi=String(dt.getMinutes()).padStart(2,'0'); return `${fmtDate(dt)} ${hh}:${mi}`; }
function toISO(s){ const [d,m,y] = s.split('/'); return `${y}-${m}-${d}`; }
function fmtMoney(n){ return Number(n||0).toLocaleString('vi-VN'); }
function exportCsv(list){
  const header = ['Mã đặt','Khách sạn','Phòng','Loại phòng','Nhận','Trả','Số đêm','Khách','Giá/đêm','Tổng','Trạng thái','Thanh toán','PTTT'];
  const rows = list.map(it => [
    it.code,
    it.hotelName,
    (it.roomName||''),
    (it.roomType||''),
    fmtDateTime(it.checkIn),
    fmtDateTime(it.checkOut),
    it.nights,
    it.guests,
    fmtMoney(it.pricePerNight),
    fmtMoney(it.total),
    it.paymentStatus,
    (it.paidAt?fmtDateTime(it.paidAt):''),
    it.method
  ]);
  const csv = [header, ...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(["\uFEFF"+csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lich-su-giao-dich.csv'; a.click();
}

function buildReviewHref(it){
  const q = new URLSearchParams({
    bookingId: String(it.bookingId || ''),
    hotel: String(it.hotelName || ''),
    roomType: String(it.roomType || ''),
    ci: it.checkIn ? toISODate(it.checkIn) : '',
    co: it.checkOut ? toISODate(it.checkOut) : '',
  });
  return `/review?${q.toString()}`;
}

// Styles for .ph-action-inline, .ph-link, .ph-cancel-btn, .ph-refund-note moved to HomePage.css
