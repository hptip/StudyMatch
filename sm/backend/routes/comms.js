const router = require('express').Router();
const { v4 } = require('uuid');
const db = require('../db/database');
const { auth } = require('../middleware/auth');
const safe = u => { if (!u) return {}; const { password, ...r } = u; return r; };

// ── CHAT ──
router.get('/conversations', auth, async (req, res) => {
  const uid = req.user.id;
  const allMsgs = await db.messages.all();
  const msgs = allMsgs.filter(m => m.sender_id === uid || m.receiver_id === uid);
  const map = {};
  msgs.forEach(m => {
    const pid = m.sender_id === uid ? m.receiver_id : m.sender_id;
    if (!map[pid] || new Date(m.created_at) > new Date(map[pid].last_time))
      map[pid] = { partner_id: pid, last_time: m.created_at };
  });
  
  const sortedMap = Object.values(map).sort((a, b) => new Date(b.last_time) - new Date(a.last_time));
  const result = await Promise.all(sortedMap.map(async c => {
    const pMsgs = msgs.filter(m =>
      (m.sender_id === uid && m.receiver_id === c.partner_id) ||
      (m.sender_id === c.partner_id && m.receiver_id === uid)
    );
    const last = pMsgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const unread = pMsgs.filter(m => m.receiver_id === uid && !m.is_read).length;
    return { ...c, partner: safe(await db.users.findById(c.partner_id)), last_message: last, unread };
  }));
  res.json(result);
});

router.get('/messages/:partnerId', auth, async (req, res) => {
  const uid = req.user.id, pid = req.params.partnerId;
  const allMsgs = await db.messages.all();
  const msgs = allMsgs
    .filter(m => (m.sender_id === uid && m.receiver_id === pid) || (m.sender_id === pid && m.receiver_id === uid))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(-60);
  
  const toUpdate = allMsgs.filter(m => m.sender_id === pid && m.receiver_id === uid && !m.is_read);
  for (const m of toUpdate) {
    await db.messages.update(m.id, { is_read: true });
  }
  
  const mapped = await Promise.all(msgs.map(async m => ({
    ...m, sender: safe(await db.users.findById(m.sender_id))
  })));
  res.json(mapped);
});

router.post('/messages', auth, async (req, res) => {
  const { receiver_id, content } = req.body;
  if (!receiver_id || !content?.trim()) return res.status(400).json({ error: 'Thiếu nội dung' });
  const msg = await db.messages.insert({ id: v4(), sender_id: req.user.id, receiver_id, content: content.trim(), is_read: false });
  res.status(201).json(msg);
});

// ── NOTIFICATIONS ──
router.get('/notifications', auth, async (req, res) => {
  const allNotifs = await db.notifications.find({ user_id: req.user.id });
  const notifs = allNotifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30);
  res.json(notifs);
});

router.put('/notifications/read-all', auth, async (req, res) => {
  const unread = await db.notifications.find({ user_id: req.user.id, is_read: false });
  for (const n of unread) {
    await db.notifications.update(n.id, { is_read: true });
  }
  res.json({ message: 'Đã đọc tất cả' });
});

router.put('/notifications/:id/read', auth, async (req, res) => {
  await db.notifications.update(req.params.id, { is_read: true });
  res.json({ message: 'OK' });
});

// ── REPORTS ──
router.post('/reports', auth, async (req, res) => {
  const { reported_id, reason, detail } = req.body;
  if (!reported_id || !reason) return res.status(400).json({ error: 'Thiếu thông tin' });
  const report = await db.reports.insert({
    id: v4(), reporter_id: req.user.id, reported_id,
    reason, detail: detail || '', status: 'pending'
  });
  const admins = await db.users.find({ role: 'admin' });
  for (const a of admins) {
    await db.notifications.insert({
      id: v4(), user_id: a.id, type: 'report',
      title: '🚩 Báo cáo vi phạm mới',
      body: `Người dùng bị báo cáo: ${reason}`,
      ref_id: report.id, is_read: false
    });
  }
  res.status(201).json({ message: 'Đã gửi báo cáo' });
});

// ── ANNOUNCEMENTS (public) ──
router.get('/announcements', auth, async (req, res) => {
  const allAnn = await db.announcements.all();
  const list = allAnn.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
  res.json(list);
});

module.exports = router;
