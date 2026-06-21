const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4 } = require('uuid');
const db = require('../db/database');
const { auth, adminOnly, superAdmin } = require('../middleware/auth');
const safe = u => { if (!u) return {}; const { password, ...r } = u; return r; };

// Middleware: tất cả routes cần login + admin/mod
router.use(auth, adminOnly);

// ── STATS DASHBOARD ──
router.get('/stats', (req, res) => {
  const users = db.users.all().filter(u => !['admin', 'moderator'].includes(u.role));
  const pairs = db.pairs.all();
  const today = new Date().toDateString();
  res.json({
    total_users: users.length,
    active_users: users.filter(u => !u.is_banned).length,
    banned_users: users.filter(u => u.is_banned).length,
    volunteers: users.filter(u => u.is_volunteer).length,
    total_pairs: pairs.length,
    active_pairs: pairs.filter(p => p.status === 'active').length,
    completed_pairs: pairs.filter(p => p.status === 'completed').length,
    pending_reports: db.reports.find({ status: 'pending' }).length,
    total_messages: db.messages.count(),
    new_today: db.logs.all().filter(l => new Date(l.created_at).toDateString() === today && l.action === 'register').length,
    logins_today: db.logs.all().filter(l => new Date(l.created_at).toDateString() === today && l.action === 'login').length,
    recent_logs: db.logs.all().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20)
      .map(l => ({ ...l, user: safe(db.users.findById(l.user_id)) })),
  });
});

// ── USERS MANAGEMENT ──
router.get('/users', (req, res) => {
  const { q, role, status } = req.query;
  let list = db.users.all();
  if (q) list = list.filter(u => (u.full_name || '').toLowerCase().includes(q.toLowerCase()) || (u.email || '').toLowerCase().includes(q.toLowerCase()) || (u.student_id || '').includes(q));
  if (role) list = list.filter(u => u.role === role);
  if (status === 'banned') list = list.filter(u => u.is_banned);
  if (status === 'active') list = list.filter(u => !u.is_banned);
  res.json(list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(safe));
});

