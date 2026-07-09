const TOKEN_KEY = 'letableau_token';
const USER_KEY = 'letableau_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function requireSession() {
  if (!getToken()) {
    window.location.href = '/index.html';
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { /* pas de corps JSON */ }

  if (res.status === 401) {
    clearSession();
    window.location.href = '/index.html';
    throw new Error('Session expirée.');
  }

  if (!res.ok) {
    throw new Error(data?.error || `Erreur ${res.status}`);
  }

  return data;
}

export function initial(pseudo) {
  return (pseudo || '?').trim().charAt(0).toUpperCase();
}

export function avatarHTML(user, size = 38) {
  if (user?.avatarUrl) {
    return `<img class="avatar" style="width:${size}px;height:${size}px" src="${escapeAttr(user.avatarUrl)}" alt="${escapeAttr(user.pseudo || '')}">`;
  }
  return `<div class="avatar" style="width:${size}px;height:${size}px">${initial(user?.pseudo)}</div>`;
}

export function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function escapeAttr(str) {
  return escapeHTML(str);
}
