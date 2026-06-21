/* ── CONFIG ── */
const API = window.location.origin + '/api';
const JWT_KEY = 'sm_token', USER_KEY = 'sm_user';

/* ── AUTH ── */
const Auth = {
  token: () => localStorage.getItem(JWT_KEY),
  user:  () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  save:  (token, user) => { localStorage.setItem(JWT_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); },
  clear: () => { localStorage.removeItem(JWT_KEY); localStorage.removeItem(USER_KEY); },
  logout: () => { Auth.clear(); location.href = '/auth.html'; },
  guard: () => { if (!Auth.token()) { location.href = '/auth.html'; return false; } return true; },
  guardAdmin: () => {
    const u = Auth.user();
    if (!u || !['admin','moderator'].includes(u.role)) { location.href = '/dashboard.html'; return false; }
    return true;
  }
};

/* ── API FETCH ── */
const api = {
  async req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (Auth.token()) opts.headers['Authorization'] = 'Bearer ' + Auth.token();
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(API + path, opts);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  },
  get:    (p)    => api.req('GET', p),
  post:   (p, b) => api.req('POST', p, b),
  put:    (p, b) => api.req('PUT', p, b),
  delete: (p)    => api.req('DELETE', p),
};

/* ── TOAST ── */
const Toast = {
  _c: null,
  _get() {
    if (!this._c) { this._c = document.createElement('div'); this._c.id = 'toast-root'; document.body.appendChild(this._c); }
    return this._c;
  },
  show(msg, type = 'info', dur = 3500) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
    this._get().appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(80px)'; el.style.transition='.3s'; setTimeout(()=>el.remove(),300); }, dur);
  },
  success: m => Toast.show(m, 'success'),
  error:   m => Toast.show(m, 'error'),
  info:    m => Toast.show(m, 'info'),
  warn:    m => Toast.show(m, 'warning'),
};

/* ── MODAL ── */
function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('show'); }
// Click overlay to close
document.addEventListener('click', e => {
  if (e.target.classList.contains('overlay')) e.target.classList.remove('show');
});