router.get('/users/:id', (req, res) => {
  const user = db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  const skills = db.skills.find({ user_id: user.id });
  const pairs = db.pairs.all().filter(p => p.requester_id === user.id || p.target_id === user.id);
  const reviews = db.reviews.find({ reviewee_id: user.id });
  const logs = db.logs.find({ user_id: user.id }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
  res.json({ ...safe(user), skills, pairs, reviews, logs });
});

// Ban / Unban
router.put('/users/:id/ban', superAdmin, (req, res) => {
  const { reason } = req.body;
  const user = db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Không thể thao tác với tài khoản Admin' });
  if (user.id === req.user.id) return res.status(403).json({ error: 'Không thể tự khóa tài khoản của chính mình' });
  db.users.update(user.id, { is_banned: true, ban_reason: reason || 'Vi phạm quy định' });
  db.logs.insert({ id: v4(), user_id: req.user.id, action: 'ban', detail: `Ban user: ${user.email} — ${reason}` });
  res.json({ message: `Đã khóa tài khoản ${user.full_name}` });
});

router.put('/users/:id/unban', superAdmin, (req, res) => {
  const user = db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Không thể thao tác với tài khoản Admin' });
  if (user.id === req.user.id) return res.status(403).json({ error: 'Không thể thao tác với tài khoản của chính mình' });
  db.users.update(user.id, { is_banned: false, ban_reason: null });
  db.logs.insert({ id: v4(), user_id: req.user.id, action: 'unban', detail: `Unban user: ${user.email}` });
  db.notifications.insert({ id: v4(), user_id: user.id, type: 'system', title: '✅ Tài khoản đã được mở khóa', body: 'Tài khoản của bạn đã được khôi phục', is_read: false });
  res.json({ message: 'Đã mở khóa tài khoản' });
});

// Đổi role
router.put('/users/:id/role', superAdmin, (req, res) => {
  const { role } = req.body;
  const valid = ['student', 'moderator', 'volunteer'];
  if (!valid.includes(role)) return res.status(400).json({ error: 'Role không hợp lệ' });
  const user = db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Không thể đổi role Admin' });
  if (user.id === req.user.id) return res.status(403).json({ error: 'Không thể đổi role của chính mình' });
  db.users.update(user.id, { role });
  db.logs.insert({ id: v4(), user_id: req.user.id, action: 'change_role', detail: `${user.email}: ${user.role} → ${role}` });
  db.notifications.insert({ id: v4(), user_id: user.id, type: 'system', title: '🔄 Role tài khoản thay đổi', body: `Role của bạn đã được cập nhật thành: ${role}`, is_read: false });
  res.json({ message: 'Đã cập nhật role' });
});

// Reset mật khẩu
router.put('/users/:id/reset-password', superAdmin, async (req, res) => {
  const user = db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Không thể thao tác với tài khoản Admin' });
  if (user.id === req.user.id) return res.status(403).json({ error: 'Không thể tự reset mật khẩu tài khoản của chính mình' });
  const newPass = 'studymatch@' + Math.random().toString(36).slice(-6);
  db.users.update(user.id, { password: await bcrypt.hash(newPass, 10) });
  db.logs.insert({ id: v4(), user_id: req.user.id, action: 'reset_password', detail: `Reset pass: ${user.email}` });
  res.json({ message: 'Đã reset mật khẩu', new_password: newPass });
});

// ── PAIRS MANAGEMENT ──
router.get('/pairs', (req, res) => {
  const { status } = req.query;
  let list = db.pairs.all();
  if (status) list = list.filter(p => p.status === status);
  res.json(list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(p => ({
    ...p,
    requester: safe(db.users.findById(p.requester_id)),
    target: safe(db.users.findById(p.target_id)),
  })));
});

// ── REPORTS ──
router.get('/reports', (req, res) => {
  const { status } = req.query;
  let list = db.reports.all();
  if (status) list = list.filter(r => r.status === status);
  res.json(list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(r => ({
    ...r,
    reporter: safe(db.users.findById(r.reporter_id)),
    reported: safe(db.users.findById(r.reported_id)),
  })));
});

router.put('/reports/:id', (req, res) => {
  const { status, action_note } = req.body;
  db.reports.update(req.params.id, { status, action_note, resolved_by: req.user.id, resolved_at: new Date().toISOString() });
  db.logs.insert({ id: v4(), user_id: req.user.id, action: 'resolve_report', detail: `Report ${req.params.id}: ${status}` });
  res.json({ message: 'Đã cập nhật báo cáo' });
});

// ── ANNOUNCEMENTS ──
router.get('/announcements', (req, res) => {
  res.json(db.announcements.all().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

router.post('/announcements', (req, res) => {
  const { title, body, type } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Thiếu tiêu đề hoặc nội dung' });
  const ann = db.announcements.insert({ id: v4(), title, body, type: type || 'info', author_id: req.user.id });
  // Gửi notification cho tất cả user
  const users = db.users.all().filter(u => !u.is_banned && u.role === 'student');
  users.forEach(u => db.notifications.insert({
    id: v4(), user_id: u.id, type: 'announcement',
    title: `📢 ${title}`, body, ref_id: ann.id, is_read: false
  }));
  req.app.get('io')?.emit('announcement', ann);
  db.logs.insert({ id: v4(), user_id: req.user.id, action: 'announcement', detail: title });
  res.status(201).json({ message: `Đã gửi đến ${users.length} người dùng`, announcement: ann });
});

router.delete('/announcements/:id', superAdmin, (req, res) => {
  db.announcements.delete(req.params.id);
  res.json({ message: 'Đã xóa thông báo' });
});

// ── LOGS ──
router.get('/logs', (req, res) => {
  const list = db.logs.all()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100)
    .map(l => ({ ...l, user: safe(db.users.findById(l.user_id)) }));
  res.json(list);
});

module.exports = router;
