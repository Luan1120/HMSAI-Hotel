// Tiện ích dùng chung cho thông báo (tách để tái sử dụng)
export function mapNotifTitle(it){
  if(!it) return 'Thông báo';
  // Prefer server-provided title when available (allows per-user/admin titles)
  if (it.title && String(it.title).trim()) return String(it.title).trim();
  switch(it.type){
    case 'BookingPending': return 'Yêu cầu đặt phòng đã gửi thành công';
    case 'BookingConfirmed': return 'Đặt phòng đã xác nhận';
    case 'BookingCancelled': return 'Đặt phòng đã bị hủy';
    default: return 'Thông báo';
  }
}

export function formatNotifTime(dt){
  try {
    const d = new Date(dt);
    if(isNaN(d)) return '';
    const now = Date.now();
    const diff = (now - d.getTime())/1000;
    if(diff < 60) return 'Vừa xong';
    if(diff < 3600) return Math.floor(diff/60)+ ' phút trước';
    if(diff < 86400) return Math.floor(diff/3600)+ ' giờ trước';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch { return ''; }
}
