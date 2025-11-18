import React, { useEffect, useRef, useState } from 'react';
import { authHeaders, getUserEmail } from './auth';
import './HomePage.css';

const DEFAULT_BOT_GREETING = 'Xin chào 👋! Tôi có thể giúp gì cho bạn?';
const UI_COMMAND_SUGGESTIONS = [
  'Mở dịch vụ',
  'Mở ưu đãi',
  'Mở tiện nghi',
  'Mở hồ sơ',
  'Mở lịch sử giao dịch',
];
const MAX_HISTORY = 200;
const LEGACY_MSG_KEY = 'hmsChatMsgs';
const LEGACY_SESSION_KEY = 'hmsChatSessionId';
const ROOM_TYPE_LIST_ROLE = 'room-types';
const ROOM_LIST_ROLE = 'room-list';

function createWelcomeMessages() {
  return [
    { role: 'bot', text: DEFAULT_BOT_GREETING },
    { role: 'suggest', suggestions: UI_COMMAND_SUGGESTIONS, meta: 'ui-commands' },
  ];
}

function normalizeEmailForKey(email) {
  if (!email) return null;
  const trimmed = String(email).trim().toLowerCase();
  if (!trimmed) return null;
  return encodeURIComponent(trimmed);
}

function buildMessageKey(email) {
  const normalized = normalizeEmailForKey(email);
  return normalized ? `${LEGACY_MSG_KEY}:${normalized}` : null;
}

function buildSessionKey(email) {
  const normalized = normalizeEmailForKey(email);
  return normalized ? `${LEGACY_SESSION_KEY}:${normalized}` : null;
}

function loadStoredMessages(email) {
  const key = buildMessageKey(email);
  if (!key) return createWelcomeMessages();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return createWelcomeMessages();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.slice(-MAX_HISTORY);
    }
  } catch { /* ignore parse errors */ }
  return createWelcomeMessages();
}

function createSessionId() {
  return `s_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function ensurePersistedSessionId(email, existing) {
  const fallback = existing || createSessionId();
  if (!email) return fallback;
  const key = buildSessionKey(email);
  if (!key) return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    localStorage.setItem(key, fallback);
    return fallback;
  } catch {
    return fallback;
  }
}

function persistSessionId(email, sessionId) {
  if (!email || !sessionId) return;
  const key = buildSessionKey(email);
  if (!key) return;
  try { localStorage.setItem(key, sessionId); } catch { /* ignore */ }
}

function migrateLegacyStorage(email) {
  if (!email) return { session: null, migratedMessages: false };
  let migratedSession = null;
  let migratedMessages = false;
  const messageKey = buildMessageKey(email);
  const sessionKey = buildSessionKey(email);
  try {
    const legacyMsgs = localStorage.getItem(LEGACY_MSG_KEY);
    if (legacyMsgs) {
      if (messageKey && !localStorage.getItem(messageKey)) {
        localStorage.setItem(messageKey, legacyMsgs);
      }
      localStorage.removeItem(LEGACY_MSG_KEY);
      migratedMessages = true;
    }
    const legacySession = localStorage.getItem(LEGACY_SESSION_KEY);
    if (legacySession) {
      if (sessionKey && !localStorage.getItem(sessionKey)) {
        localStorage.setItem(sessionKey, legacySession);
      }
      localStorage.removeItem(LEGACY_SESSION_KEY);
      migratedSession = legacySession;
    }
  } catch { /* ignore storage errors */ }
  return { session: migratedSession, migratedMessages };
}

function formatCurrencyVND(value) {
  if (value === null || value === undefined) return 'Chưa cập nhật';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${num.toLocaleString('vi-VN')}đ/đêm`;
}

function describeRoomStatus(status, isBooked) {
  const txt = (status || '').toString().toLowerCase();
  if (isBooked) return 'Đang được giữ chỗ';
  if (txt.includes('available') || txt.includes('trong')) return 'Còn trống';
  if (txt.includes('occupied') || txt.includes('booked')) return 'Đang có khách';
  if (txt.includes('maintenance') || txt.includes('bao tri')) return 'Đang bảo trì';
  if (txt.includes('cleaning')) return 'Đang dọn dẹp';
  return status || 'Không xác định';
}

function roomTypeLabel(item) {
  if (!item) return '';
  return item.hotelName ? `${item.name} · ${item.hotelName}` : item.name;
}

