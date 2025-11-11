import React, { useEffect, useState } from 'react';
import './HomePage.css';
import { authHeaders, getUserRole } from './auth';

export default function StaffSupport({ isModal, onClose }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const role = getUserRole();
  const isStaff = role === 'Staff';

  useEffect(() => {
    if (!isStaff) return;
    let alive = true;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch('/api/staff/support/tickets?_=' + Date.now(), { headers: authHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        if (alive) setList(Array.isArray(j.items) ? j.items : []);
      } catch (e) { if (alive) setError(e.message || 'Lỗi tải danh sách'); }
      finally { if (alive) setLoading(false); }
    };
    load();
    return () => { alive = false; };
  }, [isStaff]);

  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    let alive = true;
    const load = async () => {
      setDetail(null);
      try {
        const res = await fetch(`/api/staff/support/tickets/${activeId}?_=${Date.now()}`, { headers: authHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        if (alive) setDetail(j);
      } catch (e) { if (alive) setDetail({ error: e.message || 'Lỗi tải chi tiết' }); }
    };
    load();
    return () => { alive = false; };
  }, [activeId]);

  const sendReply = async () => {
    if (!activeId || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/staff/support/tickets/${activeId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ body: reply.trim() })
      });
      if (!res.ok) throw new Error('Không gửi được phản hồi');
      setReply('');
      // reload detail
      const r2 = await fetch(`/api/staff/support/tickets/${activeId}?_=${Date.now()}`, { headers: authHeaders() });
      if (r2.ok) setDetail(await r2.json());
    } catch (e) {
      alert(e.message || 'Lỗi gửi phản hồi');
    } finally {
      setSending(false);
    }
  };

  const resolveTicket = async () => {
    if (!activeId) return;
    if (!window.confirm('Đóng ticket này?')) return;
    try {
      const res = await fetch(`/api/staff/support/tickets/${activeId}/resolve`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) throw new Error('Lỗi đóng ticket');
      // refresh list and detail
      setList(prev => prev.map(x => x.id === activeId ? { ...x, status: 'Closed' } : x));
      setDetail(d => d ? { ...d, ticket: { ...d.ticket, status: 'Closed' } } : d);
    } catch (e) {
      alert(e.message || 'Không thể đóng ticket');
    }
  };

  if (!isStaff) {
    return (
      <div className="ph-table" style={{ padding: 16 }}>
        <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Hỗ trợ khách hàng</h2>
        <div>Chức năng này dành cho Nhân viên.</div>
      </div>
    );
  }

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
        <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Hỗ trợ khách hàng (Nhân viên)</h2>
        {loading ? <div style={{ color:'#666' }}>Đang tải danh sách...</div> : error ? <div style={{ color:'#b42318' }}>{error}</div> : (
          <div style={{ display:'grid', gridTemplateColumns:'320px 1fr', gap:16 }}>
            <div style={{ border:'1px solid #eee', borderRadius:8, overflow:'hidden' }}>
              <div style={{ padding:8, background:'#f7f7fb', fontWeight:700 }}>Danh sách yêu cầu</div>
              <div style={{ maxHeight: 520, overflow:'auto' }}>
                {list.length === 0 ? (
                  <div style={{ padding:12, color:'#888' }}>Chưa có yêu cầu nào.</div>
                ) : list.map(it => (
                  <button key={it.id} className={`ph-list-item ${activeId===it.id ? 'is-active' : ''}`} onClick={()=> setActiveId(it.id)}>
                    <div className="ph-list-title">{it.subject}</div>
                    <div className="ph-list-sub">{it.customerName || it.customerEmail || 'Khách'} • {it.status}</div>
                    <div className={`ph-badge ${it.status==='Closed' ? 'ph-badge--gray' : it.status==='Open' ? 'ph-badge--blue' : 'ph-badge--green'}`}>{it.status}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ border:'1px solid #eee', borderRadius:8, overflow:'hidden' }}>
              <div style={{ padding:8, background:'#f7f7fb', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontWeight:700 }}>{detail?.ticket?.subject || (activeId ? `Ticket #${activeId}` : 'Chi tiết')}</div>
                {!!activeId && detail?.ticket?.status !== 'Closed' && (
                  <button className="ph-btn ph-btn--secondary" onClick={resolveTicket}>Đóng ticket</button>
                )}
              </div>
              <div style={{ padding: 12, minHeight: 360 }}>
                {!activeId ? (
                  <div style={{ color:'#666' }}>Chọn một ticket để xem chi tiết.</div>
                ) : !detail ? (
                  <div style={{ color:'#666' }}>Đang tải chi tiết...</div>
                ) : detail.error ? (
                  <div style={{ color:'#b42318' }}>{detail.error}</div>
                ) : (
                  <>
                    <div style={{ marginBottom: 8, color:'#444' }}>
                      Khách hàng: <b>{detail.ticket.customer?.name || detail.ticket.customer?.email || '—'}</b>
                    </div>
                    <div className="ph-thread">
                      {detail.messages?.map(m => (
                        <div key={m.id} className={`ph-msg ${m.role==='Staff' ? 'ph-msg--staff' : 'ph-msg--cust'}`}>
                          <div className="ph-msg-meta">{m.role === 'Staff' ? 'Nhân viên' : 'Khách'} • {new Date(m.createdAt).toLocaleString('vi-VN')}</div>
                          <div className="ph-msg-body">{m.body}</div>
                        </div>
                      ))}
                    </div>
                    {detail.ticket.status !== 'Closed' && (
                      <div style={{ marginTop: 12 }}>
                        <textarea className="rv-textarea" rows={4} placeholder="Nhập nội dung phản hồi..." value={reply} onChange={(e)=>setReply(e.target.value)} />
                        <div style={{ display:'flex', gap:8, marginTop:6 }}>
                          <button className="ph-btn" disabled={sending || !reply.trim()} onClick={sendReply}>{sending ? 'Đang gửi...' : 'Gửi phản hồi'}</button>
                          <button className="ph-btn ph-btn--secondary" onClick={()=> setReply('')}>Xóa</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
