import React, { useEffect, useState } from 'react';
import { authHeaders } from './auth';
import { mapNotifTitle, formatNotifTime } from './notificationsUtil';
import './Notifications.css';

export default function NotificationsHistory({ onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0); // mỗi page 30
  const [done, setDone] = useState(false);
  const pageSize = 30;

  const load = async (append=false) => {
    if (loading || done && append) return;
    setLoading(true); setError('');
    try {
      const top = pageSize;
      // Lấy nhiều lần: sử dụng offset cục bộ bằng cách gọi nhiều top và cắt (đơn giản: cứ load tất cả rồi slice)
      // Ở đây: server chưa có offset -> ta load tất cả và quản lý client (đơn giản)
      const res = await fetch(`/api/notifications?top=${(page+1)*pageSize}`, { headers: { ...authHeaders(), 'cache-control':'no-cache' } });
      if(!res.ok) throw new Error('HTTP '+res.status);
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

  const loadMore = () => {
    setPage(p=>p+1);
    setTimeout(()=> load(true), 0);
  };

  const markAll = async () => {
    try { await fetch('/api/notifications/read-all', { method:'PUT', headers: { ...authHeaders() } });
      setItems(prev => prev.map(it=> ({ ...it, isRead:true })));
    } catch {}
  };

  return (
    <div className="notifications-overlay" role="dialog" aria-modal="true" onMouseDown={(e)=>{ if(e.target===e.currentTarget && onClose) onClose(); }}>
      <div className="notifications-overlay__panel" onMouseDown={e=>e.stopPropagation()}>
        <button className="notifications-overlay__closeBtn" type="button" aria-label="Đóng" onClick={onClose}>Đóng</button>
        <h2 className="home-rooms-title" style={{ textAlign:'left', margin:'0 0 8px' }}>Lịch sử thông báo</h2>
        <div className="notifications-history-actions">
          <button type="button" className="ph-btn ph-btn--secondary" disabled={loading} onClick={()=> load(false)}>Tải lại</button>
          <button type="button" className="ph-btn ph-btn--secondary" onClick={markAll}>Đánh dấu tất cả đã đọc</button>
        </div>
        <div className="notifications-history-list">
          {loading && items.length===0 && <div style={{ padding:16, fontSize:13 }}>Đang tải...</div>}
          {error && <div style={{ padding:16, fontSize:13, color:'#b42318' }}>{error}</div>}
          {items.length===0 && !loading && !error && <div style={{ padding:16, fontSize:13 }}>Chưa có thông báo.</div>}
          {items.map(it => (
            <div key={it.id} className={`notifications-history-item ${it.isRead? '':'unread'}`}>
              <div style={{ fontSize:14, fontWeight:600 }}>{mapNotifTitle(it)}</div>
              <div style={{ fontSize:13, marginTop:2, whiteSpace:'pre-line' }}>{it.message}</div>
              <div style={{ fontSize:11, marginTop:4, color:'#667085' }}>{formatNotifTime(it.sentAt)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:10, textAlign:'center' }}>
          {!done && items.length >= (page+1)*pageSize && (
            <button className="ph-btn" disabled={loading} onClick={loadMore}>{loading? 'Đang tải...':'Tải thêm'}</button>
          )}
          {done && <div style={{ fontSize:12, color:'#666', marginTop:4 }}>Hết dữ liệu</div>}
        </div>
      </div>
    </div>
  );
}
