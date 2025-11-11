import React, { useEffect, useMemo, useRef, useState } from 'react';
import './HomePage.css';
import { authHeaders } from './auth';

const STATUS_UI = ['Trống', 'Đang ở', 'Đang dọn dẹp', 'Đang bảo trì'];
const statusDbToUi = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'available') return 'Trống';
  if (v === 'occupied') return 'Đang ở';
  if (v === 'cleaning') return 'Đang dọn dẹp';
  if (v === 'maintenance') return 'Đang bảo trì';
  return 'Trống';
};
const statusUiToDb = (s) => {
  const v = String(s || '').toLowerCase();
  if (v.includes('trống')) return 'Available';
  if (v.includes('đang ở')) return 'Occupied';
  if (v.includes('dọn')) return 'Cleaning';
  if (v.includes('bảo trì')) return 'Maintenance';
  return 'Available';
};

export default function AdminRooms({ isModal, onClose }) {
  const [q, setQ] = useState('');
  const [typeId, setTypeId] = useState('');
  const [hotelFilter, setHotelFilter] = useState('');
  const [items, setItems] = useState([]);
  const [totalRoomCount, setTotalRoomCount] = useState(0); // tổng số phòng (không lọc)
  const [types, setTypes] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRoom, setNewRoom] = useState({
    images: [],
    price: '',
    roomNumber: '',
    status: 'Trống',
    roomTypeId: '',
    floor: '',
    description: ''
  });
  const [newErrors, setNewErrors] = useState({});
  // For per-room image upload
  const roomImageInputRef = useRef(null);
  const [activeRoomForImage, setActiveRoomForImage] = useState(null);
  // Ảnh tạm thời (chưa upload) mỗi phòng: { [roomId]: { file, preview } }
  const [pendingRoomImages, setPendingRoomImages] = useState({});
  // (Đã bỏ chỉnh sửa tiện nghi) – chỉ hiển thị danh sách tiện nghi đã liên kết

  const fetchRooms = async (params = {}) => {
    setLoading(true); setError('');
    try {
      const url = new URL('/api/admin/rooms', window.location.origin);
  if (q) url.searchParams.set('q', q);
  if (typeId) url.searchParams.set('typeId', String(typeId));
  if (hotelFilter) url.searchParams.set('hotelId', String(hotelFilter));
      if (params.q !== undefined) { url.searchParams.set('q', params.q); }
      if (params.typeId !== undefined) { if (params.typeId) url.searchParams.set('typeId', String(params.typeId)); else url.searchParams.delete('typeId'); }
  if (params.hotelId !== undefined) { if (params.hotelId) url.searchParams.set('hotelId', String(params.hotelId)); else url.searchParams.delete('hotelId'); }
  const res = await fetch(url.toString(), { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error('Không tải được danh sách phòng');
      const j = await res.json();
      const list = Array.isArray(j.rooms) ? j.rooms : [];
      const mapped = list.map(r => {
        let imgs = r.images;
        if (typeof imgs === 'string') {
          try { const parsed = JSON.parse(imgs); if (Array.isArray(parsed)) imgs = parsed; } catch { /* ignore */ }
        }
        if (!Array.isArray(imgs)) imgs = [];
        return { ...r, images: imgs, statusVi: statusDbToUi(r.status) };
      });
      setItems(mapped);
      // Cập nhật tổng số phòng (không lọc: gọi một lần không tham số nếu có filter)
      try {
        if (q || typeId || hotelFilter) {
          const allRes = await fetch(new URL('/api/admin/rooms', window.location.origin), { headers: { ...authHeaders() } });
          if (allRes.ok) {
            const allJ = await allRes.json();
            const allList = Array.isArray(allJ.rooms) ? allJ.rooms : [];
            setTotalRoomCount(allList.length);
          }
        } else {
          setTotalRoomCount(mapped.length);
        }
      } catch {}
    } catch (e) {
      setError(e.message || 'Lỗi tải dữ liệu'); setItems([]);
    } finally { setLoading(false); }
  };

  const fetchTypes = async (hotelId) => {
    try {
      const url = new URL('/api/room-types', window.location.origin);
      if (hotelId) url.searchParams.set('hotelId', String(hotelId));
  const res = await fetch(url, { headers: { ...authHeaders() } });
      if (!res.ok) throw new Error();
      const list = await res.json();
      setTypes(Array.isArray(list) ? list : []);
    } catch { setTypes([]); }
  };
  const fetchHotels = async () => {
    try {
  const res = await fetch('/api/hotels');
      if (!res.ok) throw new Error();
      const list = await res.json();
      setHotels(Array.isArray(list) ? list : []);
    } catch { setHotels([]); }
  };

  useEffect(() => { fetchHotels(); fetchTypes(); fetchRooms({ q: '' }); }, []);
  // Không cần load danh mục hoặc modal vì tiện nghi đã xử lý ở backend

  // Live search debounce
  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchRooms({}); }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, typeId, hotelFilter]);

  const updateField = (id, field, value) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
  };

  const handleSave = async (it) => {
    try {
      let imagesToPersist = it.images && it.images.length ? [...it.images] : [];
      // Nếu có ảnh pending thì upload trước rồi thay preview
      if (pendingRoomImages[it.id]) {
        const { file, preview } = pendingRoomImages[it.id];
        const form = new FormData();
        form.append('files', file);
        const uploadRes = await fetch('/api/admin/rooms/upload', { method: 'POST', body: form, headers: { ...authHeaders() } });
        if (!uploadRes.ok) throw new Error('Tải ảnh thất bại');
        const uj = await uploadRes.json();
        const upList = Array.isArray(uj.files) ? uj.files : [];
        if (!upList.length) throw new Error('Không nhận được ảnh');
        const realPath = upList[0];
        if (imagesToPersist.length) {
          if (imagesToPersist[0] === preview) {
            imagesToPersist[0] = realPath;
          } else {
            imagesToPersist = [realPath, ...imagesToPersist];
          }
        } else {
          imagesToPersist = [realPath];
        }
        // cleanup preview object URL & state
        URL.revokeObjectURL(preview);
        setPendingRoomImages(prev => { const cp = { ...prev }; delete cp[it.id]; return cp; });
      }
      // Loại bỏ mọi blob preview còn sót
      imagesToPersist = imagesToPersist.filter(u => typeof u === 'string' && !u.startsWith('blob:'));
      const payload = { roomNumber: it.roomNumber, roomTypeId: it.roomTypeId, status: statusUiToDb(it.statusVi), images: imagesToPersist.length ? imagesToPersist : undefined };
      const res = await fetch(`/api/admin/rooms/${it.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Lưu thất bại');
      await fetchRooms({});
      alert('Đã lưu phòng');
    } catch (e) { alert(e.message || 'Lỗi lưu'); }
  };

  const onSelectRoomImage = (room) => {
    setActiveRoomForImage(room);
    roomImageInputRef.current?.click();
  };

  const onRoomImageChosen = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !activeRoomForImage) return;
    const f = files[0];
    const preview = URL.createObjectURL(f);
    const roomId = activeRoomForImage.id;
    // Lưu ảnh tạm
    setPendingRoomImages(prev => ({ ...prev, [roomId]: { file: f, preview } }));
    // Hiển thị ngay preview ở vị trí ảnh đầu
    setItems(prev => prev.map(it => it.id === roomId ? { ...it, images: it.images && it.images.length ? [preview, ...it.images.slice(1)] : [preview] } : it));
    setActiveRoomForImage(null);
    if (roomImageInputRef.current) roomImageInputRef.current.value = '';
  };

  const handleDelete = async (it) => {
    if (!window.confirm('Xóa phòng này?')) return;
    try {
  const res = await fetch(`/api/admin/rooms/${it.id}`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (!res.ok) throw new Error('Xóa thất bại');
      await fetchRooms({});
    } catch (e) { alert(e.message || 'Lỗi xóa'); }
  };

  const selectedType = useMemo(() => {
    const id = Number(newRoom.roomTypeId || 0);
    return types.find(t => Number(t.id) === id) || null;
  }, [types, newRoom.roomTypeId]);
  const selectedHotel = useMemo(() => {
    const hid = Number(newRoom.hotelId || 0);
    return hotels.find(h => Number(h.id) === hid) || null;
  }, [hotels, newRoom.hotelId]);

  const computedErrors = useMemo(() => {
    const e = {};
    if (!newRoom.roomNumber || !String(newRoom.roomNumber).trim()) e.roomNumber = 'Vui lòng nhập số phòng';
  if (!newRoom.hotelId) e.hotelId = 'Vui lòng chọn khách sạn';
  if (!newRoom.roomTypeId) e.roomTypeId = 'Vui lòng chọn loại phòng';
    if (!newRoom.status) e.status = 'Vui lòng chọn trạng thái';
    if (newRoom.floor !== '' && Number.isNaN(Number(newRoom.floor))) e.floor = 'Tầng không hợp lệ';
    return e;
  }, [newRoom]);
  const isFormValid = useMemo(() => Object.keys(computedErrors).length === 0, [computedErrors]);
  const tooltipText = useMemo(() => {
    if (isFormValid || creating) return '';
    const msgs = [];
    if (computedErrors.roomNumber) msgs.push(computedErrors.roomNumber);
    if (computedErrors.roomTypeId) msgs.push(computedErrors.roomTypeId);
    if (computedErrors.status) msgs.push(computedErrors.status);
    return msgs.join('; ');
  }, [computedErrors, isFormValid, creating]);

  const handleCreate = async () => {
    setNewErrors(computedErrors);
    if (!isFormValid) return;
    setCreating(true);
    try {
      const payload = {
        roomNumber: String(newRoom.roomNumber).trim(),
        roomTypeId: Number(newRoom.roomTypeId),
        status: statusUiToDb(newRoom.status),
        hotelId: newRoom.hotelId ? Number(newRoom.hotelId) : undefined,
        floor: newRoom.floor !== '' ? Number(newRoom.floor) : undefined,
        price: selectedType ? Number(selectedType.basePrice || 0) : undefined,
        description: newRoom.description || undefined,
        images: newRoom.images && newRoom.images.length ? newRoom.images : undefined
      };
  const res = await fetch('/api/admin/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if (!res.ok) {
        let msg = 'Tạo thất bại';
        try { const j = await res.json(); if (j?.message) msg = j.message; } catch { const t = await res.text(); if (t) msg = t; }
        throw new Error(msg);
      }
  setNewRoom({ images:[], price:'', roomNumber: '', status: 'Trống', hotelId:'', roomTypeId: '', floor:'', description:'' });
  setNewErrors({});
  // Reset filters and refresh list to default view
  setQ('');
  setTypeId('');
  setHotelFilter('');
  await fetchTypes();
  await fetchRooms({ q: '', typeId: '', hotelId: '' });
      setCreating(false);
      alert('Tạo phòng thành công');
      setIsCreateOpen(false);
    } catch (e) { alert(e.message || 'Lỗi tạo'); setCreating(false); }
  };

  const fileInputRef = useRef(null);
  const onPickFiles = () => fileInputRef.current?.click();
  const onFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const current = (newRoom.images || []).length;
    const spaceLeft = Math.max(0, 5 - current);
    if (spaceLeft <= 0) { alert('Bạn chỉ có thể chọn tối đa 5 ảnh.'); return; }
    const pick = files.slice(0, spaceLeft);
    const form = new FormData();
    for (const f of pick) form.append('files', f);
    try {
  const res = await fetch('/api/admin/rooms/upload', { method: 'POST', body: form, headers: { ...authHeaders() } });
      if (!res.ok) throw new Error('Tải ảnh thất bại');
      const j = await res.json();
      const list = Array.isArray(j.files) ? j.files : [];
      setNewRoom(r => ({ ...r, images: [...(r.images||[]), ...list] }));
    } catch (err) { alert(err.message || 'Lỗi tải ảnh'); }
  };

  const removeImage = (idx) => {
    setNewRoom(r => ({ ...r, images: (r.images||[]).filter((_, i) => i !== idx) }));
  };

  const statusColorClass = (label) => {
    if (!label) return '';
    if (label.includes('Trống')) return 'room-status-green';
    if (label.includes('dọn')) return 'room-status-yellow';
    if (label.includes('Đang ở') || label.includes('bảo trì')) return 'room-status-red';
    return '';
  };

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
        <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Quản lý phòng khách sạn</h2>
        <form onSubmit={(e)=>e.preventDefault()} className="au-toolbar" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
          <div className="au-group">
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input className="au-input" placeholder="Tìm kiếm phòng..." value={q} onChange={e=>setQ(e.target.value)} />
              {totalRoomCount ? (
                <div className="room-count-badge" title="Tổng số phòng hiện có trong hệ thống">
                  Tổng: {totalRoomCount}
                </div>
              ) : null}
            </div>
          </div>
          <select className="ph-btn ph-btn--secondary" value={hotelFilter} onChange={e=>{ const hid = e.target.value; setHotelFilter(hid); fetchTypes(hid || undefined); }} style={{ height: 36 }}>
            <option value="">Tất cả khách sạn</option>
            {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <select className="ph-btn ph-btn--secondary" value={typeId} onChange={e=>setTypeId(e.target.value)} style={{ height: 36 }}>
            <option value="">Tất cả loại phòng</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="ph-btn au-add-btn" type="button" onClick={()=>{ setIsCreateOpen(true); setNewErrors({}); }}>+ Thêm phòng</button>
        </form>
        {loading ? <div style={{ color:'#666' }}>Đang tải...</div> : error ? <div style={{ color:'#b42318' }}>{error}</div> : (
          <div>
            <div className="ph-tr ph-head" style={{ gridTemplateColumns: '100px 120px 1.1fr 1fr 1fr 1.6fr 1fr 1.1fr' }}>
              <div className="ph-td">Ảnh</div>
              <div className="ph-td">Số phòng</div>
              <div className="ph-td">Loại</div>
              <div className="ph-td">Giá (VNĐ/đêm)</div>
              <div className="ph-td">Sức chứa</div>
              <div className="ph-td">Tiện nghi</div>
              <div className="ph-td">Trạng thái</div>
              <div className="ph-td">Hành động</div>
            </div>
            {items.length === 0 ? (
              <div className="ph-td" style={{ padding: 12, color: '#666' }}>Không có phòng nào.</div>
            ) : items.map(it => (
              <div key={it.id} className="ph-tr" style={{ gridTemplateColumns: '100px 120px 1.1fr 1fr 1fr 1.6fr 1fr 1.1fr' }}>
                <div className="ph-td">
                  <div onClick={()=>onSelectRoomImage(it)} className="admin-room-thumb" title="Bấm để thêm/đổi ảnh">
                    {Array.isArray(it.images) && it.images.length ? (
                      <img src={it.images[0]} alt="thumb" style={pendingRoomImages[it.id] ? { outline: '2px dashed #ff9800' } : undefined} />
                    ) : <span>No image</span>}
                  </div>
                </div>
                <div className="ph-td"><input value={it.roomNumber || ''} onChange={e=>updateField(it.id, 'roomNumber', e.target.value)} /></div>
                <div className="ph-td">
                  <select value={it.roomTypeId || ''} onChange={e=>updateField(it.id, 'roomTypeId', Number(e.target.value))}>
                    <option value="">—</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="ph-td">{Number(it.basePrice || 0).toLocaleString('vi-VN')}</div>
                <div className="ph-td">{(Number(it.maxAdults||0))} khách</div>
                <div className="ph-td" style={{ whiteSpace:'normal', lineHeight:1.3 }}>
                  {it.amenities || '—'}
                </div>
                <div className="ph-td">
                  <select value={it.statusVi} onChange={e=>updateField(it.id, 'statusVi', e.target.value)} className={statusColorClass(it.statusVi)}>
                    {STATUS_UI.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="ph-td">
                  <button className="ph-btn" type="button" onClick={()=>handleSave(it)}>Sửa</button>
                  <button className="ph-btn ph-btn--secondary" type="button" onClick={()=>handleDelete(it)}>Xóa</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Hidden input for per-room image selection */}
        <input ref={roomImageInputRef} type="file" accept="image/*" hidden onChange={onRoomImageChosen} />
      </div>

      {isCreateOpen && (
        <div className="profile-overlay" onMouseDown={(e)=>{ if (e.target===e.currentTarget) setIsCreateOpen(false); }}>
          <div className="profile-modal" onMouseDown={(e)=>e.stopPropagation()} style={{ width: 980, maxWidth:'98%' }}>
            <div className="ph-table" style={{ padding: 16 }}>
              <h3 style={{ marginTop:0, textAlign:'center' }}>Thêm Phòng Mới</h3>
              <div className="room-create-grid">
                <div className="rc-left">
                  <label>Hình ảnh phòng</label>
                  <div className="rc-uploader" onClick={onPickFiles}>
                    {(newRoom.images||[]).length ? (
                      <div className="rc-thumbs">
                        {newRoom.images.map((url, idx) => (
                          <div key={idx} className="rc-thumb">
                            <img src={url} alt="" />
                            <button type="button" className="rc-thumb-del" onClick={(ev)=>{ev.stopPropagation(); removeImage(idx);}}>×</button>
                          </div>
                        ))}
                      </div>
                    ) : <div className="rc-empty">Bấm để chọn ảnh</div>}
                    <input ref={fileInputRef} onChange={onFilesSelected} type="file" accept="image/*" multiple hidden />
                  </div>
                  <div className="rc-hint">{(newRoom.images||[]).length}/5 ảnh</div>
                  <div className="rc-field">
                    <label>Giá cơ bản (VND)</label>
                    <input value={selectedType ? Number(selectedType.basePrice||0).toLocaleString('vi-VN') : ''} placeholder="VD: 850000" disabled />
                  </div>
                  <div className="rc-field">
                    <label>Số phòng</label>
                    <input placeholder="Nhập số phòng" className={newErrors.roomNumber ? 'au-error' : ''} value={newRoom.roomNumber} onChange={e=>{ setNewRoom({...newRoom, roomNumber:e.target.value}); if (newErrors.roomNumber) setNewErrors({...newErrors, roomNumber: undefined}); }} />
                    {newErrors.roomNumber ? <div className="rc-error">{newErrors.roomNumber}</div> : null}
                  </div>
                  <div className="rc-field">
                    <label>Trạng thái</label>
                    <select className={`${newErrors.status ? 'au-error' : ''} ${statusColorClass(newRoom.status)}`} value={newRoom.status} onChange={e=>{ setNewRoom({...newRoom, status:e.target.value}); if (newErrors.status) setNewErrors({...newErrors, status: undefined}); }}>
                      {STATUS_UI.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {newErrors.status ? <div className="rc-error">{newErrors.status}</div> : null}
                  </div>
                </div>
                <div className="rc-right">
                  <div className="rc-field">
                    <label>Khách sạn</label>
                    <select className={newErrors.hotelId ? 'au-error' : ''} value={newRoom.hotelId || ''} onChange={e=>{
                      const hid = e.target.value ? Number(e.target.value) : '';
                      setNewRoom({ ...newRoom, hotelId: hid, roomTypeId: '' });
                      fetchTypes(hid || undefined);
                      if (newErrors.hotelId) setNewErrors({ ...newErrors, hotelId: undefined });
                    }}>
                      <option value="">-- Chọn khách sạn --</option>
                      {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                    {newErrors.hotelId ? <div className="rc-error">{newErrors.hotelId}</div> : null}
                  </div>
                  <div className="rc-field">
                    <label>Loại phòng</label>
                    <select className={newErrors.roomTypeId ? 'au-error' : ''} value={newRoom.roomTypeId} onChange={e=>{ const val = e.target.value; setNewRoom({...newRoom, roomTypeId: val ? Number(val) : ''}); if (newErrors.roomTypeId) setNewErrors({...newErrors, roomTypeId: undefined}); }}>
                      <option value="">-- Chọn loại phòng --</option>
                      {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {newErrors.roomTypeId ? <div className="rc-error">{newErrors.roomTypeId}</div> : null}
                  </div>
                  <div className="rc-field">
                    <label>Tầng</label>
                    <input placeholder="Nhập tầng" value={newRoom.floor} onChange={e=>{ setNewRoom({...newRoom, floor: e.target.value}); if (newErrors.floor) setNewErrors({...newErrors, floor: undefined}); }} className={newErrors.floor ? 'au-error' : ''} />
                    {newErrors.floor ? <div className="rc-error">{newErrors.floor}</div> : null}
                  </div>
                  <div className="rc-field">
                    <label>Mô tả</label>
                    <textarea rows={3} placeholder="Mô tả chi tiết về phòng..." value={newRoom.description} onChange={e=>setNewRoom({...newRoom, description:e.target.value})} />
                  </div>
                  <div className="rc-field">
                    <label>Số người lớn tối đa</label>
                    <input value={selectedType ? selectedType.maxAdults : ''} disabled />
                  </div>
                  <div className="rc-field">
                    <label>Số trẻ em tối đa</label>
                    <input value={selectedType ? selectedType.maxChildren : ''} disabled />
                  </div>
                </div>
              </div>
              <div style={{ marginTop:12, display:'flex', gap:8, justifyContent:'center' }}>
                <span title={(!isFormValid && !creating) ? tooltipText : ''} style={{ display:'inline-block' }}>
                  <button className="ph-btn" onClick={handleCreate} disabled={creating || !isFormValid} type="button">{creating ? 'Đang tạo...' : 'Thêm phòng'}</button>
                </span>
                <button className="ph-btn ph-btn--secondary" onClick={()=>setIsCreateOpen(false)} type="button">Hủy</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Không có modal chỉnh sửa tiện nghi */}
    </div>
  );
}
