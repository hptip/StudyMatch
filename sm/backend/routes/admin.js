const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4 } = require('uuid');
const db = require('../db/database');
const { auth, adminOnly, superAdmin } = require('../middleware/auth');
const safe = u => { if (!u) return {}; const { password, ...r } = u; return r; };

// Middleware: tất cả routes cần login + admin/mod
router.use(auth, adminOnly);

// ── STATS DASHBOARD ──
router.get('/stats', async (req, res) => {
  const allUsers = await db.users.all();
  const users = allUsers.filter(u => !['admin', 'moderator'].includes(u.role));
  const pairs = await db.pairs.all();
  const today = new Date().toDateString();
  const pending_reports = await db.reports.find({ status: 'pending' });
  const total_messages = await db.messages.count();
  
  const allLogs = await db.logs.all();
  
  const recent_logs = await Promise.all(allLogs
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20)
    .map(async l => ({ ...l, user: safe(await db.users.findById(l.user_id)) })));

  res.json({
    total_users: users.length,
    active_users: users.filter(u => !u.is_banned).length,
    banned_users: users.filter(u => u.is_banned).length,
    volunteers: users.filter(u => u.is_volunteer).length,
    total_pairs: pairs.length,
    active_pairs: pairs.filter(p => p.status === 'active').length,
    completed_pairs: pairs.filter(p => p.status === 'completed').length,
    pending_reports: pending_reports.length,
    total_messages,
    new_today: allLogs.filter(l => new Date(l.created_at).toDateString() === today && l.action === 'register').length,
    logins_today: allLogs.filter(l => new Date(l.created_at).toDateString() === today && l.action === 'login').length,
    recent_logs,
  });
});

// ── USERS MANAGEMENT ──
router.get('/users', async (req, res) => {
  const { q, role, status } = req.query;
  let list = await db.users.all();
  if (q) list = list.filter(u => (u.full_name || '').toLowerCase().includes(q.toLowerCase()) || (u.email || '').toLowerCase().includes(q.toLowerCase()) || (u.student_id || '').includes(q));
  if (role) list = list.filter(u => u.role === role);
  if (status === 'banned') list = list.filter(u => u.is_banned);
  if (status === 'active') list = list.filter(u => !u.is_banned);
  res.json(list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(safe));
});

router.get('/users/:id', async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  const skills = await db.skills.find({ user_id: user.id });
  const allPairs = await db.pairs.all();
  const pairs = allPairs.filter(p => p.requester_id === user.id || p.target_id === user.id);
  const reviews = await db.reviews.find({ reviewee_id: user.id });
  const logs = await db.logs.find({ user_id: user.id });
  const sortedLogs = logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);
  res.json({ ...safe(user), skills, pairs, reviews, logs: sortedLogs });
});

// Ban / Unban
router.put('/users/:id/ban', superAdmin, async (req, res) => {
  const { reason } = req.body;
  const user = await db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Không thể thao tác với tài khoản Admin' });
  if (user.id === req.user.id) return res.status(403).json({ error: 'Không thể tự khóa tài khoản của chính mình' });
  await db.users.update(user.id, { is_banned: true, ban_reason: reason || 'Vi phạm quy định' });
  await db.logs.insert({ id: v4(), user_id: req.user.id, action: 'ban', detail: `Ban user: ${user.email} — ${reason}` });
  res.json({ message: `Đã khóa tài khoản ${user.full_name}` });
});

router.put('/users/:id/unban', superAdmin, async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Không thể thao tác với tài khoản Admin' });
  if (user.id === req.user.id) return res.status(403).json({ error: 'Không thể thao tác với tài khoản của chính mình' });
  await db.users.update(user.id, { is_banned: false, ban_reason: null });
  await db.logs.insert({ id: v4(), user_id: req.user.id, action: 'unban', detail: `Unban user: ${user.email}` });
  await db.notifications.insert({ id: v4(), user_id: user.id, type: 'system', title: '✅ Tài khoản đã được mở khóa', body: 'Tài khoản của bạn đã được khôi phục', is_read: false });
  res.json({ message: 'Đã mở khóa tài khoản' });
});

