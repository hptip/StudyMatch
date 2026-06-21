const router = require('express').Router();
const { v4 } = require('uuid');
const db = require('../db/database');
const { auth } = require('../middleware/auth');
const safe = u => { if (!u) return {}; const { password, ...r } = u; return r; };

// ── CHAT ──
router.get('/conversations', auth, (req, res) => {
  const uid = req.user.id;
  const msgs = db.messages.all().filter(m => m.sender_id === uid || m.receiver_id === uid);
  const map = {};
  msgs.forEach(m => {
    const pid = m.sender_id === uid ? m.receiver_id : m.sender_id;
    if (!map[pid] || new Date(m.created_at) > new Date(map[pid].last_time))
      map[pid] = { partner_id: pid, last_time: m.created_at };
  });
  const result = Object.values(map)
    .sort((a, b) => new Date(b.last_time) - new Date(a.last_time))
    .map(c => {
      const pMsgs = msgs.filter(m =>
        (m.sender_id === uid && m.receiver_id === c.partner_id) ||
        (m.sender_id === c.partner_id && m.receiver_id === uid)
      );
      const last = pMsgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const unread = pMsgs.filter(m => m.receiver_id === uid && !m.is_read).length;
      return { ...c, partner: safe(db.users.findById(c.partner_id)), last_message: last, unread };
    });
  res.json(result);
});

router.get('/messages/:partnerId', auth, (req, res) => {
  const uid = req.user.id, pid = req.params.partnerId;
  const msgs = db.messages.all()
    .filter(m => (m.sender_id === uid && m.receiver_id === pid) || (m.sender_id === pid && m.receiver_id === uid))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(-60);
  db.messages.all().filter(m => m.sender_id === pid && m.receiver_id === uid && !m.is_read)
    .forEach(m => db.messages.update(m.id, { is_read: true }));
  res.json(msgs.map(m => ({ ...m, sender: safe(db.users.findById(m.sender_id)) })));
});

router.post('/messages', auth, (req, res) => {
  const { receiver_id, content } = req.body;
  if (!receiver_id || !content?.trim()) return res.status(400).json({ error: 'Thiếu nội dung' });
  const msg = db.messages.insert({ id: v4(), sender_id: req.user.id, receiver_id, content: content.trim(), is_read: false });
  res.status(201).json(msg);
});

// ── NOTIFICATIONS ──
router.get('/notifications', auth, (req, res) => {
  const notifs = db.notifications.find({ user_id: req.user.id })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30);
  res.json(notifs);
});

router.put('/notifications/read-all', auth, (req, res) => {
  db.notifications.find({ user_id: req.user.id, is_read: false })
    .forEach(n => db.notifications.update(n.id, { is_read: true }));
  res.json({ message: 'Đã đọc tất cả' });
});

router.put('/notifications/:id/read', auth, (req, res) => {
  db.notifications.update(req.params.id, { is_read: true });
  res.json({ message: 'OK' });
});

// ── REPORTS ──
router.post('/reports', auth, (req, res) => {
  const { reported_id, reason, detail } = req.body;
  if (!reported_id || !reason) return res.status(400).json({ error: 'Thiếu thông tin' });
  const report = db.reports.insert({
    id: v4(), reporter_id: req.user.id, reported_id,
    reason, detail: detail || '', status: 'pending'
  });
  const admins = db.users.find({ role: 'admin' });
  admins.forEach(a => db.notifications.insert({
    id: v4(), user_id: a.id, type: 'report',
    title: '🚩 Báo cáo vi phạm mới',
    body: `Người dùng bị báo cáo: ${reason}`,
    ref_id: report.id, is_read: false
  }));
  res.status(201).json({ message: 'Đã gửi báo cáo' });
});

// ── ANNOUNCEMENTS (public) ──
router.get('/announcements', auth, (req, res) => {
  const list = db.announcements.all()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
  res.json(list);
});

module.exports = router;
