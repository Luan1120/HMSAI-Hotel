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
  // Invoice state
  const [invoiceItem, setInvoiceItem] = useState(null);
  const [invoiceHotel, setInvoiceHotel] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceOpenedAt, setInvoiceOpenedAt] = useState(null); // thời điểm mở hóa đơn

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
  const bottomScrollRef = useRef(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Detect horizontal overflow (table wider than visible container)
  useEffect(()=>{
    const check = () => {
      const tableEl = tableRef.current; const topEl = topScrollRef.current;
      if(!tableEl || !topEl) { setHasOverflow(false); return; }
      const overflow = tableEl.scrollWidth > (topEl.clientWidth + 5); // small tolerance
      setHasOverflow(overflow);
    };
    check();
    window.addEventListener('resize', check);
    return ()=> window.removeEventListener('resize', check);
  }, [filtered.length, pageItems.length]);

  // Sync horizontal scroll between top (table container) and bottom (pinned bar)
  useEffect(()=>{
    const topEl = topScrollRef.current;
    const botEl = bottomScrollRef.current;
    if(!topEl || !botEl) return;
    let syncing = false;
    const sync = (src, target)=>{
      if(syncing) return; syncing = true;
      if(target.scrollLeft !== src.scrollLeft) target.scrollLeft = src.scrollLeft;
      syncing = false;
    };
    const onTop = ()=> sync(topEl, botEl);
    const onBot = ()=> sync(botEl, topEl);
    topEl.addEventListener('scroll', onTop);
    botEl.addEventListener('scroll', onBot);
    return ()=> { topEl.removeEventListener('scroll', onTop); botEl.removeEventListener('scroll', onBot); };
  }, [filtered.length, hasOverflow]);

  const openInvoice = async (row) => {
    setInvoiceItem(null); setInvoiceHotel(null); setInvoiceLoading(true);
    try {
      // Enrich row with userName fallback if missing so tên khách hàng luôn hiện
      const enriched = { ...row };
      if(!enriched.userName && user){
        // user may have fullName or name fields (guess); fallback to email before '@'
        const uName = user.fullName || user.name || user.userName || (user.email? user.email.split('@')[0] : '');
        if(uName) enriched.userName = uName;
      }
      setInvoiceItem(enriched);
      setInvoiceOpenedAt(new Date());
    } catch { /* ignore */ } finally { setInvoiceLoading(false); }
  };

  return (
  <div className={(inline ? '' : 'home-root') + ' ph-root'} style={{ paddingTop: inline ? 0 : 80 }}>
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
                  <div className="ph-td action ph-action-stack">
                    {(() => {
                      const reviewedKey = 'reviewedBooking:' + it.bookingId;
                      let reviewed = false; try { reviewed = !!localStorage.getItem(reviewedKey); } catch {}
                      const reviewLabel = reviewed ? 'ĐÃ ĐÁNH GIÁ' : 'ĐÁNH GIÁ';
                      const commonCls = 'ph-action-btn ph-action-outline' + (reviewed? ' disabled':'');
                      if(typeof onReview === 'function'){
                        return (
                          <button type="button" className={commonCls} disabled={reviewed} onClick={(e)=>{ if(reviewed) return; onReview(it); try { localStorage.setItem(reviewedKey,'1'); } catch {}; setItems(list=> list.map(x=> x.bookingId===it.bookingId ? { ...x } : x)); }}>{reviewLabel}</button>
                        );
                      } else {
                        return (
                          <a href={buildReviewHref(it)} className={commonCls + ' link-as-btn'} onClick={(e)=>{ if(reviewed){ e.preventDefault(); return;} try { localStorage.setItem(reviewedKey,'1'); } catch {}; }}>{reviewLabel}</a>
                        );
                      }
                    })()}
                    {it.paymentStatus==='paid' && (
                      <button type="button" className="ph-action-btn ph-action-primary" onClick={()=> openInvoice(it)}>HÓA ĐƠN</button>
                    )}
                    {it.paymentStatus==='pending' && (
                      <button type="button" className="ph-action-btn ph-action-danger" onClick={async()=>{
                        if(!window.confirm('Hủy giao dịch này? Hoàn 85%, phí 15%.')) return;
                        try {
                          const uRaw = localStorage.getItem('hmsUser');
                          const email = uRaw? JSON.parse(uRaw).email: null;
                          if(!email) { alert('Chưa đăng nhập'); return; }
                          const r = await fetch(`/api/payments/${it.bookingId}/cancel`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) });
                          if(!r.ok){ const t=await r.text(); throw new Error(t); }
                          const j = await r.json();
                          setItems(list => list.map(x => x.bookingId===it.bookingId ? { ...x, paymentStatus:'canceled', refundAmount:j.refundAmount, cancellationFee:j.cancellationFee } : x));
                          try { localStorage.setItem('refund:'+it.bookingId, JSON.stringify({ refundAmount:j.refundAmount, cancellationFee:j.cancellationFee })); } catch {}
                        } catch(e){ alert(e.message||'Hủy thất bại'); }
                      }}>HỦY</button>
                    )}
                    {it.paymentStatus==='canceled' && (it.refundAmount!=null) && (
                      <div className="ph-action-refund">Hoàn: {Number(it.refundAmount).toLocaleString('vi-VN')} VND</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {/* Pinned bottom horizontal scrollbar (only when needed) */}
        {hasOverflow && (
          <div className="ph-scroll-bottom-wrapper">
            <div ref={bottomScrollRef} className="ph-scroll-bottom" style={{ overflowX:'auto', overflowY:'hidden', maxWidth:'100%' }}>
              <div style={{ width: (tableRef.current? tableRef.current.scrollWidth: 1700), height:1 }} />
            </div>
          </div>
        )}

        <div className="ph-pager">
          <button disabled={page<=1} onClick={()=>setPage((p)=>Math.max(1,p-1))}>«</button>
          {Array.from({length: totalPages}, (_,i)=>i+1).slice(0,5).map(n => (
            <button key={n} className={n===page? 'active': ''} onClick={()=>setPage(n)}>{n}</button>
          ))}
          <button disabled={page>=totalPages} onClick={()=>setPage((p)=>Math.min(totalPages,p+1))}>»</button>
        </div>
      </div>
      {invoiceItem && (
        <InvoiceModal item={invoiceItem} hotel={invoiceHotel} openedAt={invoiceOpenedAt} onClose={()=>{setInvoiceItem(null);}} />
      )}
    </div>
  );
}

