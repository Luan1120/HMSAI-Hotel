import React, { useEffect, useMemo, useState } from 'react';
import { authHeaders, getUserRole } from './auth';
import './HomePage.css';

function feedbackStatusBadge(status){
  const v = String(status||'').toLowerCase();
  if(v==='replied') return <span className="status-badge status-green">Đã phản hồi</span>;
  return <span className="status-badge status-yellow">Chưa phản hồi</span>;
}

export default function AdminFeedback({ isModal, onClose }){
  const isAdmin = getUserRole() === 'Admin';
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);
  const [replyDraft, setReplyDraft] = useState({}); // { [reviewId]: text }

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const url = new URL('/api/admin/reviews', window.location.origin);
      if (q) url.searchParams.set('q', q);
      if (status && status !== 'all') url.searchParams.set('status', status);
      url.searchParams.set('_', String(Date.now()));
      const res = await fetch(url.toString(), { headers: authHeaders(), cache: 'no-store' });
      if (!res.ok) throw new Error('Không thể tải danh sách phản hồi');
      const j = await res.json();
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e) {
      setErr(e.message || 'Lỗi tải dữ liệu');
    } finally { setLoading(false); }
  };

  useEffect(()=>{ if (isAdmin) load(); }, []);
  useEffect(()=>{
    if (!isAdmin) return; const id = setTimeout(load, 300); return () => clearTimeout(id);
  }, [q, status]);

  const openDetail = async (id) => {
    try {
      const res = await fetch(`/api/admin/reviews/${id}?_=${Date.now()}`, { headers: authHeaders(), cache: 'no-store' });
      if (!res.ok) throw new Error('Không thể tải chi tiết');
      const j = await res.json();
      setDetail(j);
    } catch (e) { setErr(e.message || 'Lỗi'); }
  };

  const sendReply = async (id) => {
    const body = (replyDraft[id] || '').trim();
    if (!body) return;
    try {
      const res = await fetch(`/api/admin/reviews/${id}/reply`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body })
      });
      if (!res.ok) throw new Error('Gửi phản hồi thất bại');
      setReplyDraft(s => ({ ...s, [id]: '' }));
      load();
    } catch (e) { alert(e.message || 'Lỗi gửi phản hồi'); }
  };

  if (!isAdmin) return <div className="ph-table" style={{ padding: 16, color:'#b42318' }}>Chức năng chỉ dành cho quản trị viên.</div>;

  return (
  <div className="ph-table af-container" style={{ padding: 12 }}>
      <h2 className="home-rooms-title" style={{ textAlign: 'center', marginTop: 0 }}>Quản lý phản hồi khách hàng</h2>

      <div className="reports-toolbar af-toolbar" style={{ marginBottom: 10 }}>
        <div className="reports-field reports-field-group af-field-grow">
          <div className="reports-label">Tìm kiếm khách hàng</div>
          <input className="reports-input" style={{ width: '100%' }} placeholder="Tên, email, phòng, KS..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div className="reports-field reports-field-group">
          <div className="reports-label">Trạng thái</div>
          <select className={`reports-select af-status-select ${status==='replied'?'af-select-green':status==='unreplied'?'af-select-yellow':''}`} value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="unreplied">Chưa phản hồi</option>
            <option value="replied">Đã phản hồi</option>
          </select>
        </div>
        <button className="ph-btn ph-btn--secondary af-refresh" onClick={load}>Làm mới</button>
      </div>

      {loading ? <div style={{ padding: 8, color:'#666' }}>Đang tải...</div> : (
        <table className="ph-table-el af-table">
          <thead>
            <tr>
              <th>Mã phản hồi</th>
              <th>Khách hàng</th>
              <th>Nội dung phản ánh</th>
              <th>Ngày phản ánh</th>
              <th>Nhập phản hồi</th>
              <th>Ngày phản hồi</th>
              <th>Trạng thái</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.reviewId}>
                <td className="ph-td code">{it.code}</td>
                <td className="ph-td">{it.customerName}</td>
                <td className="ph-td">{it.content || '—'}</td>
                <td className="ph-td center">{fmt(it.reviewDate)}</td>
                <td className="ph-td">
                  <textarea
                    className="rv-textarea"
                    rows={2}
                    placeholder="Nhập phản hồi tại đây..."
                    value={replyDraft[it.reviewId] || ''}
                    onChange={e=>setReplyDraft(s => ({ ...s, [it.reviewId]: e.target.value }))}
                    style={{ minWidth: 220 }}
                  />
                  <div style={{ marginTop: 6 }}>
                    <button className="ph-btn" onClick={()=>sendReply(it.reviewId)}>Gửi</button>
                  </div>
                </td>
                <td className="ph-td center">{it.replyDate ? fmt(it.replyDate) : '—'}</td>
                <td className="ph-td center">
                  {feedbackStatusBadge(it.status)}
                </td>
                <td className="ph-td action"><button className="ph-btn ph-btn--secondary" onClick={()=>openDetail(it.reviewId)}>Chi tiết</button></td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr><td className="ph-td" colSpan={8} style={{ textAlign:'center', color:'#666' }}>Không có dữ liệu.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {err && <div style={{ color:'#b42318', marginTop: 8 }}>{err}</div>}

      {detail && (
        <div className="profile-overlay" role="dialog" aria-modal="true" onMouseDown={(e)=>{ if (e.target === e.currentTarget) setDetail(null); }}>
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={()=>setDetail(null)}>← Quay lại</button>
          <div className="profile-modal" style={{ maxWidth: '720px', width: '96%', marginTop: 56 }} onMouseDown={(e)=> e.stopPropagation()}>
            <div className="ph-table" style={{ padding: 12 }}>
              <h3 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Chi tiết phản hồi</h3>
              <div style={{ color:'#444', marginBottom: 8 }}>
                <div><b>{detail.review.customerName}</b> — {detail.review.customerEmail}</div>
                <div>KS: {detail.review.hotelName}, Phòng: {detail.review.roomName || '—'}</div>
                <div>Đặt phòng: BK{String(detail.review.bookingId).padStart(6,'0')} ({fmt(detail.review.checkIn)} – {fmt(detail.review.checkOut)})</div>
                <div>Ngày đánh giá: {fmt(detail.review.createdAt)} — {detail.review.rating.toFixed(1)} sao</div>
                <div style={{ marginTop: 8 }}>Nội dung: {detail.review.comment || '—'}</div>
              </div>
              <div style={{ borderTop: '1px dashed #e5e5e5', margin: '8px 0' }} />
              <div>
                <div className="reports-label" style={{ marginBottom: 6 }}>Lịch sử phản hồi</div>
                {detail.replies.length === 0 ? (
                  <div style={{ color:'#666' }}>Chưa có phản hồi.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {detail.replies.map(r => (
                      <li key={r.id} style={{ margin: '6px 0' }}>
                        <div><b>{r.adminName || 'Admin'}</b> — {fmt(r.createdAt)}</div>
                        <div>{r.body}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .status-badge { font-size:12px; padding:2px 8px 3px; border-radius:999px; border:1px solid transparent; font-weight:500; display:inline-block; }
        .status-green { background:#e6f7ec; color:#086637; border-color:#bfe6ce; }
        .status-yellow { background:#fff4d6; color:#8a6d00; border-color:#f2d291; }
        .af-status-select { transition: background-color .25s, color .25s, border-color .25s; }
        .af-select-green { background:#e6f7ec; color:#086637; border:1px solid #bfe6ce; font-weight:500; }
        .af-select-yellow { background:#fff4d6; color:#8a6d00; border:1px solid #f2d291; font-weight:500; }
        .af-select-green option, .af-select-yellow option { color:#111; }
      `}</style>
    </div>
  );
}

function fmt(d){ try{ const dt = new Date(d); const dd = String(dt.getDate()).padStart(2,'0'); const mm=String(dt.getMonth()+1).padStart(2,'0'); const yy=dt.getFullYear(); return `${dd}/${mm}/${yy}`; }catch{ return '—'; } }