/** Simple AI Chatbox Component */
export default function ChatBotAI({ open, onClose }) {
  const [userEmail, setUserEmail] = useState(() => getUserEmail() || null);
  const [messages, setMessages] = useState(() => loadStoredMessages(getUserEmail() || null));
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => ensurePersistedSessionId(getUserEmail() || null, null));
  const [selectingRoomType, setSelectingRoomType] = useState(false);
  const [roomTypesCache, setRoomTypesCache] = useState(null);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const bottomRef = useRef(null);
  const messagesRef = useRef(messages); // track latest messages for async updates

  const storageKey = buildMessageKey(userEmail);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-MAX_HISTORY))); } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    setSessionId(prev => ensurePersistedSessionId(userEmail, prev));
    const nextMessages = loadStoredMessages(userEmail);
    setMessages(nextMessages);
    messagesRef.current = nextMessages;
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) {
      try {
        localStorage.removeItem(LEGACY_MSG_KEY);
        localStorage.removeItem(LEGACY_SESSION_KEY);
      } catch {}
      return;
    }
    const { session: migratedSession, migratedMessages } = migrateLegacyStorage(userEmail);
    if (migratedSession) {
      setSessionId(prev => (prev === migratedSession ? prev : migratedSession));
    }
    if (migratedMessages) {
      const restored = loadStoredMessages(userEmail);
      setMessages(restored);
      messagesRef.current = restored;
    }
  }, [userEmail]);

  useEffect(() => {
    if (userEmail && sessionId) persistSessionId(userEmail, sessionId);
  }, [sessionId, userEmail]);

  useEffect(() => {
    const syncUser = () => {
      const current = getUserEmail() || null;
      setUserEmail(prev => (prev === current ? prev : current));
    };
    syncUser();
    window.addEventListener('focus', syncUser);
    window.addEventListener('storage', syncUser);
    return () => {
      window.removeEventListener('focus', syncUser);
      window.removeEventListener('storage', syncUser);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const current = getUserEmail() || null;
    setUserEmail(prev => (prev === current ? prev : current));
  }, [open]);

  useEffect(()=>{ if(bottomRef.current) bottomRef.current.scrollIntoView({ behavior:'smooth' }); }, [messages, open]);
  useEffect(()=>{ const onEsc = (e)=>{ if(e.key==='Escape' && open) onClose && onClose(); }; document.addEventListener('keydown', onEsc); return ()=> document.removeEventListener('keydown', onEsc); }, [open,onClose]);
  useEffect(() => {
    if (!open) return;
    setMessages(prev => {
      if (prev.some(m => m.role === 'suggest' && m.meta === 'ui-commands')) return prev;
      return [...prev, { role: 'suggest', suggestions: UI_COMMAND_SUGGESTIONS, meta: 'ui-commands' }];
    });
  }, [open]);

  const loadRoomTypes = async () => {
    if (roomTypesCache && Array.isArray(roomTypesCache) && roomTypesCache.length) {
      return roomTypesCache;
    }
    const res = await fetch('/api/room-types');
    if (!res.ok) throw new Error('room-types');
    const list = await res.json();
    const normalized = Array.isArray(list) ? list.filter(it => it && it.name).map(it => ({
      id: it.id,
      name: it.name,
      hotelName: it.hotelName || null,
      basePrice: it.basePrice || it.price || null,
      maxAdults: it.maxAdults || null,
      maxChildren: it.maxChildren || null,
      image: it.image || null,
      description: it.description || null,
    })) : [];
    setRoomTypesCache(normalized);
    return normalized;
  };

  const triggerRoomTypeSelection = async (preferredName) => {
    if (selectingRoomType) return;
    setSelectingRoomType(true);
    setMessages(prev => [...prev, { role: 'bot', text: 'Hãy chọn hạng phòng và khu vực cần đặt.' }]);
    try {
      const list = await loadRoomTypes();
      if (!list.length) {
        setMessages(prev => [...prev, { role: 'bot', text: 'Hiện chưa có hạng phòng nào khả dụng.' }]);
        setSelectingRoomType(false);
        return;
      }
      setMessages(prev => [...prev, { role: ROOM_TYPE_LIST_ROLE, items: list, preferred: preferredName || null }]);
      setSelectingRoomType(false);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Không tải được danh sách hạng phòng. Vui lòng thử lại sau.' }]);
      setSelectingRoomType(false);
    }
  };

  const finalizeRoomBooking = (room) => {
    const detail = {
      name: room.roomTypeName || room.roomTypeLabel || room.roomType,
      roomId: room.id,
      roomNumber: room.roomNumber,
      floor: room.floor,
      price: room.basePrice,
      adults: room.maxAdults,
      children: room.maxChildren,
      hotelName: room.hotelName || null,
    };
    try {
      window.dispatchEvent(new CustomEvent('open-room-booking', { detail }));
      setMessages(prev => [...prev, { role: 'bot', text: `Đang mở đặt phòng cho phòng ${room.roomNumber}.` }]);
    } catch {
      try {
        window.dispatchEvent(new CustomEvent('open-room-type', { detail: { name: detail.name, roomId: detail.roomId } }));
        setMessages(prev => [...prev, { role: 'bot', text: 'Đang mở giao diện đặt phòng, vui lòng kiểm tra.' }]);
      } catch {
        setMessages(prev => [...prev, { role: 'bot', text: 'Không thể mở đặt phòng. Vui lòng chuyển sang tab đặt phòng thủ công.' }]);
      }
    }
  };

  const handleRoomTypeSelect = async (item) => {
    if (!item || roomsLoading) return;
    const label = roomTypeLabel(item);
    setSelectingRoomType(false);
    setRoomsLoading(true);
    setMessages(prev => [...prev, { role: 'user', text: `Chọn ${label}` }]);
    setMessages(prev => [...prev, { role: 'bot', text: 'Đang tải danh sách phòng...' }]);
    try {
      const endpoint = `/api/room-types/${encodeURIComponent(item.name)}/rooms`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('rooms');
      const data = await res.json();
      const info = data && data.roomType ? data.roomType : { name: item.name, hotelName: item.hotelName || null };
      const rooms = data && Array.isArray(data.rooms) ? data.rooms : [];
      const headerText = rooms.length
        ? `Có ${rooms.length} phòng thuộc hạng ${info.name}${info.hotelName ? ` tại ${info.hotelName}` : ''}.`
        : `Hiện chưa có phòng khả dụng cho hạng ${info.name}.`;
      const followUps = [
        { role: 'bot', text: headerText },
        rooms.length ? {
          role: ROOM_LIST_ROLE,
          items: rooms.map(r => ({
            id: r.id,
            roomNumber: r.roomNumber,
            floor: r.floor,
            status: r.status,
            basePrice: r.basePrice,
            maxAdults: r.maxAdults,
            maxChildren: r.maxChildren,
            isBooked: r.isBooked,
            image: r.image || item.image || null,
            hotelName: info.hotelName || item.hotelName || null,
            roomTypeName: info.name,
          })),
        } : null,
      ].filter(Boolean);
      setMessages(prev => [...prev, ...followUps]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'Không tải được danh sách phòng. Vui lòng thử lại sau.' }]);
    } finally {
      setRoomsLoading(false);
    }
  };

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
        { keywords:['mở dịch vụ','open service','open services','mở service','xem dịch vụ','danh sách dịch vụ','dịch vụ khách sạn'], event:'open-services' },
        { keywords:['mở phòng','open rooms','open room list','mở danh sách phòng','xem phòng','danh sách phòng','danh sách phòng trống'], event:'open-rooms' },
        { keywords:['mở tiện nghi','open amenities','open amenity','xem tiện nghi','danh sách tiện nghi'], event:'open-amenities' },
        { keywords:['mở khuyến mãi','mở ưu đãi','open promotions','open promotion','xem ưu đãi','open offers','view offers','danh sách ưu đãi'], event:'open-promotions' },
        { keywords:['mở đánh giá','open reviews','xem đánh giá','xem phản hồi'], event:'open-reviews' },
        { keywords:['mở đặt phòng','đặt phòng ngay','booking now','book now','xem đặt phòng','màn hình đặt phòng'], event:'open-booking' },
        { keywords:['mở hồ sơ','mở profile','open profile','thông tin cá nhân','xem hồ sơ','xem profile'], event:'open-profile' },
        { keywords:['mở thanh toán','xem thanh toán','payment history','mở lịch sử giao dịch','xem lịch sử giao dịch','lịch sử giao dịch','mở lịch sử thanh toán','xem lịch sử thanh toán','xem giao dịch'], event:'open-payments' },
        { keywords:['mở thông báo','xem thông báo','open notifications','xem thông báo mới'], event:'open-notifications' },
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

  const openBooking = (roomName) => {
    triggerRoomTypeSelection(roomName);
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
          if (m.role===ROOM_TYPE_LIST_ROLE) {
            const preferred = (m.preferred || '').toString().toLowerCase();
            const items = Array.isArray(m.items) ? m.items : [];
            return (
              <div key={idx} className="ai-roomtype-grid">
                {items.map((it) => {
                  const isPreferred = preferred && it.name && it.name.toLowerCase() === preferred;
                  const label = roomTypeLabel(it);
                  return (
                    <button
                      key={`${it.id || it.name}`}
                      type="button"
                      className={`ai-roomtype-card${isPreferred ? ' preferred' : ''}`}
                      onClick={() => handleRoomTypeSelect(it)}
                      disabled={roomsLoading}
                    >
                      <div className="ai-roomtype-name">{it.name}</div>
                      {it.hotelName && <div className="ai-roomtype-hotel">{it.hotelName}</div>}
                      <div className="ai-roomtype-meta">
                        {it.maxAdults ? `${it.maxAdults} NL` : '—'} • {it.maxChildren ? `${it.maxChildren} TE` : '—'}
                      </div>
                      <div className="ai-roomtype-price">{formatCurrencyVND(it.basePrice)}</div>
                      {isPreferred && <div className="ai-roomtype-tag">Gợi ý</div>}
                      <span className="sr-only">Chọn {label}</span>
                    </button>
                  );
                })}
              </div>
            );
          }
          if (m.role===ROOM_LIST_ROLE) {
            const rooms = Array.isArray(m.items) ? m.items : [];
            return (
              <div key={idx} className="ai-roomlist-grid">
                {rooms.map((room) => (
                  <div key={room.id || room.roomNumber} className="ai-roomlist-card">
                    <div className="ai-roomlist-header">
                      <div className="ai-roomlist-title">Phòng {room.roomNumber || 'Không xác định'}</div>
                      <div className={`ai-roomlist-status ${room.isBooked ? 'is-booked' : ''}`}>{describeRoomStatus(room.status, room.isBooked)}</div>
                    </div>
                    <div className="ai-roomlist-body">
                      <div className="ai-roomlist-info">
                        {room.hotelName && <div className="ai-roomlist-hotel">{room.hotelName}</div>}
                        <div className="ai-roomlist-meta">Tầng {room.floor || '—'} • {room.maxAdults || 0} NL • {room.maxChildren || 0} TE</div>
                        <div className="ai-roomlist-price">{formatCurrencyVND(room.basePrice)}</div>
                      </div>
                      {room.image ? (
                        <div className="ai-roomlist-thumb"><img src={room.image} alt={room.roomTypeName || 'Phòng'} /></div>
                      ) : null}
                    </div>
                    <div className="ai-roomlist-actions">
                      <button type="button" onClick={() => finalizeRoomBooking(room)}>Đặt phòng ngay</button>
                    </div>
                  </div>
                ))}
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
                    <div className="ai-room-price">{formatCurrencyVND(it.price)}</div>
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
        .ai-roomtype-grid { display:flex; flex-direction:column; gap:8px; }
        .ai-roomtype-card { position:relative; background:#fffaf3; border:1px solid #fbe4c2; border-radius:12px; padding:10px 12px; text-align:left; display:flex; flex-direction:column; gap:4px; cursor:pointer; transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
        .ai-roomtype-card:hover { transform:translateY(-2px); box-shadow:0 6px 16px rgba(245,159,0,0.18); border-color:#f59f00; }
        .ai-roomtype-card:disabled { opacity:0.6; cursor:not-allowed; transform:none; box-shadow:none; }
        .ai-roomtype-card.preferred { border-color:#f59f00; box-shadow:0 0 0 2px rgba(245,159,0,.25); }
        .ai-roomtype-name { font-weight:700; font-size:13px; color:#b45309; }
        .ai-roomtype-hotel { font-size:12px; color:#475569; }
        .ai-roomtype-meta { font-size:11px; color:#64748b; }
        .ai-roomtype-price { font-size:12px; font-weight:700; color:#c2410c; }
        .ai-roomtype-tag { position:absolute; top:8px; right:10px; background:#f59f00; color:#fff; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; }
        .ai-roomlist-grid { display:flex; flex-direction:column; gap:10px; }
        .ai-roomlist-card { border:1px solid #e2e8f0; border-radius:14px; padding:10px 12px; background:#fff; box-shadow:0 4px 12px rgba(148,163,184,0.18); display:flex; flex-direction:column; gap:10px; }
        .ai-roomlist-header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .ai-roomlist-title { font-weight:700; color:#0f172a; }
        .ai-roomlist-status { font-size:11px; padding:4px 8px; border-radius:999px; background:#f1f5f9; color:#0f172a; font-weight:600; }
        .ai-roomlist-status.is-booked { background:#fee2e2; color:#b91c1c; }
        .ai-roomlist-body { display:flex; gap:10px; align-items:flex-start; }
        .ai-roomlist-info { flex:1; display:flex; flex-direction:column; gap:4px; }
        .ai-roomlist-hotel { font-size:12px; color:#475569; font-weight:600; }
        .ai-roomlist-meta { font-size:12px; color:#64748b; }
        .ai-roomlist-price { font-size:13px; font-weight:700; color:#c2410c; }
        .ai-roomlist-thumb { width:80px; height:68px; border-radius:10px; overflow:hidden; background:#f5f5f5; flex-shrink:0; }
        .ai-roomlist-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
        .ai-roomlist-actions { display:flex; justify-content:flex-end; }
        .ai-roomlist-actions button { background:#f59f00; color:#fff; border:none; border-radius:14px; padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; }
        .ai-roomlist-actions button:hover { background:#d97706; }
        .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  @media (max-width:600px){ .ai-chatbox-wrapper { right:12px; bottom:84px; width:300px; } }
      `}</style>
    </div>
  );
}