/* ── HELPERS ── */
function initials(name = '') {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(-2).join('').toUpperCase();
}
function avatarEl(user, size = 40) {
  const el = document.createElement('div');
  el.className = 'av';
  el.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.round(size*.38)}px`;
  if (user?.avatar) { const img = document.createElement('img'); img.src = user.avatar; el.appendChild(img); }
  else el.textContent = initials(user?.full_name);
  return el;
}
function fmt(d) { if (!d) return ''; return new Date(d).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }); }
function fmtTime(d) { if (!d) return ''; const dt = new Date(d); return dt.toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'Vừa xong'; if (s < 3600) return `${Math.floor(s/60)} phút trước`;
  if (s < 86400) return `${Math.floor(s/3600)} giờ trước`; return `${Math.floor(s/86400)} ngày trước`;
}
function starsHtml(r, max = 5) {
  r = parseFloat(r) || 0;
  return `<span class="stars">${'★'.repeat(Math.round(r))}${'☆'.repeat(max - Math.round(r))}</span> <small style="color:rgba(255,255,255,.4);font-size:12px">${r.toFixed(1)}</small>`;
}
function pairStatusBadge(status) {
  const m = { pending:'⏳ Chờ xác nhận', active:'✅ Đang ghép cặp', completed:'🎓 Hoàn thành', rejected:'❌ Từ chối', cancelled:'🚫 Đã hủy' };
  return `<span class="pair-status pair-${status}">${m[status] || status}</span>`;
}
function roleBadge(role) {
  const m = { admin:'🛡️ Admin', moderator:'🔰 Mod', student:'🎓 Student', volunteer:'🙋 TNV' };
  const cls = { admin:'tag-red', moderator:'tag-yellow', student:'tag-blue', volunteer:'tag-purple' };
  return `<span class="tag ${cls[role]||'tag-blue'}">${m[role]||role}</span>`;
}
function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;'); }

/* ── SIDEBAR RENDER ── */
async function renderSidebar(active) {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  const user = Auth.user();
  if (!user) return;
  let me; try { me = await api.get('/auth/me'); } catch { me = user; }
  const isAdmin = ['admin','moderator'].includes(user.role);
  const navLinks = [
    { href:'/dashboard.html',     icon:'⊞',  label:'Tổng quan',     key:'dashboard' },
    { href:'/matches.html',       icon:'🔗',  label:'Ghép cặp',      key:'matches' },
    { href:'/pairs.html',         icon:'🤝',  label:'Cặp của tôi',   key:'pairs', badge: me?.pairs_pending || 0 },
    { href:'/chat.html',          icon:'💬',  label:'Tin nhắn',      key:'chat', badge: me?.unread_msgs || 0 },
    { href:'/leaderboard.html',   icon:'🏆',  label:'Bảng xếp hạng', key:'leaderboard' },
    { href:'/notifications.html', icon:'🔔',  label:'Thông báo',     key:'notifications', badge: me?.unread_notifs || 0 },
    { href:'/profile.html',       icon:'👤',  label:'Hồ sơ của tôi', key:'profile' },
  ];
  const adminLinks = [
    { href:'/admin/index.html',         icon:'📊', label:'Dashboard Admin', key:'admin-dash' },
    { href:'/admin/users.html',         icon:'👥', label:'Quản lý User',    key:'admin-users' },
    { href:'/admin/pairs.html',         icon:'🤝', label:'Quản lý Cặp đôi', key:'admin-pairs' },
    { href:'/admin/reports.html',       icon:'🚩', label:'Báo cáo vi phạm', key:'admin-reports' },
    { href:'/admin/announcements.html', icon:'📢', label:'Thông báo HT',    key:'admin-ann' },
    { href:'/admin/logs.html',          icon:'📋', label:'Nhật ký',         key:'admin-logs' },
  ];

  sb.innerHTML = `
    <a href="/dashboard.html" class="sidebar-logo">
      <div class="logo-mark">📚</div>
      <div><div class="logo-text">StudyMatch</div><span class="logo-sub">v2.0</span></div>
    </a>
    <nav class="sidebar-nav">
      <div class="nav-section">Menu</div>
      ${navLinks.map(l => `
        <a href="${l.href}" class="nav-link ${active===l.key?'active':''}" data-key="${l.key}">
          <span class="nav-icon">${l.icon}</span>${l.label}
          ${l.badge ? `<span class="nav-badge">${l.badge}</span>` : ''}
        </a>`).join('')}
      ${isAdmin ? `
        <div class="nav-section" style="margin-top:8px">Quản trị</div>
        ${adminLinks.map(l=>`
          <a href="${l.href}" class="nav-link ${active===l.key?'active':''}">
            <span class="nav-icon">${l.icon}</span>${l.label}
          </a>`).join('')}
      ` : ''}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="av" style="width:36px;height:36px;font-size:13px;border-radius:50%">${initials(me?.full_name)}</div>
        <div>
          <div class="uname">${me?.full_name || user.full_name}</div>
          <div class="urole">${me?.role === 'admin' ? '🛡️ Admin' : me?.is_volunteer ? '🙋 Tình nguyện viên' : '🎓 Sinh viên'}</div>
        </div>
        <button class="logout-btn" onclick="Auth.logout()" title="Đăng xuất">⎋</button>
      </div>
    </div>`;
}

/* ── ANNOUNCEMENTS ── */
async function loadAnnouncements(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const list = await api.get('/announcements');
    el.innerHTML = list.slice(0,3).map(a => `
      <div class="ann-banner ann-${a.type||'info'}">
        <span>${a.type==='success'?'✅':a.type==='warning'?'⚠️':a.type==='error'?'❌':'📢'}</span>
        <div><strong>${escHtml(a.title)}</strong><div style="font-size:12px;margin-top:3px;opacity:.8">${escHtml(a.body)}</div></div>
      </div>`).join('');
  } catch {}
}

/* ── SOCKET SINGLETON ── */
let _socket = null;
function getSocket() {
  if (_socket) return _socket;
  if (!window.io) return null;
  _socket = io({ auth: { token: Auth.token() } });
  _socket.on('notification', notif => {
    Toast.info(notif.title);
    // Update badge
    const b = document.querySelector('[data-key="notifications"] .nav-badge');
    if (b) b.textContent = (+b.textContent || 0) + 1;
  });
  _socket.on('announcement', ann => Toast.warn(`📢 ${ann.title}`));
  return _socket;
}
