const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4 } = require('uuid');
const db = require('../db/database');
const { auth } = require('../middleware/auth');
const JWT = process.env.JWT_SECRET || 'studymatch_2024_secret';

const safe = u => { const { password, ...r } = u; return r; };
const mkToken = u => jwt.sign({ id: u.id, email: u.email, full_name: u.full_name, role: u.role }, JWT, { expiresIn: '7d' });

// Đăng ký
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, student_id, faculty, year_of_study } = req.body;
    if (!email || !password || !full_name) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    if (await db.users.findOne({ email })) return res.status(409).json({ error: 'Email đã được sử dụng' });
    const user = await db.users.insert({
      id: v4(), email, password: await bcrypt.hash(password, 10),
      full_name, student_id: student_id || null, faculty: faculty || null,
      year_of_study: year_of_study || null, avatar: null, bio: null,
      role: 'student', is_volunteer: false, is_banned: false,
      teaching_rating: 0, reputation_score: 50, total_pairs: 0,
      badge_ids: [], profile_complete: false
    });
    await db.logs.insert({ id: v4(), user_id: user.id, action: 'register', detail: email });
    res.status(201).json({ token: mkToken(user), user: safe(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Thiếu thông tin' });
    const user = await db.users.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    if (user.is_banned) return res.status(403).json({ error: 'Tài khoản đã bị khóa. Liên hệ quản trị viên.' });
    if (!await bcrypt.compare(password, user.password)) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    await db.logs.insert({ id: v4(), user_id: user.id, action: 'login', detail: email });
    res.json({ token: mkToken(user), user: safe(user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Thông tin bản thân
router.get('/me', auth, async (req, res) => {
  const user = await db.users.findById(req.user.id);
  if (!user || user.is_banned) return res.status(404).json({ error: 'Không tìm thấy' });
  const skills = await db.skills.find({ user_id: req.user.id });
  const unread_notifs = await db.notifications.count({ user_id: req.user.id, is_read: false });
  const unread_msgs = await db.messages.count({ receiver_id: req.user.id, is_read: false });
  res.json({ ...safe(user), skills, unread_notifs, unread_msgs });
});

// Đổi mật khẩu
router.put('/change-password', auth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Thiếu thông tin' });
  if (new_password.length < 6) return res.status(400).json({ error: 'Mật khẩu mới tối thiểu 6 ký tự' });
  const user = await db.users.findById(req.user.id);
  if (!await bcrypt.compare(current_password, user.password)) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
  await db.users.update(req.user.id, { password: await bcrypt.hash(new_password, 10) });
  res.json({ message: 'Đổi mật khẩu thành công' });
});

module.exports = router;
