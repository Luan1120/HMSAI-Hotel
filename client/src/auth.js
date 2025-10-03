export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('hmsUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getUserEmail() {
  const u = getCurrentUser();
  return (u && u.email) ? u.email : null;
}

export function getUserRole() {
  const u = getCurrentUser();
  const raw = (u && u.role) ? u.role : 'Customer';
  const ascii = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (ascii === 'admin' || ascii.includes('quan tri')) return 'Admin';
  if (ascii === 'staff' || ascii.includes('nhan vien') || ascii.includes('nhan-vien')) return 'Staff';
  return 'Customer';
}

export function hasRole(roles) {
  const role = getUserRole();
  return Array.isArray(roles) ? roles.includes(role) : false;
}

export function authHeaders() {
  const email = getUserEmail();
  const headers = {};
  if (email) headers['x-user-email'] = email;
  return headers;
}

// Helper: kiểm tra đã đăng nhập chưa
export function isLoggedIn() {
  return !!getCurrentUser();
}
