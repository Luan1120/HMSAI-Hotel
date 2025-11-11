import React, { useEffect, useState } from 'react';
import { authHeaders } from './auth';
import { mapNotifTitle, formatNotifTime } from './notificationsUtil';
import './Notifications.css';

export default function NotificationsHistory({ onClose }) {
  const [items, setItems] = useState([]);
  const [pendingDeletes, setPendingDeletes] = useState([]); // {id, item, ts, expires}
  const [undoQueue, setUndoQueue] = useState([]); // [{id,label,expires}]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0); // mỗi page 30
  const [done, setDone] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false); // hiển thị hộp xác nhận
  const pageSize = 30;

  const load = async (append=false) => {
    if (loading || done && append) return;
    setLoading(true); setError('');
    try {
      const top = pageSize;
      // Lấy nhiều lần: sử dụng offset cục bộ bằng cách gọi nhiều top và cắt (đơn giản: cứ load tất cả rồi slice)
      // Ở đây: server chưa có offset -> ta load tất cả và quản lý client (đơn giản)
      const res = await fetch(`/api/notifications?top=${(page+1)*pageSize}`, { headers: { ...authHeaders(), 'cache-control':'no-cache' } });
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          // Not logged in or user missing: clear list to avoid showing other user's notifications
          setItems([]);
          setDone(true);
          setLoading(false);
          return;
        }
        const jj = await res.json().catch(()=>({}));
        throw new Error(jj.message || ('HTTP ' + res.status));
      }
      const j = await res.json();
      const list = Array.isArray(j.items)? j.items:[];
      if (list.length <= items.length && append) {
        // Không tăng thêm dữ liệu
        setDone(true);
      }
      setItems(list);
    } catch(e){ setError(e.message||'Lỗi tải'); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ load(false); // load initial
  }, []);

  // React to auth changes: clear or reload accordingly
  useEffect(() => {
    const onAuthChange = () => {
      const raw = (() => { try { return localStorage.getItem('hmsUser'); } catch { return null; } })();
      if (!raw) {
        setItems([]); setPage(0); setDone(true); setError('');
        return;
      }
      // logged in: reload
      setPage(0); setDone(false); load(false);
    };
    window.addEventListener('hms-auth-change', onAuthChange);
    window.addEventListener('storage', onAuthChange);
    return () => { window.removeEventListener('hms-auth-change', onAuthChange); window.removeEventListener('storage', onAuthChange); };
  }, []);

  const loadMore = () => {
    setPage(p=>p+1);
    setTimeout(()=> load(true), 0);
  };

  const markAll = async () => {
    try { await fetch('/api/notifications/read-all', { method:'PUT', headers: { ...authHeaders() } });
      setItems(prev => prev.map(it=> ({ ...it, isRead:true })));
    } catch {}
  };

  // Commit pending deletes permanently (call backend) when closing overlay (onClose invoked) or when item expires without undo.
  const commitDeletes = async (ids) => {
    if(!ids || !ids.length) return;
    ids.forEach(id => {
      fetch(`/api/notifications/${id}`, { method:'DELETE', headers:{ ...authHeaders() } }).catch(()=>{});
    });
  };

  // Override close to commit
  const handleClose = () => {
    const ids = pendingDeletes.map(p=>p.id);
    if(ids.length) commitDeletes(ids);
    onClose && onClose();
  };

  // Timer loop to commit expired soft deletes
  useEffect(()=>{
    if(!pendingDeletes.length) return;
    const tick = setInterval(()=> {
      const now = Date.now();
      setPendingDeletes(prev => {
        const expired = prev.filter(p=> p.expires <= now).map(p=> p.id);
        if(expired.length) commitDeletes(expired);
        return prev.filter(p=> p.expires > now);
      });
      setUndoQueue(q => q.filter(s => s.expires > now));
    }, 500);
    return ()=> clearInterval(tick);
  }, [pendingDeletes.length]);

  return (
    <div className="notifications-overlay" role="dialog" aria-modal="true" onMouseDown={(e)=>{ if(e.target===e.currentTarget) handleClose(); }}>
      <div className="notifications-overlay__panel" onMouseDown={e=>e.stopPropagation()}>
        <button className="notifications-overlay__closeBtn" type="button" aria-label="Đóng" onClick={handleClose}>Đóng</button>
        <h2 className="home-rooms-title" style={{ textAlign:'left', margin:'0 0 8px' }}>Lịch sử thông báo</h2>
        <div className="notifications-history-actions">
          <button type="button" className="ph-btn ph-btn--secondary" disabled={loading} onClick={()=> load(false)}>Tải lại</button>
          <button type="button" className="ph-btn ph-btn--secondary" onClick={markAll}>Đánh dấu tất cả đã đọc</button>
          {/* Nút mở xác nhận xóa tất cả */}
          <button
            type="button"
            className="ph-btn ph-btn--secondary"
            style={{ marginLeft:'auto', background:'#fff5f5', borderColor:'#fecaca', color:'#b42318' }}
            disabled={items.length===0 || bulkDeleting}
            onClick={()=> { if(items.length) setConfirmBulk(true); }}
          >Xóa tất cả</button>
        </div>
        {confirmBulk && (
          <div style={{
            position:'absolute', inset:0, background:'rgba(0,0,0,.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:20,
          }} onMouseDown={e=> { if(e.target===e.currentTarget) setConfirmBulk(false); }}>
            <div style={{ background:'#fff', padding:'22px 24px 20px', borderRadius:18, width:'min(96vw,440px)', boxShadow:'0 18px 48px -10px rgba(0,0,0,.35)', position:'relative', animation:'notifOverlayPanelIn .3s cubic-bezier(.32,.72,.28,.99)' }} onMouseDown={e=>e.stopPropagation()}>
              <h3 style={{ margin:'0 0 12px', fontSize:18, fontWeight:800, color:'#0f172a' }}>Xóa tất cả thông báo?</h3>
              <p style={{ fontSize:13.5, lineHeight:1.5, margin:'0 0 16px', color:'#334155' }}>
                Thao tác này sẽ <strong>xóa vĩnh viễn</strong> toàn bộ thông báo hiện có và không thể hoàn tác.
                Bạn có chắc chắn muốn tiếp tục?
              </p>
              <div style={{ display:'flex', gap:12, justifyContent:'flex-end', flexWrap:'wrap' }}>
                <button type="button" className="ph-btn ph-btn--secondary" disabled={bulkDeleting} onClick={()=> setConfirmBulk(false)}>Hủy</button>
                <button
                  type="button"
                  className="ph-btn"
                  style={{ background:'#dc2626', borderColor:'#dc2626', boxShadow:'0 6px 18px -4px rgba(220,38,38,.45)' }}
                  disabled={bulkDeleting}
                  onClick={async ()=> {
                    setBulkDeleting(true);
                    try {
                      const ids = items.map(i=> i.id);
                      // Gọi xóa tuần tự (có thể tối ưu bằng API bulk nếu backend hỗ trợ sau này)
                      await Promise.all(ids.map(id => fetch(`/api/notifications/${id}`, { method:'DELETE', headers:{ ...authHeaders() } }).catch(()=>null)));
                      setItems([]); setPendingDeletes([]); setUndoQueue([]); setDone(true); setPage(0);
                    } catch {}
                    finally { setBulkDeleting(false); setConfirmBulk(false); }
                  }}
                >{bulkDeleting? 'Đang xóa...' : 'Xóa vĩnh viễn'}</button>
              </div>
            </div>
          </div>
        )}
        <div className="notifications-history-list">
          {loading && items.length===0 && <div style={{ padding:16, fontSize:13 }}>Đang tải...</div>}
          {error && <div style={{ padding:16, fontSize:13, color:'#b42318' }}>{error}</div>}
          {items.length===0 && !loading && !error && <div style={{ padding:16, fontSize:13 }}>Chưa có thông báo.</div>}
          {items.map(it => (
            <NotificationRow
              key={it.id}
              item={it}
              setItems={setItems}
              onSoftDelete={(original)=>{
                const expires = Date.now() + 5000;
                setPendingDeletes(prev => [...prev.filter(p=>p.id!==original.id), { id: original.id, item: original, ts: Date.now(), expires }]);
                setUndoQueue(prev => [...prev.filter(n=> n.id !== original.id), { id: original.id, label: mapNotifTitle(original), expires }]);
              }}
            />
          ))}
        </div>
        <div style={{ marginTop:10, textAlign:'center' }}>
          {!done && items.length >= (page+1)*pageSize && (
            <button className="ph-btn" disabled={loading} onClick={loadMore}>{loading? 'Đang tải...':'Tải thêm'}</button>
          )}
          {done && <div style={{ fontSize:12, color:'#666', marginTop:4 }}>Hết dữ liệu</div>}
        </div>
        {undoQueue.map(sn => (
          <div key={sn.id} style={{ position:'fixed', bottom:18 + (undoQueue.indexOf(sn)*56), left:'50%', transform:'translateX(-50%)', background:'#1e293b', color:'#fff', padding:'10px 16px', borderRadius:12, display:'flex', gap:12, alignItems:'center', fontSize:13, boxShadow:'0 4px 18px -2px rgba(0,0,0,.35)', zIndex:6000, minWidth:280 }}>
            <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Đã xóa: <strong>{sn.label}</strong></span>
            <button
              style={{ background:'transparent', color:'#60a5fa', border:'none', fontWeight:600, cursor:'pointer' }}
              onClick={()=> {
                // restore
                setPendingDeletes(prev => prev.filter(p=> p.id !== sn.id));
                const rec = pendingDeletes.find(p=> p.id === sn.id);
                if(rec){ setItems(prev => [rec.item, ...prev]); }
                setUndoQueue(prev => prev.filter(q => q.id !== sn.id));
              }}
            >Hoàn tác</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationRow({ item, setItems, onSoftDelete }) {
  const [armed, setArmed] = useState(false);
  const [hoverTimer, setHoverTimer] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [deleteReady, setDeleteReady] = useState(false);
  const startRef = React.useRef(0);
  const rowRef = React.useRef(null);
  const delThreshold = 110; // px to trigger delete-ready

  useEffect(()=> () => { if(hoverTimer) clearTimeout(hoverTimer); }, [hoverTimer]);

  const onMouseEnter = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    const t = setTimeout(()=> setArmed(true), 3000);
    setHoverTimer(t);
  };
  const onMouseLeave = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    setHoverTimer(null);
    if (!dragging) { setArmed(false); setOffsetX(0); setDeleteReady(false); }
  };

  const beginDrag = (clientX) => {
    setDragging(true); startRef.current = clientX; setDeleteReady(false);
  };
  const moveDrag = (clientX) => {
    if(!dragging) return;
    let dx = startRef.current - clientX; // drag left -> positive
    if (dx < 0) dx = 0; if (dx > 180) dx = 180;
    setOffsetX(dx);
    setDeleteReady(dx > delThreshold);
  };
  const endDrag = () => {
    if(deleteReady){ doDelete(); }
    else { setOffsetX(0); setDragging(false); if(!armed) setArmed(false); setTimeout(()=> setDragging(false), 10); }
  };

  const doDelete = () => {
    // Soft delete: remove from list and notify parent to queue permanent delete
    setItems(prev => prev.filter(x => x.id !== item.id));
    onSoftDelete && onSoftDelete(item);
  };

  const m = item.message || '';
  const match = /\|\|bookingId=(\d+)/.exec(m);
  const plain = m.replace(/\|\|bookingId=\d+/, '').trim();
  const cls = [
    'notifications-history-item',
    item.isRead ? '' : 'unread',
    armed ? 'hover-armed' : '',
    dragging ? 'dragging' : '',
    deleteReady ? 'delete-ready' : ''
  ].filter(Boolean).join(' ');
  return (
    <div
      ref={rowRef}
      className={cls}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={(e)=> beginDrag(e.clientX)}
      onMouseMove={(e)=> moveDrag(e.clientX)}
      onMouseUp={endDrag}
      onTouchStart={(e)=> beginDrag(e.touches[0].clientX)}
      onTouchMove={(e)=> moveDrag(e.touches[0].clientX)}
      onTouchEnd={endDrag}
      style={{ '--dragX': `${offsetX}px` }}
    >
      <div className="notif-delete-reveal">
        <button type="button" className="notif-delete-btn" onClick={doDelete} aria-label="Xóa thông báo" style={{ gap:0 }}>
          Xóa
        </button>
      </div>
      <div className="notif-row-inner" style={{ transform: armed || dragging || deleteReady ? `translateX(-${Math.max(offsetX, armed?120:0)}px)` : 'translateX(0)' }}>
        <div style={{ fontSize:14, fontWeight:600 }}>{mapNotifTitle(item)}</div>
        <div style={{ fontSize:13, marginTop:2, whiteSpace:'pre-line' }}>{plain}</div>
        {match && (
          <div style={{ marginTop:8 }}>
            <span className="notif-link-booking" onClick={() => {
              try { window.dispatchEvent(new CustomEvent('open-admin-bookings', { detail: { bookingId: Number(match[1]) } })); } catch { window.location.href = '/'; }
            }}>Xem đơn</span>
          </div>
        )}
        <div style={{ fontSize:11, marginTop:4, color:'#667085' }}>{formatNotifTime(item.sentAt)}</div>
      </div>
    </div>
  );
}
