import React, { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './HomePage.css';
import { authHeaders, getUserRole } from './auth';

export default function CheckInOut({ isModal, onClose }) {
  const role = getUserRole();
  const isStaff = role === 'Staff';
  if (!isStaff) {
    return null;
  }
  const [date, setDate] = useState(() => new Date());
  const [showAll, setShowAll] = useState(true);
  const [openPicker, setOpenPicker] = useState(false);
  const [q, setQ] = useState('');
  const [typingTimer, setTypingTimer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [stats, setStats] = useState({ checkin: 0, checkout: 0, stay: 0 });
  const [statsToday, setStatsToday] = useState({ checkInsToday: 0, checkOutsToday: 0, notArrivedToday: 0 });
  const [err, setErr] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [hideDone, setHideDone] = useState(true);
  const [modal, setModal] = useState({ open: false, message: '', onConfirm: null, onCancel: null });
  const invRef = useRef(null);

  const fmtDate = (d) => {
    if (!d) return '';
    const dt = (d instanceof Date) ? d : new Date(d);
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const yy = dt.getFullYear();
    return `${mm}/${dd}/${yy}`;
  };
  const toIso = (d) => {
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  };

  const fetchList = async () => {
    setLoading(true); setErr('');
    try {
      const url = new URL('/api/admin/checkinout', window.location.origin);
      if (!showAll && date) url.searchParams.set('date', toIso(date));
      if (q.trim()) url.searchParams.set('q', q.trim());
  const res = await fetch(url.toString(), { cache: 'no-store', headers: { ...authHeaders() } });
      if (!res.ok) {
        const j = await res.json().catch(()=>({}));
        throw new Error(j.message || `HTTP ${res.status}`);
      }
      const j = await res.json();
      setItems(Array.isArray(j.items) ? j.items : []);
  setSelectedIds([]);
      setStats(j.stats || { checkin: 0, checkout: 0, stay: 0 });
      // Also refresh today's stats
      try {
        const sres = await fetch('/api/admin/stats/today', { headers: { ...authHeaders() }, cache: 'no-store' });
        if (sres.ok) {
          const sj = await sres.json();
          setStatsToday({
            checkInsToday: Number(sj.checkInsToday || 0),
            checkOutsToday: Number(sj.checkOutsToday || 0),
            notArrivedToday: Number(sj.notArrivedToday || 0)
          });
        }
      } catch {}
    } catch (e) {
      setErr(e.message || 'Lỗi tải danh sách');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); /* eslint-disable-next-line */ }, [date, showAll]);

  const doAction = async (id, action) => {
    try {
      // For checkout, run preview first
      if (action === 'checkout') {
        const prev = await fetch(`/api/admin/checkinout/${id}/checkout-preview`, { headers: { ...authHeaders() }, cache: 'no-store' });
        if (!prev.ok) {
          const pj = await prev.json().catch(()=>({}));
          setModal({ open: true, message: pj.message || 'Không tính được hóa đơn', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
          return;
        }
        const { invoice: pre } = await prev.json();
        const paid = Number(pre.paidAmount || 0);
        const total = Number(pre.total || 0);
        const refund = Number(pre.refund || 0);
        const collect = Number(pre.collect || 0);
        const msg = collect > 0
          ? `Xác nhận CHECK-OUT?
Cần THU thêm: ${collect.toLocaleString('vi-VN')} đ
(Đã thanh toán: ${paid.toLocaleString('vi-VN')} đ, Tổng mới: ${total.toLocaleString('vi-VN')} đ)`
          : `Xác nhận CHECK-OUT?
Cần THỐI lại: ${refund.toLocaleString('vi-VN')} đ
(Đã thanh toán: ${paid.toLocaleString('vi-VN')} đ, Tổng mới: ${total.toLocaleString('vi-VN')} đ)`;
        const ok = await new Promise(resolve => {
          setModal({
            open: true,
            message: msg,
            onConfirm: () => { setModal({ open: false, message: '', onConfirm: null, onCancel: null }); resolve(true); },
            onCancel: () => { setModal({ open: false, message: '', onConfirm: null, onCancel: null }); resolve(false); }
          });
        });
        if (!ok) return;
      }

      const res = await fetch(`/api/admin/checkinout/${id}/${action}`, { method: 'PUT', headers: { ...authHeaders() } });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) {
        setModal({ open: true, message: (data && data.message) || 'Thao tác thất bại', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
        return;
      }
      if (action === 'checkout' && data && data.invoice) {
        setInvoice(data.invoice);
        const paid = Number(data.invoice.paidAmount || 0);
        const total = Number(data.invoice.total || 0);
        const refund = Number(data.invoice.refund || 0);
        const collect = Number(data.invoice.collect || 0);
        const resultMsg = collect > 0
          ? `ĐÃ CHECK-OUT.
Cần THU thêm: ${collect.toLocaleString('vi-VN')} đ`
          : (refund > 0 ? `ĐÃ CHECK-OUT.
Cần THỐI lại: ${refund.toLocaleString('vi-VN')} đ` : 'ĐÃ CHECK-OUT. Không phát sinh chênh lệch.');
        setModal({ open: true, message: resultMsg, onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
      }
      // Optimistic UI: update local row status immediately
      setItems(prev => (prev || []).map(it => {
        if (it.bookingId !== id) return it;
        if (action === 'checkin') return { ...it, status: 'checkedin' };
        if (action === 'checkout') return { ...it, status: 'checkedout' };
        if (action === 'complete') return { ...it, status: 'completed' };
        return it;
      }));
      // Optional: thông báo nhanh
      // alert(data && data.message ? data.message : 'Thành công');
      await fetchList();
      try {
        const sres = await fetch('/api/admin/stats/today', { headers: { ...authHeaders() }, cache: 'no-store' });
        if (sres.ok) {
          const sj = await sres.json();
          setStatsToday({
            checkInsToday: Number(sj.checkInsToday || 0),
            checkOutsToday: Number(sj.checkOutsToday || 0),
            notArrivedToday: Number(sj.notArrivedToday || 0)
          });
        }
      } catch {}
    } catch (e) {
      setModal({ open: true, message: e.message || 'Lỗi thao tác', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
    }
  };

  const viewInvoice = async (id) => {
    try {
      const prev = await fetch(`/api/admin/checkinout/${id}/checkout-preview`, { headers: { ...authHeaders() }, cache: 'no-store' });
      if (!prev.ok) {
        const pj = await prev.json().catch(()=>({}));
        setModal({ open: true, message: pj.message || 'Không xem được hóa đơn', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
        return;
      }
      const { invoice: pre } = await prev.json();
      setInvoice(pre);
    } catch (e) {
      setModal({ open: true, message: e.message || 'Lỗi khi xem hóa đơn', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
    }
  };

  const deleteBooking = async (id) => {
    const ok = await new Promise(resolve => setModal({
      open: true,
      message: 'Xóa đơn này? Thao tác không thể hoàn tác.',
      onConfirm: () => { setModal({ open: false, message: '', onConfirm: null, onCancel: null }); resolve(true); },
      onCancel: () => { setModal({ open: false, message: '', onConfirm: null, onCancel: null }); resolve(false); }
    }));
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/checkinout/${id}`, { method: 'DELETE', headers: { ...authHeaders(), 'Content-Type': 'application/json' } });
      const j = await res.json().catch(()=>({}));
      if (!res.ok) {
        setModal({ open: true, message: j.message || 'Xóa thất bại', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
        return;
      }
      setModal({ open: true, message: j.message || 'Đã xóa', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
      setInvoice(null);
      await fetchList();
    } catch (e) {
      setModal({ open: true, message: e.message || 'Lỗi khi xóa', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
    }
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return;
    const ok = await new Promise(resolve => setModal({
      open: true,
      message: `Xóa ${selectedIds.length} đơn đã chọn?`,
      onConfirm: () => { setModal({ open: false, message: '', onConfirm: null, onCancel: null }); resolve(true); },
      onCancel: () => { setModal({ open: false, message: '', onConfirm: null, onCancel: null }); resolve(false); }
    }));
    if (!ok) return;
    try {
      const res = await fetch('/api/admin/checkinout/bulk-delete', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds }) });
      const j = await res.json().catch(()=>({}));
      if (!res.ok) {
        setModal({ open: true, message: j.message || 'Xóa thất bại', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
        return;
      }
      setModal({ open: true, message: j.message || `Đã xóa ${selectedIds.length} đơn`, onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
      setInvoice(null);
      await fetchList();
    } catch (e) {
      setModal({ open: true, message: e.message || 'Lỗi khi xóa hàng loạt', onConfirm: () => setModal({ open: false, message: '', onConfirm: null }) });
    }
  };

  const Calendar = useMemo(() => function CalendarComp() {
    // Simple inline calendar (no external lib)
    const [view, setView] = useState(() => {
      const d = date || new Date();
      return { y: d.getFullYear(), m: d.getMonth() };
    });
    const first = new Date(view.y, view.m, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const todayIso = toIso(new Date());
    const selectedIso = date ? toIso(date) : '';
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));
    return (
      <div className="ph-calendar" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, background: '#fff', width: 260, boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <button className="ph-btn ph-btn--secondary" onClick={() => setView(v => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))}>‹</button>
          <div style={{ fontWeight: 700 }}>{new Date(view.y, view.m, 1).toLocaleString('vi-VN', { month: 'long', year: 'numeric' })}</div>
          <button className="ph-btn ph-btn--secondary" onClick={() => setView(v => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 12, color: '#666', marginBottom: 4 }}>
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} style={{ textAlign: 'center' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const iso = toIso(d);
            const isToday = iso === todayIso;
            const isSel = iso === selectedIso;
            return (
              <button
                key={iso}
                className="ph-btn"
                style={{ padding: 6, background: isSel ? '#2e90fa' : '#fff', color: isSel ? '#fff' : (isToday ? '#2e90fa' : '#111'), border: '1px solid #eee' }}
                onClick={() => { setDate(d); setOpenPicker(false); }}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <button className="ph-btn ph-btn--secondary" onClick={() => { setDate(new Date()); setOpenPicker(false); }}>Today</button>
          <button className="ph-btn ph-btn--danger" onClick={() => { setDate(null); setOpenPicker(false); }}>Clear</button>
        </div>
      </div>
    );
  // depend on date so selected day reflects
  }, [date]);

  return (
    <div className="admin-checkio" style={{ padding: isModal ? 0 : '80px 12px 20px' }}>
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ width: 420, maxWidth: '90vw', background: '#fff', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.25)', padding: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10, textAlign: 'center' }}>Thông báo</div>
            <div style={{ fontSize: 15, color: '#111', marginBottom: 16, textAlign: 'center', whiteSpace: 'pre-wrap' }}>{modal.message}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              {modal.onCancel && (
                <button className="ph-btn ph-btn--secondary" onClick={() => modal.onCancel ? modal.onCancel() : setModal({ open: false, message: '', onConfirm: null, onCancel: null })}>Hủy</button>
              )}
              <button className="ph-btn" onClick={() => modal.onConfirm ? modal.onConfirm() : setModal({ open: false, message: '', onConfirm: null, onCancel: null })}>Xác nhận</button>
            </div>
          </div>
        </div>
      )}
      {!isModal && (
        <header className="home-header" style={{ position: 'sticky', top: 0 }}>
          <div className="home-header-left">
            <img src="/logo.png" alt="logo" className="home-header-logo" />
            <a href="/" className="home-header-title home-header-home-btn">TRANG CHỦ</a>
          </div>
        </header>
      )}
      <div className="ph-table" style={{ padding: 16 }}>
        <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Quản lý Check in - Check out</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'end', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: 13, color: '#111', fontWeight: 600, marginBottom: 4 }}>Chọn ngày:</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <input
                  value={showAll ? '' : (date ? fmtDate(date) : '')}
                  onChange={()=>{}}
                  placeholder="mm/dd/yyyy"
                  className="ph-input"
                  style={{ width: 200, paddingRight: 34 }}
                  readOnly
                  disabled={showAll}
                />
                <button className="ph-icon-btn" aria-label="Calendar" onClick={() => setOpenPicker(v=>!v)} style={{ position: 'absolute', right: 4, top: 4 }} disabled={showAll}>
                  🗓️
                </button>
                {openPicker && (
                  <div style={{ position: 'absolute', zIndex: 50, marginTop: 6 }}>
                    <Calendar />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <input
              className="ph-input"
              placeholder="Mã/tên/SDT..."
              value={q}
              onChange={(e)=> {
                const v = e.target.value; setQ(v);
                if (typingTimer) clearTimeout(typingTimer);
                const t = setTimeout(()=>{ fetchList(); }, 300);
                setTypingTimer(t);
              }}
              style={{ width: 260, fontWeight: 700 }}
            />
            <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={showAll} onChange={(e)=> setShowAll(e.target.checked)} />
              <span>Hiển thị tất cả</span>
            </label>
            <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={hideDone} onChange={(e)=> setHideDone(e.target.checked)} />
              <span>Ẩn đơn đã hoàn tất</span>
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
            <span style={{ fontSize: 13, color: '#333', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span role="img" aria-label="chart">📊</span> Thống kê hôm nay:
            </span>
            <span className="ph-badge ph-badge--success">Check-in: {statsToday.checkInsToday}</span>
            <span className="ph-badge ph-badge--warning">Check-out: {statsToday.checkOutsToday}</span>
            <span className="ph-badge ph-badge--neutral">Chưa đến: {statsToday.notArrivedToday}</span>
            {(() => {
              const visible = (items || []).filter(it => hideDone ? (it.status !== 'completed') : true);
              const visibleCompleted = visible.filter(it => it.status === 'completed');
              return !!visibleCompleted.length && (
              <>
                <label style={{ marginLeft: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={visibleCompleted.length > 0 && selectedIds.length === visibleCompleted.length}
                    onChange={(e)=> {
                      if (e.target.checked) setSelectedIds(visibleCompleted.map(x => x.bookingId));
                      else setSelectedIds([]);
                    }}
                  />
                  <span>Chọn tất cả (đơn đã hoàn tất)</span>
                </label>
                {selectedIds.length > 0 && (
                  <button className="ph-btn ph-btn--danger" onClick={bulkDelete}>Xóa {selectedIds.length} đơn</button>
                )}
              </>
              );
            })()}
          </div>
        </div>

        {err && <div style={{ color: '#b42318', marginBottom: 8 }}>{err}</div>}
        {invoice && (
          <div className="checkout-panel" style={{ marginTop: 12 }}>
            <div className="checkout-header">
              <div className="checkout-title">Hóa đơn thanh toán</div>
              <button className="ph-btn" onClick={()=> setInvoice(null)}>Đóng</button>
            </div>
            <div ref={invRef} className="invoice-card">
              <div className="invoice-top">
                <div className="invoice-brand">
                  <div className="invoice-icon">🏨</div>
                  <div>
                    <div className="invoice-title2">Hóa đơn thanh toán</div>
                    <div className="invoice-sub">Mã BK{String(invoice.bookingId).padStart(6,'0')} • {invoice.hotelName}</div>
                  </div>
                </div>
              </div>
              <div className="success-grid invoice-grid">
                <div className="label">Ngày lập</div><div className="value"><span className="invoice-date">{fmtDate(new Date())}</span></div>
                <div className="label">Khách hàng</div><div className="value">{invoice.customerName} ({invoice.phone||'—'})</div>
                <div className="label">Phòng</div><div className="value">{invoice.roomNumber} — {invoice.roomType}</div>
                <div className="label">Nhận phòng</div><div className="value">{fmtDate(invoice.checkIn)}</div>
                <div className="label">Trả phòng</div><div className="value">{fmtDate(invoice.checkOut)}</div>
                <div className="label">Số đêm</div><div className="value">{invoice.nights}</div>
                <div className="label">Đơn giá</div><div className="value">{Number(invoice.unitPrice||0).toLocaleString('vi-VN')} đ/đêm</div>
                <div className="label">Thành tiền</div><div className="value bold">{Number(invoice.total||0).toLocaleString('vi-VN')} đ</div>
                {typeof invoice.paidAmount !== 'undefined' && (
                  <>
                    <div className="label">Đã thanh toán</div><div className="value">{Number(invoice.paidAmount||0).toLocaleString('vi-VN')} đ</div>
                    {Number(invoice.collect||0) > 0 && (
                      <>
                        <div className="label">Cần thu thêm</div><div className="value"><span className="invoice-badge invoice-badge--collect">{Number(invoice.collect||0).toLocaleString('vi-VN')} đ</span></div>
                      </>
                    )}
                    {Number(invoice.refund||0) > 0 && (
                      <>
                        <div className="label">Cần thối lại</div><div className="value"><span className="invoice-badge invoice-badge--refund">{Number(invoice.refund||0).toLocaleString('vi-VN')} đ</span></div>
                      </>
                    )}
                  </>
                )}
              </div>
              {invoice.earlyCheckout && (
                <div className="invoice-note">
                  Lưu ý: Khách trả phòng sớm hơn dự kiến. Vui lòng xử lý {Number(invoice.collect||0) > 0 ? 'thu thêm' : 'hoàn tiền'} theo số liệu trên.
                </div>
              )}
            </div>
            <div className="checkout-actions">
              <button className="checkout-btn" onClick={async ()=>{
                if (!invRef.current) return;
                const canvas = await html2canvas(invRef.current, { scale: 2 });
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pageWidth = pdf.internal.pageSize.getWidth();
                const imgWidth = pageWidth - 20;
                const imgHeight = (canvas.height / canvas.width) * imgWidth;
                pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
                pdf.save(`hoa-don-${invoice.bookingId}.pdf`);
              }}>In hóa đơn</button>
            </div>
          </div>
        )}
        {loading ? (
          <div style={{ color:'#666' }}>Đang tải...</div>
        ) : (
          <div className="ph-table-wrap">
            <table className="ph-table-el">
              <thead>
                <tr>
                  <th></th>
                  <th>Mã</th>
                  <th>Khách hàng</th>
                  <th>SDT</th>
                  <th>Số phòng</th>
                  <th>Loại phòng</th>
                  <th>Ngày nhận</th>
                  <th>Ngày trả</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {((items || []).filter(it => hideDone ? (it.status !== 'completed') : true)).map(it => {
                  const canCheckIn = it.status === 'pending';
                  const canCheckOut = it.status === 'checkedin';
                  const done = it.status === 'checkedout';
                  const completed = it.status === 'completed';
                  const processed = canCheckOut || done || completed;
                  return (
                    <tr key={it.bookingId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={it.status === 'completed' && selectedIds.includes(it.bookingId)}
                          disabled={it.status !== 'completed'}
                          onChange={(e)=> {
                            if (it.status !== 'completed') return;
                            setSelectedIds(prev => e.target.checked ? Array.from(new Set([...prev, it.bookingId])) : prev.filter(x => x !== it.bookingId));
                          }}
                        />
                      </td>
                      <td>{it.code}</td>
                      <td>{it.customerName}</td>
                      <td>{it.phone || '—'}</td>
                      <td>{it.roomNumber || '—'}</td>
                      <td>{it.roomType || '—'}</td>
                      <td>{fmtDate(it.checkIn)}</td>
                      <td>{fmtDate(it.checkOut)}</td>
                      <td>
                        {it.status === 'pending' && <span className="ph-badge ph-badge--neutral">Chưa check-in</span>}
                        {it.status === 'checkedin' && <span className="ph-badge ph-badge--success">Đang sử dụng</span>}
                        {it.status === 'checkedout' && <span className="ph-badge ph-badge--warning">Đang dọn dẹp</span>}
                        {completed && <span className="ph-badge ph-badge--success">Trống</span>}
                      </td>
                      <td>
                        <div className="action-group">
                          {canCheckIn && (
                            <button
                              type="button"
                              className="ph-btn ph-btn--success"
                              onClick={() => doAction(it.bookingId, 'checkin')}
                            >
                              Check-in
                            </button>
                          )}
                          {it.status === 'completed' && (
                            <>
                              <button type="button" className="ph-btn" onClick={() => viewInvoice(it.bookingId)}>Xem</button>
                              <button type="button" className="ph-btn ph-btn--danger" onClick={() => deleteBooking(it.bookingId)}>Xóa</button>
                            </>
                          )}
                        {canCheckOut && (
                          <button type="button" className="ph-btn ph-btn--warning" onClick={() => doAction(it.bookingId, 'checkout')}>Check-out</button>
                        )}
                        {done && (
                          <>
                            <button
                              type="button"
                                className="ph-btn ph-btn--success"
                              onClick={async () => {
                                await doAction(it.bookingId, 'complete');
                                // Hide invoice panel and clear UI-only fields after cleaning is completed
                                setInvoice(null);
                              }}
                            >
                                Hoàn tất
                            </button>
                          </>
                        )}
                        
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
