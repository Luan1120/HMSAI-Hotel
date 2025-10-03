import React, { useEffect, useRef, useState } from 'react';
import { authHeaders, getUserRole } from './auth';
import NotificationsHistory from './NotificationsHistory';
import { mapNotifTitle as mapTitle, formatNotifTime as formatTime } from './notificationsUtil';

// Component Chuông thông báo + Dropdown
export default function NotificationsBell(){
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unread, setUnread] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const pollRef = useRef(null);
  const dropdownRef = useRef(null);
  const prevUnreadRef = useRef(0);

  // Poll số lượng chưa đọc
  useEffect(()=>{
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch('/api/notifications/unread-count', { headers: { ...authHeaders() } });
        if(!res.ok) throw new Error('HTTP '+res.status);
        const j = await res.json();
        if(!stopped) {
          const newCount = j.count || 0;
            // trigger pulse when increasing
          if(newCount > prevUnreadRef.current) {
            setPulse(true);
            setTimeout(()=> setPulse(false), 1200);
          }
          prevUnreadRef.current = newCount;
          setUnread(newCount);
        }
      } catch {}
      if(!stopped) pollRef.current = setTimeout(poll, 10000); // 10s
    };
    poll();
    return ()=>{ stopped = true; if(pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  // Tải danh sách khi mở
  useEffect(()=>{
    if(!open) return; let active = true;
    setLoading(true); setError('');
    fetch('/api/notifications?top=20', { headers: { ...authHeaders(), 'cache-control':'no-cache' } })
      .then(async res => { if(!res.ok){ const j = await res.json().catch(()=>({})); throw new Error(j.message||'Lỗi tải thông báo'); } return res.json(); })
      .then(j => { if(active) setItems(Array.isArray(j.items)? j.items:[]); })
      .catch(e => { if(active) setError(e.message||'Không tải được'); })
      .finally(()=>{ if(active) setLoading(false); });
    return ()=>{ active=false; };
  }, [open]);

  // Đóng khi click ngoài / Esc
  useEffect(()=>{
    const onDoc = (e)=>{ if(dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false); };
    const onEsc = (e)=>{ if(e.key==='Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onEsc);
    return ()=>{ document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, []);

  const markOne = async (id) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method:'PUT', headers: { ...authHeaders() } });
      setItems(prev => prev.map(it => it.id===id ? { ...it, isRead:true }: it));
      setUnread(u => Math.max(0, u-1));
    } catch {}
  };
  const markAll = async () => {
    setMarkingAll(true);
    try { await fetch('/api/notifications/read-all', { method:'PUT', headers: { ...authHeaders() } });
      setItems(prev => prev.map(it => ({ ...it, isRead:true })));
      setUnread(0);
    } catch {} finally { setMarkingAll(false); }
  };

  const role = getUserRole();

  return (
    <div className="notif-bell-wrapper" ref={dropdownRef} style={{ position:'relative' }}>
      <button type="button" className={`home-header-icon notif-bell-btn ${open? 'is-open':''}`} onClick={()=> setOpen(o=>!o)} aria-label="Thông báo">
        <img src="/icon-bell.png" alt="Bell" className="home-header-icon-img" />
  {unread>0 && <span className={`notif-badge ${pulse? 'notif-badge--pulse':''}`} aria-label={`${unread} thông báo mới`}></span>}
      </button>
      {open && (
        <div className="notif-dropdown" role="menu" style={{ position:'absolute', top:'100%', right:0, marginTop:6, width:340, maxWidth:'90vw', background:'#fff', border:'1px solid #ddd', borderRadius:12, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', zIndex:4000, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'10px 12px', borderBottom:'1px solid #eee', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontWeight:700, fontSize:15 }}>Thông báo</div>
            <button type="button" disabled={unread===0 || markingAll} onClick={markAll} style={{ background:'none', border:'none', color: unread===0 ? '#999':'#0a67c1', cursor: unread===0?'default':'pointer', fontSize:12 }}>
              {markingAll? 'Đang cập nhật...':'Đánh dấu tất cả đã đọc'}
            </button>
          </div>
          <div style={{ maxHeight: 400, overflow:'auto', WebkitOverflowScrolling:'touch' }}>
            {loading && <div style={{ padding:16, fontSize:13, color:'#666' }}>Đang tải...</div>}
            {error && <div style={{ padding:16, fontSize:13, color:'#b42318' }}>{error}</div>}
            {!loading && !error && items.length===0 && <div style={{ padding:16, fontSize:13, color:'#666' }}>Chưa có thông báo.</div>}
            {items.map(it => (
              <div
                key={it.id}
                className={`notif-item ${it.isRead? 'is-read':''}`}
                style={{ padding:'10px 12px 12px', paddingRight:16, borderTop:'1px solid #f1f1f4', background: it.isRead? '#fff':'#f5f9ff', position:'relative', cursor:'pointer' }}
                onClick={()=> { if(!it.isRead) markOne(it.id); }}
                role="button"
                tabIndex={0}
                onKeyDown={e=> { if(e.key==='Enter' || e.key===' ') { e.preventDefault(); if(!it.isRead) markOne(it.id); } }}
              >
                <div className="notif-item-head" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <div className="notif-item-title" style={{ fontSize:14, fontWeight:600, color:'#0a2540', marginBottom:2, lineHeight:1.2 }}>{mapTitle(it)}</div>
                  {!it.isRead && <img src="/icon-speaker.png" alt="Unread" className="notif-dot-top" loading="lazy" />}
                </div>
                <div style={{ fontSize:13, lineHeight:1.4, color:'#333', whiteSpace:'pre-line', wordBreak:'break-word' }}>{it.message}</div>
                <div style={{ fontSize:11, marginTop:6, color:'#667085' }}>{formatTime(it.sentAt)}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:'1px solid #eee', padding:8, textAlign:'center' }}>
            <button type="button" onClick={()=> { setOpen(false); setShowHistory(true); }} style={{ background:'none', border:'none', color:'#0a67c1', fontSize:12, cursor:'pointer' }}>Xem tất cả</button>
          </div>
        </div>
      )}
      {showHistory && <NotificationsHistory onClose={()=> setShowHistory(false)} />}
    </div>
  );
}