// ================= INVOICE HELPERS & MODAL =================
function buildInvoiceNumber(item){
  if(!item) return '';
  const id = String(item.bookingId||'').padStart(6,'0');
  // Use paid date or today for sequence prefix
  const d = item.paidAt? new Date(item.paidAt): new Date();
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0');
  return `HD${y}${m}${day}-${id}`;
}

function generateNightRows(item){
  if(!item) return [];
  try {
    const ci = new Date(item.checkIn); const co = new Date(item.checkOut);
    const rows=[]; let cursor = new Date(ci.getFullYear(), ci.getMonth(), ci.getDate());
    let idx=0; while(cursor < co){
      if(idx>60){ // safety stop for abnormal data
        rows.push({ date: fmtDate(cursor), desc:'Tiền phòng (gộp)', qty: (item.nights||0)-idx, unit: item.pricePerNight, amount: item.pricePerNight*((item.nights||0)-idx)});
        break;
      }
      rows.push({ date: fmtDate(cursor), desc:'Tiền phòng', qty:1, unit:item.pricePerNight, amount:item.pricePerNight });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()+1); idx++;
      if(idx >= (item.nights||0)) break;
    }
    return rows;
  } catch { return []; }
}

function calcInvoiceTotals(item, extra){
  if(!item) return { roomTotal:0, serviceTotal:0, tax:0, grand:0};
  const nightRows = generateNightRows(item);
  const roomTotal = nightRows.reduce((s,r)=> s + Number(r.amount||0), 0);
  const serviceTotal = (extra&&Array.isArray(extra.services)) ? extra.services.reduce((s,r)=> s+Number(r.amount||0),0):0;
  const tax = Math.round(roomTotal * 0.03); // 3% VAT giả định
  const grand = roomTotal + serviceTotal + tax;
  return { roomTotal, serviceTotal, tax, grand, nightRows };
}