// Đổi role
router.put('/users/:id/role', superAdmin, async (req, res) => {
  const { role } = req.body;
  const valid = ['student', 'moderator', 'volunteer'];
  if (!valid.includes(role)) return res.status(400).json({ error: 'Role không hợp lệ' });
  const user = await db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Không thể đổi role Admin' });
  if (user.id === req.user.id) return res.status(403).json({ error: 'Không thể đổi role của chính mình' });
  await db.users.update(user.id, { role });
  await db.logs.insert({ id: v4(), user_id: req.user.id, action: 'change_role', detail: `${user.email}: ${user.role} → ${role}` });
  await db.notifications.insert({ id: v4(), user_id: user.id, type: 'system', title: '🔄 Role tài khoản thay đổi', body: `Role của bạn đã được cập nhật thành: ${role}`, is_read: false });
  res.json({ message: 'Đã cập nhật role' });
});

// Reset mật khẩu
router.put('/users/:id/reset-password', superAdmin, async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Không thể thao tác với tài khoản Admin' });
  if (user.id === req.user.id) return res.status(403).json({ error: 'Không thể tự reset mật khẩu tài khoản của chính mình' });
  const newPass = 'studymatch@' + Math.random().toString(36).slice(-6);
  await db.users.update(user.id, { password: await bcrypt.hash(newPass, 10) });
  await db.logs.insert({ id: v4(), user_id: req.user.id, action: 'reset_password', detail: `Reset pass: ${user.email}` });
  res.json({ message: 'Đã reset mật khẩu', new_password: newPass });
});

// ── PAIRS MANAGEMENT ──
router.get('/pairs', async (req, res) => {
  const { status } = req.query;
  let list = await db.pairs.all();
  if (status) list = list.filter(p => p.status === status);
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  const result = await Promise.all(list.map(async p => ({
    ...p,
    requester: safe(await db.users.findById(p.requester_id)),
    target: safe(await db.users.findById(p.target_id)),
  })));
  res.json(result);
});

// ── REPORTS ──
router.get('/reports', async (req, res) => {
  const { status } = req.query;
  let list = await db.reports.all();
  if (status) list = list.filter(r => r.status === status);
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const result = await Promise.all(list.map(async r => ({
    ...r,
    reporter: safe(await db.users.findById(r.reporter_id)),
    reported: safe(await db.users.findById(r.reported_id)),
  })));
  res.json(result);
});

router.put('/reports/:id', async (req, res) => {
  const { status, action_note } = req.body;
  await db.reports.update(req.params.id, { status, action_note, resolved_by: req.user.id, resolved_at: new Date().toISOString() });
  await db.logs.insert({ id: v4(), user_id: req.user.id, action: 'resolve_report', detail: `Report ${req.params.id}: ${status}` });
  res.json({ message: 'Đã cập nhật báo cáo' });
});

// ── ANNOUNCEMENTS ──
router.get('/announcements', async (req, res) => {
  const all = await db.announcements.all();
  res.json(all.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

router.post('/announcements', async (req, res) => {
  const { title, body, type } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Thiếu tiêu đề hoặc nội dung' });
  const ann = await db.announcements.insert({ id: v4(), title, body, type: type || 'info', author_id: req.user.id });
  const allUsers = await db.users.all();
  const users = allUsers.filter(u => !u.is_banned && u.role === 'student');
  for (const u of users) {
    await db.notifications.insert({
      id: v4(), user_id: u.id, type: 'announcement',
      title: `📢 ${title}`, body, ref_id: ann.id, is_read: false
    });
  }
  req.app.get('io')?.emit('announcement', ann);
  await db.logs.insert({ id: v4(), user_id: req.user.id, action: 'announcement', detail: title });
  res.status(201).json({ message: `Đã gửi đến ${users.length} người dùng`, announcement: ann });
});

router.delete('/announcements/:id', superAdmin, async (req, res) => {
  await db.announcements.delete(req.params.id);
  res.json({ message: 'Đã xóa thông báo' });
});

// ── LOGS ──
router.get('/logs', async (req, res) => {
  const allLogs = await db.logs.all();
  const topLogs = allLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
  const list = await Promise.all(topLogs.map(async l => ({
    ...l, user: safe(await db.users.findById(l.user_id))
  })));
  res.json(list);
});

module.exports = router;
