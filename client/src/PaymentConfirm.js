// Renamed conceptually to PaymentPending (file name will be adjusted separately if desired)
import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import './HomePage.css';
import showToast from './toast';
import { isLoggedIn } from './auth';

export default function PaymentPending() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const amount = params.get('amount') || '';
  const code = params.get('code') || '';
  const rt = params.get('rt') || '';
  const hid = params.get('hid') || '';
  const ci = params.get('ci') || '';
  const co = params.get('co') || '';
  const ad = params.get('ad') || '';
  const ch = params.get('ch') || '';
  const rn = params.get('rn') || '';
  const navigate = useNavigate();
  const origin = params.get('origin') || '';

  // Guard: if chưa đăng nhập chuyển hướng login (giữ lại query để quay lại nếu cần)
  useEffect(() => {
    if (!isLoggedIn()) {
      try { sessionStorage.setItem('hmsRedirectAfterLogin', window.location.pathname + window.location.search); } catch {}
      navigate('/login');
    }
  }, [navigate]);

  const [initState, setInitState] = useState({ started:false, success:false, error:'', loading:false });
  const [serverPromo, setServerPromo] = useState(null);
  const [serverPromoError, setServerPromoError] = useState('');
  // Tính số tiền hiển thị ban đầu (có thể đang chứa mã cũ chưa revalidate)
  let initialFinalAmount = Number(amount||0);
  try {
    const raw = localStorage.getItem('hmsBooking:'+token);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.promo && typeof s.promo.final !== 'undefined' && s.promo.final !== null) {
        initialFinalAmount = Number(s.promo.final || initialFinalAmount);
      } else if (s && s.promo && s.promo.code) {
        if (s.promo.discountValue && s.promo.discountType) {
          if (s.promo.discountType === 'PERCENT') {
            const disc = Math.round(initialFinalAmount * (Number(s.promo.discountValue||0) / 100));
            initialFinalAmount = Math.max(0, initialFinalAmount - disc);
          } else {
            const disc = Number(s.promo.discountValue||0);
            initialFinalAmount = Math.max(0, initialFinalAmount - disc);
          }
        }
      }
    }
  } catch {}
  const [computedAmount, setComputedAmount] = useState(initialFinalAmount);

  // Helper: drop promo from local storage & reset amount
  const dropPromo = (reasonMsg) => {
    try {
      const raw = localStorage.getItem('hmsBooking:'+token);
      if(raw){
        const s = JSON.parse(raw);
        if(s.promo){ delete s.promo; localStorage.setItem('hmsBooking:'+token, JSON.stringify(s)); }
      }
    } catch {}
    setComputedAmount(Number(amount||0));
    if (reasonMsg) {
      showToast(reasonMsg, { type:'warning', duration: 3200 });
    }
  };

  // Re-validate promo with server to get authoritative discount & final amount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = localStorage.getItem('hmsBooking:'+token);
        if (!raw) return;
        const s = JSON.parse(raw);
        if (!s || !s.promo || !s.promo.code) return;
        // request validate with gross amount
        const gross = Number(amount || 0);
  const url = new URL('/api/promotions/validate', window.location.origin);
  url.searchParams.set('code', String(s.promo.code).trim());
  url.searchParams.set('amount', String(gross));
  if (s.hotelId) url.searchParams.set('hotelId', String(s.hotelId));
  if (Array.isArray(s.rooms) && s.rooms.length) url.searchParams.set('roomIds', s.rooms.map(r=>r.id).join(','));
        try {
          const resp = await fetch(url.toString());
          if (!mounted) return;
          if (!resp.ok) {
            const body = await resp.json().catch(()=>({}));
            const msg = body && body.message ? body.message : 'Mã ưu đãi không hợp lệ';
            // Removed debug warn for promo validate non-ok
            setServerPromoError(msg);
            setServerPromo(null);
            // Nếu mã thuộc khách sạn khác hoặc thiếu phòng để xác định => hủy ngay để không còn giảm ở UI
            if (/khách sạn/i.test(msg) || /phòng đã chọn/i.test(msg) || /Thiếu phòng/i.test(msg)) {
              dropPromo('Mã ưu đãi đã bị gỡ (không áp dụng cho khách sạn/phòng này)');
            } else {
              // fallback: hiển thị số tiền gốc nếu validate thất bại
              setComputedAmount(Number(amount||0));
            }
            return;
          }
          const body = await resp.json();
          // Removed debug log for promo validate response
            if (body && body.ok) {
              if (typeof body.final === 'number') setComputedAmount(Number(body.final));
              else if (typeof body.discount === 'number') setComputedAmount(Math.max(0, Number(amount||0) - Number(body.discount)));
            } else {
              setComputedAmount(Number(amount||0));
            }
          setServerPromo(body);
          setServerPromoError('');
        } catch (err) {
          console.error('[PaymentConfirm] promo validate failed', err);
          if (!mounted) return;
          // Provide a helpful message; in dev we include the error text
          setServerPromoError((err && err.message) ? ('Lỗi kiểm tra ưu đãi: ' + err.message) : 'Lỗi kiểm tra ưu đãi');
          setServerPromo(null);
          setComputedAmount(Number(amount||0));
        }
      } catch (e) {
        if (!mounted) return;
        setServerPromoError('Lỗi kiểm tra ưu đãi');
        setServerPromo(null);
        setComputedAmount(Number(amount||0));
      }
    })();
    return () => { mounted = false; };
  }, [token, amount]);
  
  // Exposed revalidate function for UI retry
  const revalidatePromo = async () => {
    setServerPromoError('');
    setServerPromo(null);
    try {
      const raw = localStorage.getItem('hmsBooking:' + token);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || !s.promo || !s.promo.code) return false;
      const gross = Number(amount || 0);
      const url = new URL('/api/promotions/validate', window.location.origin);
  url.searchParams.set('code', String(s.promo.code).trim());
  url.searchParams.set('amount', String(gross));
  if (s.hotelId) url.searchParams.set('hotelId', String(s.hotelId));
  if (Array.isArray(s.rooms) && s.rooms.length) url.searchParams.set('roomIds', s.rooms.map(r=>r.id).join(','));
      const resp = await fetch(url.toString());
          if (!resp.ok) {
            const body = await resp.json().catch(()=>({}));
            // Removed debug warn for promo validate non-ok (retry path)
            const msg = body && body.message ? body.message : 'Mã ưu đãi không hợp lệ';
            setServerPromoError(msg);
            setServerPromo(null);
            // Auto drop promo if mismatch hotel to prevent silent usage later
            if (/khách sạn/i.test(msg) || /phòng đã chọn/i.test(msg) || /Thiếu phòng/i.test(msg)) {
              dropPromo('Đã gỡ mã ưu đãi không phù hợp');
            } else {
              setComputedAmount(Number(amount||0));
            }
            return;
          }
      setServerPromo(body);
      setServerPromoError('');
      if (body && body.ok) {
        if (typeof body.final === 'number') setComputedAmount(Number(body.final));
        else if (typeof body.discount === 'number') setComputedAmount(Math.max(0, Number(amount||0) - Number(body.discount)));
      } else setComputedAmount(Number(amount||0));
      return true;
    } catch (err) {
      setServerPromoError((err && err.message) ? ('Lỗi kiểm tra ưu đãi: ' + err.message) : 'Lỗi kiểm tra ưu đãi');
      setServerPromo(null);
      setComputedAmount(Number(amount||0));
      return false;
    }
  };

  // Clear promo from local summary and proceed to initiate payment
  const clearPromoAndProceed = async () => {
    try {
      const raw = localStorage.getItem('hmsBooking:' + token);
      if (raw) {
        const s = JSON.parse(raw);
        delete s.promo;
        localStorage.setItem('hmsBooking:' + token, JSON.stringify(s));
      }
    } catch {}
    await initiate();
  };
  const [pollMsg, setPollMsg] = useState('');
  const [paid, setPaid] = useState(false);
  // Simple polling of transactions list to see if status turned paid (optional improvement)
  useEffect(()=>{
    if(!initState.success || paid) return;
    const id = setInterval(async ()=>{
      try {
        const raw = localStorage.getItem('hmsBooking:'+token);
        if(!raw) return; const s = JSON.parse(raw);
        const email = s.userEmail; if(!email) return;
        const q = new URL('/api/transactions', window.location.origin);
        q.searchParams.set('email', email);
        q.searchParams.set('q', code||'');
        const r = await fetch(q.toString());
        if(r.ok){ const j = await r.json();
          const anyPaid = (j.items||[]).some(it=> String(it.code||'')===code && it.paymentStatus==='paid');
          if(anyPaid){ setPaid(true); setPollMsg('Đã xác nhận thanh toán!'); clearInterval(id); }
        }
      } catch {}
    }, 8000);
    return ()=> clearInterval(id);
  }, [initState.success, paid, token, code]);

  const initiate = async () => {
    setInitState(s=>({...s, loading:true, error:''}));
    try {
      const raw = localStorage.getItem('hmsBooking:' + token);
      if(!raw) throw new Error('Không tìm thấy dữ liệu đặt phòng');
      const s = JSON.parse(raw);
      let email = s.userEmail || '';
      if (!email) { try { const u = localStorage.getItem('hmsUser'); if (u) email = JSON.parse(u).email || ''; } catch {} }
      if(!email) throw new Error('Thiếu email');
  const payload = { token, email, checkIn: s.checkIn, checkOut: s.checkOut, method: s.payMethod || 'MOMO', rooms: (s.rooms||[]).map(r=>({ id:r.id, adults:r.adults||1, children:r.children||0, price:r.price })) };
  // include promo code if present so server can validate/apply on confirm
  if (s.promo && s.promo.code) payload.promoCode = s.promo.code;
  const resp = await fetch('/api/payments/complete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(!resp.ok){ const t=await resp.text(); throw new Error('Tạo giao dịch lỗi: '+t); }
      let data = {};
      try { data = await resp.json(); } catch { data = {}; }
      const bookings = Array.isArray(data.bookings) ? data.bookings : [];
      // Lưu danh sách bookingIds vào summary để user có thể hủy nếu muốn
      try {
        const raw2 = localStorage.getItem('hmsBooking:'+token);
        if(raw2){ const summary = JSON.parse(raw2); summary.bookingIds = bookings; localStorage.setItem('hmsBooking:'+token, JSON.stringify(summary)); }
      } catch {}
      setInitState({ started:true, success:true, error:'', loading:false });
    } catch(e){ setInitState({ started:true, success:false, error:e.message||'Lỗi khởi tạo', loading:false }); }
  };

  return (
    <div className="home-root" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', border:'1px solid #e5e5e5', borderRadius:12, padding:24, maxWidth:560, width:'100%', textAlign:'center', boxShadow:'0 2px 10px rgba(0,0,0,0.06)' }}>
        <h1 style={{ marginTop:0 }}>Thanh toán chuyển khoản</h1>
        <p style={{ marginTop:4 }}>Quét mã QR bên dưới để chuyển khoản đúng số tiền. Sau đó chờ quản trị viên xác nhận.</p>
        <div style={{ margin:'16px auto', width:240, height:240, borderRadius:16, overflow:'hidden', border:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', background:'#fafafa' }}>
          <img src="/qr-image.jpg" alt="QR thanh toán" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        </div>
          <div style={{ fontSize:13, background:'#f1f5f9', padding:12, borderRadius:8, textAlign:'left', lineHeight:1.5, display:'flex', flexDirection:'column', gap:8 }}>
          <div><strong>Số tiền thanh toán:</strong> {computedAmount.toLocaleString('vi-VN')} VND</div>
          {serverPromo && serverPromo.ok && (
            <div style={{ color:'#0f172a' }}>
              <div><strong>Mã ưu đãi áp dụng:</strong> {serverPromo.code}</div>
              <div><strong>Giảm giá:</strong> {Number(serverPromo.discount||0).toLocaleString('vi-VN')} VND</div>
              <div style={{ fontWeight:700 }}><strong>Tổng sau giảm:</strong> {Number(serverPromo.final||computedAmount).toLocaleString('vi-VN')} VND</div>
            </div>
          )}
          {serverPromoError && (
            <div style={{ color:'#b42318' }}>
              <div><strong>Ưu đãi:</strong> {serverPromoError}</div>
              <div style={{ marginTop:8, display:'flex', gap:8 }}>
                <button type="button" onClick={() => { revalidatePromo(); }} className="checkout-inline-toggle">Thử lại kiểm tra ưu đãi</button>
                <button type="button" onClick={() => { clearPromoAndProceed(); }} className="checkout-inline-toggle">Bỏ ưu đãi và tiếp tục</button>
              </div>
              <details style={{ marginTop:8 }}>
                <summary style={{ cursor:'pointer' }}>Xem chi tiết (debug)</summary>
                <pre style={{ textAlign:'left', fontSize:12, whiteSpace:'pre-wrap', marginTop:8 }}>{JSON.stringify({ serverPromo, serverPromoError }, null, 2)}</pre>
              </details>
            </div>
          )}
          <strong>Mã giao dịch:</strong> {token || '—'}<br/>
          <strong>Mã đặt (booking code):</strong> {code || '—'}<br/>
          <strong>Nội dung CK gợi ý:</strong> {code ? (code+" "+(token||'')).slice(0,40) : (token||'')}<br/>
        </div>
        {!initState.started && (
          <button className="checkout-btn" style={{ marginTop:18 }} disabled={initState.loading} onClick={initiate}>{initState.loading? 'Đang tạo...' : 'BẮT ĐẦU / GHI NHẬN THANH TOÁN'}</button>
        )}
        {initState.started && !initState.success && (
          <div style={{ marginTop:14, color:'#b42318', fontSize:13 }}>{initState.error}</div>
        )}
        {initState.success && !paid && (
          <div style={{ marginTop:16, fontSize:13, color:'#0f172a', lineHeight:1.5 }}>
            <div style={{ fontWeight:600, color:'#047857', marginBottom:4 }}>Yêu cầu đặt phòng đã gửi thành công!</div>
            Đang chờ xác nhận từ quản trị viên... (Trang sẽ tự cập nhật trạng thái)<br/>
            Bạn có thể tiếp tục duyệt trang khác; hệ thống sẽ gửi thông báo khi được xác nhận.
            <PendingBookings token={token} />
          </div>
        )}
        {paid && (
          <div style={{ marginTop:18 }}>
            <div style={{ fontSize:14, fontWeight:600, color:'#047857' }}>ĐÃ XÁC NHẬN THANH TOÁN ✔</div>
            <button className="checkout-btn" style={{ marginTop:12 }} onClick={()=> navigate('/payment/success?token='+encodeURIComponent(token))}>Tiếp tục</button>
          </div>
        )}
        {pollMsg && <div style={{ marginTop:10, fontSize:12, color:'#047857' }}>{pollMsg}</div>}
        <div style={{ marginTop: 20 }}>
          <button
            onClick={()=> {
              // Nếu có origin chứa state booking (JSON encode) -> lưu lại và điều hướng về trang chủ để mở overlay
              if(origin){
                try {
                  const dec = decodeURIComponent(origin);
                  const data = JSON.parse(dec);
                  if(data && data.__roomsBookingDraft){
                    sessionStorage.setItem('hmsReturnBookingDraft', JSON.stringify(data.__roomsBookingDraft));
                  }
                } catch {}
              }
              navigate('/?return=1');
            }}
            className="checkout-inline-toggle" style={{ marginRight:12 }}
          >Quay lại đặt phòng</button>
          <Link to="/" className="checkout-inline-toggle">Về Trang Chủ</Link>
        </div>
      </div>
    </div>
  );
}

// Component hiển thị danh sách booking pending và cho phép user hủy trước khi admin xác nhận
function PendingBookings({ token }) {
  const [list, setList] = React.useState([]);
  const [busy, setBusy] = React.useState(null);
  const [reloadTick, setReloadTick] = React.useState(0);

  React.useEffect(()=>{
    try {
      const raw = localStorage.getItem('hmsBooking:'+token);
      if(raw){
        const s = JSON.parse(raw);
        const ids = Array.isArray(s.bookingIds)? s.bookingIds : [];
        setList(ids.filter(b=> typeof b === 'number' || typeof b === 'string'));
      }
    } catch {}
  }, [token, reloadTick]);

  const cancelOne = async (bid) => {
    if(!window.confirm('Hủy booking #' + bid + ' và hoàn 85%?')) return;
    setBusy(bid);
    let email = '';
    try { const u = JSON.parse(localStorage.getItem('hmsUser')||'null'); email = u?.email||''; } catch {}
    try {
      const r = await fetch(`/api/payments/${bid}/cancel`, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email }) });
      if(!r.ok){ const t=await r.text(); throw new Error(t); }
      // Cập nhật localStorage
      try {
        const raw = localStorage.getItem('hmsBooking:'+token);
        if(raw){ const s = JSON.parse(raw); s.bookingIds = (s.bookingIds||[]).filter(x=> x!==bid); localStorage.setItem('hmsBooking:'+token, JSON.stringify(s)); }
      } catch {}
      setList(ls=> ls.filter(x=> x!==bid));
      showToast('Đã hủy booking #' + bid, { type: 'success', duration: 2200 });
    } catch(e){ showToast(e.message||'Hủy thất bại', { type: 'error', duration: 2600 }); }
    finally { setBusy(null); }
  };

  if(!list.length) return null;
  return (
    <div style={{ marginTop:14, padding:12, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, textAlign:'left' }}>
      <div style={{ fontWeight:600, fontSize:12, marginBottom:6 }}>Danh sách booking chờ xác nhận:</div>
      <ul style={{ margin:0, paddingLeft:18, fontSize:12 }}>
        {list.map(id => (
          <li key={id} style={{ marginBottom:4 }}>
            Booking #{id} &nbsp;
            <button
              type="button"
              onClick={()=> cancelOne(id)}
              disabled={busy===id}
              className="checkout-inline-toggle"
              style={{ fontSize:11 }}
            >{busy===id ? 'Đang hủy...' : 'Hủy'}</button>
          </li>
        ))}
      </ul>
      <div style={{ marginTop:6, fontSize:11, color:'#475569' }}>Bạn có thể hủy trước khi quản trị viên xác nhận (phí 15%).</div>
      <button type="button" onClick={()=> setReloadTick(t=>t+1)} className="checkout-inline-toggle" style={{ marginTop:8, fontSize:11 }}>Làm mới</button>
    </div>
  );
}