function InvoiceModal({ item, hotel, openedAt, onClose }){
  if(!item) return null;
  const { nightRows } = calcInvoiceTotals(item, {});
  const invoiceNo = buildInvoiceNumber(item);
  // Họ tên tài khoản đặt phòng: ưu tiên userName -> customerName
  const custName = (item.userName && item.userName.trim()) ? item.userName : (item.customerName || 'Khách hàng');
  const checkInTime = '14:00:00';
  const checkOutTime = '12:00:00';
  // Nén hiển thị: chỉ ngày bắt đầu & kết thúc chia số ngày thành 2 dòng
  const totalNights = item.nights || nightRows.length || 0;
  let startQty = Math.floor(totalNights/2);
  let endQty = totalNights - startQty;
  if(startQty === 0 && endQty>0){ startQty = 1; endQty = totalNights - 1; }
  const startDateStr = fmtDate(item.checkIn);
  const endDateStr = fmtDate(item.checkOut);
  const price = item.pricePerNight || (nightRows[0]?.unit) || 0;
  const startAmount = price * startQty;
  const endAmount = price * endQty;
  // Dịch vụ minibar nếu tồn tại trong item.services (giả định mảng) hoặc flags khác
  let minibarRow = null;
  if(Array.isArray(item.services)){
    const svc = item.services.find(s=> /minibar|nước/i.test(s.name||''));
    if(svc){ minibarRow = { date: endDateStr, desc: svc.name, qty: svc.qty||1, unit: svc.price||svc.amount||0, amount: (svc.price||svc.amount||0)*(svc.qty||1) }; }
  }
  // Nếu không có services, bỏ qua (không tự thêm giả) theo yêu cầu mới
  const tableRows = [
    ...(totalNights>0 ? [{ date: startDateStr, desc:'Tiền phòng', qty:startQty, unit:price, amount:startAmount }] : []),
    ...(totalNights>1 ? [{ date: endDateStr, desc:'Tiền phòng', qty:endQty, unit:price, amount:endAmount }] : []),
    ...(minibarRow? [minibarRow]: [])
  ];
  const roomTotalDisplay = tableRows.filter(r=> r.desc==='Tiền phòng').reduce((s,r)=>s+r.amount,0);
  const serviceTotalDisplay = tableRows.filter(r=> r.desc!=='Tiền phòng').reduce((s,r)=>s+r.amount,0);
  const taxDisplay = Math.round(roomTotalDisplay * 0.03);
  const grandDisplay = roomTotalDisplay + serviceTotalDisplay + taxDisplay;
  const openedStamp = openedAt ? fmtDateTime(openedAt) : fmtDateTime(Date.now());
  return (
    <div className="invoice-overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
        <div className="invoice-modal" onMouseDown={(e)=>e.stopPropagation()}> 
        <button className="inv-back-btn" onClick={onClose} title="Quay lại">← Quay lại</button>
        <div className="invoice-paper">
          <div className="inv-header-band">
            <div className="inv-head-left">
              <img src="/logo.png" alt="Logo" className="inv-logo-img" onError={(e)=>{ e.currentTarget.style.display='none'; }} />
              <div className="inv-hotel-meta">
                <div>{hotel?.name || 'HMS - AI'}</div>
                <div>{hotel?.address || '03 Quang Trung - Đà Nẵng'}</div>
                <div>{hotel?.phone || '0388618687 · E: hms@gmail.com'}</div>
                <div>{hotel?.website || 'www.hmshotel.com'}</div>
              </div>
            </div>
            <div className="inv-head-right">
              <h1>HÓA ĐƠN</h1>
              <div className="inv-meta-line">Số hóa đơn: <strong>{invoiceNo}</strong></div>
              <div className="inv-meta-line inv-meta-date">Ngày: <strong>{openedStamp}</strong></div>
            </div>
          </div>
          {/* Removed duplicate centered title for cleaner framed header */}
          {/* Top 3 cards row */}
          <div className="inv-top-cards">
            <div className="inv-top-card"><div className="k-label">Mã đặt phòng</div><div className="k-value code-link">{item.code}</div></div>
            <div className="inv-top-card"><div className="k-label">Nguồn</div><div className="k-value">123 - HMS-AI</div></div>
            <div className="inv-top-card"><div className="k-label">Phòng</div><div className="k-value">{item.roomName || '—'}</div></div>
          </div>
          {/* Info grid split 2 columns */}
          <div className="inv-info-grid">
            <div className="inv-info-col">
              <div className="info-row"><span className="i-label">Tên khách hàng</span><span className="i-value i-upper">{custName}</span></div>
              <div className="info-row"><span className="i-label">Ngày nhận phòng</span><span className="i-value i-link">{fmtDate(item.checkIn)}</span></div>
              <div className="info-row"><span className="i-label">Ngày trả phòng</span><span className="i-value i-link">{fmtDate(item.checkOut)}</span></div>
              <div className="info-row"><span className="i-label">Loại phòng</span><span className="i-value i-link">{item.roomType || '—'}</span></div>
            </div>
            <div className="inv-info-col">
              <div className="info-row"><span className="i-label">Thời gian đến</span><span className="i-value i-time">{checkInTime}</span></div>
              <div className="info-row"><span className="i-label">Thời gian trả</span><span className="i-value i-time">{checkOutTime}</span></div>
              <div className="info-row"><span className="i-label">Số đêm lưu trú</span><span className="i-value">{totalNights}</span></div>
              <div className="info-row"><span className="i-label">CMND/Passport</span><span className="i-value i-link">{item.identityNumber || '—'}</span></div>
            </div>
          </div>
          {/* Table */}
          <table className="inv-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ngày</th>
                <th>Phòng / Nội dung</th>
                <th>Số lượng</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r,i)=> (
                <tr key={i}>
                  <td>{i+1}</td>
                  <td>{r.date}</td>
                  <td>{r.desc}</td>
                  <td>{r.qty}</td>
                  <td>{fmtMoney(r.unit)} VND</td>
                  <td>{fmtMoney(r.amount)} VND</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Summary mini table */}
          <table className="inv-summary-table">
            <tbody>
              <tr><td>Tiền phòng</td><td className="right">{fmtMoney(roomTotalDisplay)} VND</td></tr>
              <tr><td>Thuế</td><td className="right">{fmtMoney(taxDisplay)} VND</td></tr>
              <tr><td>Phí dịch vụ</td><td className="right">{fmtMoney(serviceTotalDisplay)} VND</td></tr>
              <tr className="total"><td>Tổng tiền</td><td className="right">{fmtMoney(grandDisplay)} VND</td></tr>
            </tbody>
          </table>
          <div className="inv-thanks">Xin cảm ơn Quý khách đã tin tưởng và sử dụng dịch vụ của chúng tôi.<br/>Chúc Quý khách có một kỳ nghĩ vui vẻ!</div>
          <div className="inv-sign-line">
            <div className="sign-col">
              <div><strong>Lễ tân</strong></div>
              <div className="sign-space"><span className="sign-watermark">HSMAI-Hotel</span><span className="sign-line" /></div>
              <div className="sign-name">Nhóm 1 HMSAI-Hotel</div>
            </div>
            <div className="sign-col">
              <div><strong>Khách hàng</strong></div>
              <div className="sign-space" style={{height:70}}><span className="sign-line" /></div>
              <div className="sign-name">{custName}</div>
            </div>
          </div>
        </div>
        <style>{`
          .invoice-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;z-index:4000;padding:30px 18px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;}
          .invoice-modal{background:#fff;border-radius:10px;max-width:960px;width:100%;box-shadow:0 14px 42px -6px rgba(0,0,0,.35);padding:4px 18px 20px;animation:invIn .4s ease;}
          @keyframes invIn{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
          .invoice-actions{display:none;}
          .inv-back-btn{position:absolute;top:8px;left:10px;background:#f1f5f9;border:1px solid #cbd5e1;color:#0f172a;font-weight:600;padding:6px 14px;border-radius:24px;cursor:pointer;font-size:13px;line-height:1;box-shadow:0 1px 2px rgba(0,0,0,.08);transition:.18s ease;background-image:linear-gradient(to bottom,#fff,#f1f5f9);} 
          .inv-back-btn:hover{background:#e2e8f0;}
          .inv-back-btn:active{transform:translateY(1px);}
          .inv-header-band{display:flex;gap:28px;align-items:center;justify-content:space-between;border:1px solid #d7dbe0;border-radius:8px;padding:14px 22px;margin-bottom:14px;position:relative;background:#fff;min-height:140px;}
          .inv-header-band:after{content:"";position:absolute;left:0;right:0;bottom:-6px;height:2px;background:#0f172a;opacity:.65;border-radius:2px;}
          .inv-head-left,.inv-head-right{flex:1;}
          .inv-head-left{display:flex;flex-direction:column;gap:6px;align-items:flex-start;}
          .inv-logo{display:none;}
          .inv-logo-img{display:block;max-height:90px;width:auto;margin:0 0 2px;}
          .inv-hotel-meta{font-size:12px;line-height:1.5;color:#0f172a;font-weight:500;display:flex;flex-direction:column;justify-content:center;min-width:200px;}
          .inv-head-right{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;text-align:right;font-size:12px;line-height:1.5;}
          .inv-head-right h1{margin:0 0 4px;font-size:18px;color:#0f172a;letter-spacing:.5px;}
          .inv-meta-line{margin:2px 0;color:#0f172a;}
          /* Removed .inv-sep & .inv-title-center after framing header */
          .inv-top-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;}
          .inv-top-card{background:#fff;border:1px solid #d7dbe0;border-radius:6px;min-height:66px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:8px 14px;}
          .inv-top-card .k-label,.inv-top-card .k-value{width:100%;}
          .k-label{font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;}
          .k-value{font-size:14px;font-weight:700;color:#0f5fa8;}
          .code-link{color:#0070c9;cursor:pointer;}
          .inv-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;background:#fff;border:1px solid #d7dbe0;border-radius:6px;padding:14px 18px;margin-bottom:18px;}
          .inv-info-col{display:flex;flex-direction:column;gap:10px;font-size:13px;}
          .info-row{display:flex;justify-content:space-between;gap:12px;}
          .i-label{color:#0f172a;font-weight:600;}
          .i-value{font-weight:600;color:#0f5fa8;}
          .i-link{color:#0070c9;}
          .i-upper{text-transform:uppercase;}
          .i-time{color:#0f5fa8;font-weight:700;}
          .inv-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;}
          .inv-table th{background:#0f5fa8;color:#fff;padding:8px 10px;font-size:12px;border:1px solid #0f5fa8;}
          .inv-table td{padding:8px 10px;border:1px solid #e2e8f0;}
          .inv-table tbody tr:nth-child(even){background:#f8fafc;}
          .inv-summary-table{width:100%;border-collapse:collapse;margin:18px 0 22px;font-size:13px;}
          .inv-summary-table td{padding:10px 14px;border:1px solid #e2e8f0;}
          .inv-summary-table tr td:first-child{width:50%;font-weight:600;color:#0f172a;}
          .inv-summary-table tr.total td{font-weight:700;color:#0f172a;background:#e8f2fa;}
          .inv-summary-table td.right{text-align:right;font-weight:700;color:#0f5fa8;}
          .inv-thanks{text-align:center;font-size:12px;color:#475569;margin:10px 0 30px;line-height:1.55;font-weight:600;}
          .inv-sign-line{display:flex;justify-content:space-between;margin:30px 0 10px;font-size:13px;text-align:center;}
          .sign-col{flex:1;display:flex;flex-direction:column;align-items:center;}
          .sign-space{height:70px;position:relative;display:flex;align-items:flex-end;justify-content:center;width:100%;}
          .sign-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:14px;color:#0f5fa8;opacity:.4;font-weight:700;pointer-events:none;user-select:none;white-space:nowrap;}
          .inv-summary-table tr.total td.right{color:#0f5fa8;}
          .sign-line{display:block;width:70%;height:1px;background:#0f172a;margin-bottom:2px;}
          .sign-name{font-size:12px;color:#0f5fa8;font-weight:600;margin-top:4px;}
          .inv-footer-names{display:none;}
          @media (max-width:760px){
            .inv-top-cards{grid-template-columns:1fr;}
            .inv-info-grid{grid-template-columns:1fr;}
            .inv-header-band{gap:18px;padding:14px 16px;min-height:120px;}
            .inv-logo-img{max-height:70px;}
            .inv-hotel-meta{min-width:0;}
          }
          @media (max-width:520px){ .inv-logo-img{max-height:60px;} }
          @media print{ .inv-logo-img{max-height:70px;} }
          @media print{body{background:#fff;} .invoice-overlay{position:static;background:#fff;box-shadow:none;padding:0;} .invoice-modal{box-shadow:none;padding:0;} .invoice-actions,.inv-back-btn{display:none !important;} .inv-table th{background:#0f5fa8 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;} }
        `}</style>
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

// Additional styles for pinned horizontal scrollbar
// (Injected once via a style tag at bottom if not present)
if(typeof document !== 'undefined' && !document.getElementById('ph-scroll-bottom-style')){
  const style = document.createElement('style');
  style.id = 'ph-scroll-bottom-style';
  style.textContent = `
    .ph-scroll-bottom-wrapper{position:sticky;bottom:0;left:0;background:linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0.75));padding-top:4px;padding-bottom:2px;z-index:50;}
    .ph-scroll-bottom::-webkit-scrollbar{height:10px;}
    .ph-scroll-bottom::-webkit-scrollbar-track{background:#f1f5f9;border-radius:6px;}
    .ph-scroll-bottom::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:6px;}
    .ph-scroll-bottom::-webkit-scrollbar-thumb:hover{background:#64748b;}
    /* Hide original top scrollbar when custom pinned bar is present */
    .ph-scroll-top{scrollbar-width:none;-ms-overflow-style:none;}
    .ph-scroll-top::-webkit-scrollbar{display:none;height:0;}
    /* Action column new styles */
  .ph-action-stack{display:flex;flex-direction:column;gap:6px;min-width:128px;}
  .ph-action-btn{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;letter-spacing:.5px;padding:11px 14px;border-radius:8px;text-align:center;cursor:pointer;user-select:none;min-height:42px;font-family:inherit;position:relative;transition:background .25s, box-shadow .25s, transform .15s,border-color .25s,color .25s;}
  .ph-action-btn:focus-visible{outline:2px solid #2563eb;outline-offset:2px;}
  .ph-action-btn:active{transform:translateY(1px);} 
  /* Primary gradient */
  .ph-action-primary{color:#fff !important;background:linear-gradient(145deg,#1d64f0,#1251c7) !important;box-shadow:0 2px 4px rgba(29,100,240,.4) !important;border:1px solid #1552c5 !important;}
  .ph-action-primary:hover{background:linear-gradient(145deg,#256ef5,#1d55d8) !important;box-shadow:0 4px 10px -2px rgba(29,100,240,.55) !important;border-color:#1d55d8 !important;} 
  /* Outline (elevated white) */
  .ph-action-outline{background:linear-gradient(#ffffff,#f1f5f9) !important;border:1px solid #d0d7df !important;color:#0f172a !important;box-shadow:0 1px 2px rgba(15,23,42,.12) !important;}
  .ph-action-outline:hover{background:linear-gradient(#f8fafc,#e2e8f0) !important;border-color:#c2cad2 !important;} 
  /* Danger */
  .ph-action-danger{background:linear-gradient(145deg,#dc2626,#b91c1c) !important;color:#fff !important;box-shadow:0 2px 4px rgba(220,38,38,.4) !important;border:1px solid #b91c1c !important;} 
  .ph-action-danger:hover{background:linear-gradient(145deg,#ef2f2f,#c52020) !important;box-shadow:0 4px 10px -2px rgba(220,38,38,.55) !important;border-color:#c52020 !important;} 
  /* Disabled */
  .ph-action-btn.disabled,.ph-action-btn:disabled{background:linear-gradient(#f1f5f9,#e2e8f0) !important;color:#94a3b8 !important;border:1px solid #dbe0e6 !important;cursor:default;box-shadow:none !important;}
  /* Refund badge pill */
  .ph-action-refund{font-size:11px;font-weight:600;color:#047857;background:linear-gradient(145deg,#ecfdf5,#d1fae5);border:1px solid #34d399;border-radius:10px;padding:10px 8px;line-height:1.25;text-align:center;box-shadow:0 1px 3px rgba(16,185,129,.35);} 
  .ph-action-refund b{display:block;font-size:12px;margin-bottom:2px;color:#065f46;}
  .ph-action-refund:before{content:"";}
    @media (max-width:900px){ .ph-action-stack{min-width:104px;} .ph-action-btn{font-size:11px;padding:8px 8px;min-height:36px;} }
  `;
  document.head.appendChild(style);
}

// Styles for .ph-action-inline, .ph-link, .ph-cancel-btn, .ph-refund-note moved to HomePage.css
