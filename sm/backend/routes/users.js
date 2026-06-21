const router = require('express').Router();
const { v4 } = require('uuid');
const db = require('../db/database');
const { auth } = require('../middleware/auth');
const safe = u => { if (!u) return {}; const { password, ...r } = u; return r; };

const BADGES = {
  first_pair: { name: 'Ghép đôi đầu tiên', icon: '🤝' },
  five_pairs: { name: '5 lần ghép đôi', icon: '⭐' },
  top_rated: { name: 'Được đánh giá cao', icon: '🏆' },
  volunteer: { name: 'Tình nguyện viên', icon: '🙋' },
  rep_300: { name: 'Được tin tưởng', icon: '💎' },
  rep_1000: { name: 'Top Mentor', icon: '🏅' },
  complete_10: { name: 'Học tập tích cực', icon: '📚' },
};

function grantBadge(userId, badgeId, io) {
  const user = db.users.findById(userId);
  if (!user) return;
  const badges = user.badge_ids || [];
  if (badges.includes(badgeId)) return;
  db.users.update(userId, { badge_ids: [...badges, badgeId] });
  const notif = db.notifications.insert({
    id: v4(), user_id: userId, type: 'badge',
    title: '🏅 Huy hiệu mới!',
    body: `Bạn vừa nhận huy hiệu: ${BADGES[badgeId]?.icon} ${BADGES[badgeId]?.name}`,
    is_read: false
  });
  io?.to(`user_${userId}`).emit('notification', notif);
}

// Xem hồ sơ
router.get('/:id', auth, (req, res) => {
  const user = db.users.findById(req.params.id);
  if (!user || user.is_banned) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
  if (req.params.id !== req.user.id) db.users.incr(req.params.id, 'profile_views');
  const skills = db.skills.find({ user_id: req.params.id });
  const reviews = db.reviews.find({ reviewee_id: req.params.id })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10)
    .map(r => ({ ...r, reviewer: safe(db.users.findById(r.reviewer_id)) }));
  res.json({ ...safe(user), skills, reviews });
});

// Cập nhật hồ sơ
router.put('/profile/update', auth, (req, res) => {
  const { full_name, student_id, faculty, year_of_study, bio, avatar, is_volunteer } = req.body;
  if (!full_name?.trim()) return res.status(400).json({ error: 'Họ tên không được để trống' });
  db.users.update(req.user.id, {
    full_name: full_name.trim(), student_id, faculty,
    year_of_study: +year_of_study || null, bio, avatar,
    is_volunteer: !!is_volunteer, profile_complete: true
  });
  if (is_volunteer) grantBadge(req.user.id, 'volunteer', req.app.get('io'));
  res.json({ message: 'Cập nhật thành công' });
});

// Cập nhật kỹ năng
router.post('/skills/update', auth, (req, res) => {
  const { skills } = req.body;
  if (!Array.isArray(skills)) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  db.skills.deleteWhere({ user_id: req.user.id });
  skills.forEach(s => db.skills.insert({ id: v4(), user_id: req.user.id, subject: s.subject.trim(), type: s.type }));
  res.json({ message: 'Cập nhật kỹ năng thành công' });
});

// Tìm kiếm user
router.get('/', auth, (req, res) => {
  const { q, faculty, year } = req.query;
  let list = db.users.all().filter(u => u.id !== req.user.id && !u.is_banned && u.role !== 'admin');
  if (q) list = list.filter(u => (u.full_name || '').toLowerCase().includes(q.toLowerCase()) || (u.student_id || '').includes(q));
  if (faculty) list = list.filter(u => u.faculty === faculty);
  if (year) list = list.filter(u => u.year_of_study == year);
  res.json(list.map(u => ({ ...safe(u), skills: db.skills.find({ user_id: u.id }) })));
});

// Bảng xếp hạng
router.get('/leaderboard/top', auth, (req, res) => {
  const { type = 'reputation' } = req.query;
  let list = db.users.all().filter(u => !u.is_banned && !['admin', 'moderator'].includes(u.role));
  if (type === 'reputation') list.sort((a, b) => (b.reputation_score || 0) - (a.reputation_score || 0));
  else if (type === 'pairs') list.sort((a, b) => (b.total_pairs || 0) - (a.total_pairs || 0));
  else if (type === 'rating') list.sort((a, b) => (b.teaching_rating || 0) - (a.teaching_rating || 0));
  res.json(list.slice(0, 20).map((u, i) => ({
    ...safe(u), rank: i + 1,
    skills: db.skills.find({ user_id: u.id })
  })));
});

// Danh sách huy hiệu
router.get('/badges/all', auth, (req, res) => res.json(BADGES));

module.exports = router;
module.exports.grantBadge = grantBadge;
module.exports.BADGES = BADGES;
