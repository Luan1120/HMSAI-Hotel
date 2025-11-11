import React, { useEffect, useRef, useState } from 'react';
import { authHeaders } from './auth';
import './HomePage.css';

/** Simple AI Chatbox Component */
export default function ChatBotAI({ open, onClose }) {
  const [messages, setMessages] = useState(() => {
    try { const raw = localStorage.getItem('hmsChatMsgs'); if (raw) return JSON.parse(raw); } catch {}
    return [{ role: 'bot', text: 'Xin chào 👋! Tôi có thể giúp gì cho bạn?' }];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(()=>{
    try { const existing = localStorage.getItem('hmsChatSessionId'); if (existing) return existing; } catch {}
    const sid = 's_' + Math.random().toString(36).slice(2,10);
    try { localStorage.setItem('hmsChatSessionId', sid); } catch {}
    return sid;
  });
  const bottomRef = useRef(null);

  useEffect(()=>{ try { localStorage.setItem('hmsChatMsgs', JSON.stringify(messages.slice(-200))); } catch {} }, [messages]);
  useEffect(()=>{ if(bottomRef.current) bottomRef.current.scrollIntoView({ behavior:'smooth' }); }, [messages, open]);
  useEffect(()=>{ const onEsc = (e)=>{ if(e.key==='Escape' && open) onClose && onClose(); }; document.addEventListener('keydown', onEsc); return ()=> document.removeEventListener('keydown', onEsc); }, [open,onClose]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if(!msg || loading) return;
    setInput('');
    setMessages(m => [...m, { role:'user', text: msg }]);

    // Command parsing (client-side UI open triggers)
    // Vietnamese command patterns: "mở dịch vụ", "mở phòng", "mở tiện nghi", "mở đánh giá", "mở khuyến mãi", "mở đặt phòng", etc.
    try {
      const lower = msg.toLowerCase();
      const fire = (name, detail={}) => { try { window.dispatchEvent(new CustomEvent(name,{ detail })); } catch {} };
      const commandMap = [
        { keywords:['mở dịch vụ','open service','open services','mở service'], event:'open-services' },
        { keywords:['mở phòng','open rooms','open room list','mở danh sách phòng'], event:'open-rooms' },
        { keywords:['mở tiện nghi','open amenities','open amenity'], event:'open-amenities' },
        { keywords:['mở khuyến mãi','mở ưu đãi','open promotions','open promotion'], event:'open-promotions' },
        { keywords:['mở đánh giá','open reviews','xem đánh giá'], event:'open-reviews' },
        { keywords:['mở đặt phòng','đặt phòng ngay','booking now','book now'], event:'open-booking' },
        { keywords:['mở hồ sơ','mở profile','open profile','thông tin cá nhân'], event:'open-profile' },
        { keywords:['mở thanh toán','xem thanh toán','payment history'], event:'open-payments' },
        { keywords:['mở thông báo','xem thông báo','open notifications'], event:'open-notifications' },
      ];
      const found = commandMap.find(c => c.keywords.some(k => lower.includes(k)));
      if (found) {
        fire(found.event, { source:'chatbot', original: msg });
        // Provide a local immediate bot acknowledgement without calling API
        setMessages(m => [...m, { role:'bot', text: 'Đang mở giao diện theo yêu cầu của bạn...' }]);
        return; // skip server request for pure UI command
      }
    } catch {/* ignore command parse errors */}

    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders() }, body: JSON.stringify({ message: msg, sessionId }) });
      if(!res.ok) throw new Error('Lỗi phản hồi');
      const j = await res.json();
      const next = [...messagesRef.current, { role:'bot', text: j.reply || '(không có phản hồi)' }];
      if (Array.isArray(j.results) && j.results.length) {
        next.push({ role:'results', items: j.results.slice(0,8) });
      }
      if (Array.isArray(j.suggestions) && j.suggestions.length) {
        next.push({ role:'suggest', suggestions: j.suggestions.slice(0,6) });
      }
      setMessages(next);
    } catch(e){
      setMessages(m => [...m, { role:'bot', text: 'Xin lỗi, hiện chưa phản hồi được.' }]);
    } finally { setLoading(false); }
  };

  // Keep a ref of messages to build new arrays cleanly in async
  const messagesRef = useRef(messages);
  useEffect(()=>{ messagesRef.current = messages; },[messages]);

  const openBooking = (roomName) => {
    // Dispatch a custom event to open room type inline / overlay if available
    try {
      const ev = new CustomEvent('open-room-type', { detail: { name: roomName }});
      window.dispatchEvent(ev);
    } catch {}
  };

  const clickSuggestion = (s) => { send(s); };

  if(!open) return null;
  return (
    <div className="ai-chatbox-wrapper" role="dialog" aria-label="Chat hỗ trợ AI">
      <div className="ai-chatbox-header">
        <div className="ai-chatbox-title">Hỗ trợ AI</div>
        <button className="ai-chatbox-close" aria-label="Đóng" onClick={onClose}>×</button>
      </div>
      <div className="ai-chatbox-body">
        {messages.map((m,idx)=> {
          if (m.role==='suggest') {
            return (
              <div key={idx} className="ai-suggest-row">
                {m.suggestions.map(s => <button key={s} type="button" className="ai-suggest-btn" onClick={()=>clickSuggestion(s)}>{s}</button>)}
              </div>
            );
          }
          if (m.role==='results') {
            return (
              <div key={idx} className="ai-results-grid">
                {m.items.map(it => (
                  <div key={it.id} className="ai-room-card">
                    <div className="ai-room-thumb">{it.image ? <img src={it.image} alt={it.name} /> : <div className="ph-img-fallback" />}</div>
                    <div className="ai-room-name">{it.name}</div>
                    <div className="ai-room-meta">{it.maxAdults} NL • {it.maxChildren} TE{it.rating ? ` • ${it.rating}★` : ''}</div>
                    <div className="ai-room-price">{it.price.toLocaleString('vi-VN')}đ/đêm</div>
                    <button type="button" className="ai-room-book" onClick={()=>openBooking(it.name)}>Đặt phòng</button>
                  </div>
                ))}
              </div>
            );
          }
          return <div key={idx} className={`ai-msg ai-msg-${m.role}`}>{m.text}</div>;
        })}
        {loading && <div className="ai-msg ai-msg-bot loading">Đang gõ...</div>}
        <div ref={bottomRef} />
      </div>
      <form className="ai-chatbox-input" onSubmit={e=>{ e.preventDefault(); send(); }}>
        <input
          placeholder="Nhập tin nhắn..."
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } }}
        />
        <button type="submit" disabled={!input.trim() || loading}>Gửi</button>
      </form>
      <style>{`
  .ai-chatbox-wrapper { position:fixed; bottom:108px; right:120px; width:340px; max-width:90vw; background:#fff; border:1px solid #e2e8f0; border-radius:16px; box-shadow:0 8px 28px -4px rgba(0,0,0,.18),0 4px 12px -2px rgba(0,0,0,.12); display:flex; flex-direction:column; font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; z-index:3000; animation:chatIn .35s cubic-bezier(.4,.2,.2,1); max-height:70vh; min-height:300px; }
        @keyframes chatIn { from { opacity:0; transform:translateY(12px) scale(.96);} to { opacity:1; transform:translateY(0) scale(1);} }
        .ai-chatbox-header { background:#f59f00; color:#fff; padding:10px 14px; border-radius:16px 16px 0 0; display:flex; align-items:center; justify-content:space-between; font-weight:600; letter-spacing:.3px; }
        .ai-chatbox-close { background:transparent; border:none; color:#fff; font-size:20px; line-height:1; cursor:pointer; padding:4px 8px; }
        .ai-chatbox-body { flex:1; padding:10px 12px 12px; overflow-y:auto; background:#fff; display:flex; flex-direction:column; gap:8px; overscroll-behavior:contain; }
        /* Scrollbar tuỳ biến (WebKit) */
        .ai-chatbox-body::-webkit-scrollbar { width:8px; }
        .ai-chatbox-body::-webkit-scrollbar-track { background:transparent; }
        .ai-chatbox-body::-webkit-scrollbar-thumb { background:#dadfe4; border-radius:4px; }
        .ai-chatbox-body::-webkit-scrollbar-thumb:hover { background:#c3c9d0; }
        /* Firefox */
        .ai-chatbox-body { scrollbar-width:thin; scrollbar-color:#c3c9d0 transparent; }
        .ai-msg { max-width:80%; padding:8px 12px; border-radius:14px; font-size:14px; line-height:1.4; word-break:break-word; white-space:pre-wrap; }
        .ai-msg-bot { background:#f1f5f9; color:#111; align-self:flex-start; border:1px solid #e2e8f0; }
        .ai-msg-user { background:#f59f00; color:#fff; align-self:flex-end; box-shadow:0 2px 4px rgba(0,0,0,0.12); }
        .ai-msg-bot.loading { opacity:.7; font-style:italic; }
        .ai-chatbox-input { display:flex; align-items:center; gap:8px; border-top:1px solid #e2e8f0; padding:8px 10px; }
        .ai-chatbox-input input { flex:1; border:1px solid #d0d7e0; border-radius:10px; padding:8px 10px; font-size:14px; }
        .ai-chatbox-input input:focus { outline:none; border-color:#f59f00; box-shadow:0 0 0 2px rgba(245,159,0,.35); }
        .ai-chatbox-input button { background:#f59f00; color:#fff; border:none; padding:8px 14px; border-radius:10px; font-size:14px; cursor:pointer; font-weight:600; }
        .ai-chatbox-input button:disabled { opacity:.5; cursor:not-allowed; }
        .ai-suggest-row { display:flex; flex-wrap:wrap; gap:6px; margin-top:2px; }
        .ai-suggest-btn { background:#fff; border:1px solid #f59f00; color:#b06900; padding:4px 8px; border-radius:20px; font-size:12px; cursor:pointer; transition:.25s; }
        .ai-suggest-btn:hover { background:#f59f00; color:#fff; }
        .ai-results-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:10px; }
        .ai-room-card { background:#fffaf3; border:1px solid #fbe4c2; border-radius:12px; padding:8px; display:flex; flex-direction:column; gap:6px; position:relative; box-shadow:0 2px 4px rgba(0,0,0,.04); }
        .ai-room-thumb { width:100%; aspect-ratio:4/3; background:#f5f5f5; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; }
        .ai-room-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
        .ai-room-name { font-weight:700; font-size:13px; letter-spacing:.2px; }
        .ai-room-meta { font-size:11px; color:#555; }
        .ai-room-price { font-size:12px; font-weight:800; color:#c2410c; }
        .ai-room-book { background:#f59f00; color:#fff; border:none; border-radius:18px; padding:6px 10px; font-size:12px; font-weight:700; cursor:pointer; }
        .ai-room-book:hover { background:#d97706; }
  @media (max-width:600px){ .ai-chatbox-wrapper { right:12px; bottom:84px; width:300px; } }
      `}</style>
    </div>
  );
}
