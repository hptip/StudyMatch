const router = require('express').Router();
const { v4 } = require('uuid');
const db = require('../db/database');
const { auth } = require('../middleware/auth');
const { grantBadge } = require('./users');
const safe = u => { if (!u) return {}; const { password, ...r } = u; return r; };

// Tính điểm ghép cặp
function calcScore(mySkills, theirSkills, me, them) {
  let score = 0;
  const myCanTeach = mySkills.filter(s => s.type === 'teach').map(s => s.subject);
  const myWantLearn = mySkills.filter(s => s.type === 'learn').map(s => s.subject);
  const theyCanTeach = theirSkills.filter(s => s.type === 'teach').map(s => s.subject);
  const theyWantLearn = theirSkills.filter(s => s.type === 'learn').map(s => s.subject);

  const theyTeachMe = myWantLearn.filter(s => theyCanTeach.includes(s)).length;
  const iTeachThem = theyWantLearn.filter(s => myCanTeach.includes(s)).length;
  const total = Math.max(myWantLearn.length + theyWantLearn.length, 1);
  score += (theyTeachMe + iTeachThem) / total * 50;
  score += ((them.teaching_rating || 0) / 5) * 15;
  if (me.faculty && me.faculty === them.faculty) score += 10;
  if (me.year_of_study && them.year_of_study && Math.abs(me.year_of_study - them.year_of_study) <= 1) score += 5;
  score += Math.min((them.reputation_score || 50) / 1000, 1) * 10;
  if (them.is_volunteer) score += 10;
  return Math.round(Math.min(score, 99));
}

// Danh sách gợi ý ghép cặp
router.get('/suggestions', auth, async (req, res) => {
  const me = await db.users.findById(req.user.id);
  if (!me) return res.status(404).json({ error: 'Không tìm thấy' });
  const mySkills = await db.skills.find({ user_id: req.user.id });
  const myWantLearn = mySkills.filter(s => s.type === 'learn').map(s => s.subject);
  const myCanTeach = mySkills.filter(s => s.type === 'teach').map(s => s.subject);

  const allPairs = await db.pairs.all();
  const myPairs = allPairs.filter(p => p.requester_id === req.user.id || p.target_id === req.user.id);

  const allUsers = await db.users.all();
  const filteredUsers = allUsers.filter(u => u.id !== req.user.id && !u.is_banned && !['admin', 'moderator'].includes(u.role));

  const suggestions = await Promise.all(filteredUsers.map(async u => {
    const theirSkills = await db.skills.find({ user_id: u.id });
    const score = calcScore(mySkills, theirSkills, me, u);

    const allPairsWithUser = myPairs.filter(p =>
      (p.requester_id === req.user.id && p.target_id === u.id) ||
      (p.requester_id === u.id && p.target_id === req.user.id)
    );
    const activePairRecord = allPairsWithUser.find(p => ['pending', 'active'].includes(p.status));
    const timesCompleted = allPairsWithUser.filter(p => p.status === 'completed').length;

    return {
      ...safe(u), skills: theirSkills, match_score: score,
      they_teach_me: theirSkills.filter(s => s.type === 'teach' && myWantLearn.includes(s.subject)),
      i_teach_them: theirSkills.filter(s => s.type === 'learn' && myCanTeach.includes(s.subject)),
      pair_status: activePairRecord?.status || null,
      pair_id: activePairRecord?.id || null,
      is_requester: activePairRecord?.requester_id === req.user.id,
      times_completed: timesCompleted,
    };
  }));

  suggestions.sort((a, b) => b.match_score - a.match_score);
  res.json(suggestions);
});

// Gửi yêu cầu ghép cặp
router.post('/request', auth, async (req, res) => {
  const { target_id, message } = req.body;
  if (!target_id) return res.status(400).json({ error: 'Thiếu thông tin' });
  if (target_id === req.user.id) return res.status(400).json({ error: 'Không thể ghép cặp với chính mình' });

  const target = await db.users.findById(target_id);
  if (!target || target.is_banned) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

  const allPairs = await db.pairs.all();
  const existing = allPairs.find(p =>
    ['pending', 'active'].includes(p.status) &&
    ((p.requester_id === req.user.id && p.target_id === target_id) || (p.requester_id === target_id && p.target_id === req.user.id))
  );
  if (existing) return res.status(409).json({ error: 'Bạn đang có ghép cặp chưa hoàn thành với người này', pair: existing });

  const me = await db.users.findById(req.user.id);
  const pair = await db.pairs.insert({
    id: v4(), requester_id: req.user.id, target_id,
    status: 'pending', message: message || '',
    requester_confirmed: false, target_confirmed: false,
    completed_at: null
  });

  const notif = await db.notifications.insert({
    id: v4(), user_id: target_id, type: 'pair_request',
    title: '🤝 Yêu cầu ghép cặp mới',
    body: `${me.full_name} muốn ghép cặp học tập với bạn`,
    ref_id: pair.id, is_read: false
  });
  req.app.get('io')?.to(`user_${target_id}`).emit('notification', notif);
  res.status(201).json({ pair, message: 'Đã gửi yêu cầu ghép cặp' });
});

// Chấp nhận yêu cầu
router.put('/:id/accept', auth, async (req, res) => {
  const pair = await db.pairs.findById(req.params.id);
  if (!pair) return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
  if (pair.target_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  if (pair.status !== 'pending') return res.status(400).json({ error: 'Yêu cầu không còn chờ xử lý' });

  await db.pairs.update(pair.id, { status: 'active' });
  await db.users.incr(pair.requester_id, 'total_pairs');
  await db.users.incr(pair.target_id, 'total_pairs');

  const me = await db.users.findById(req.user.id);
  const notif = await db.notifications.insert({
    id: v4(), user_id: pair.requester_id, type: 'pair_accepted',
    title: '✅ Yêu cầu ghép cặp được chấp nhận!',
    body: `${me.full_name} đã chấp nhận ghép cặp với bạn. Hãy bắt đầu nhắn tin!`,
    ref_id: pair.id, is_read: false
  });
  req.app.get('io')?.to(`user_${pair.requester_id}`).emit('notification', notif);

  const reqActivePairs = await db.pairs.find({ requester_id: pair.requester_id, status: 'active' });
  const reqTargetActivePairs = await db.pairs.find({ target_id: pair.requester_id, status: 'active' });
  const tarActivePairs = await db.pairs.find({ requester_id: pair.target_id, status: 'active' });
  const tarTargetActivePairs = await db.pairs.find({ target_id: pair.target_id, status: 'active' });
  
  const rPairs = reqActivePairs.length + reqTargetActivePairs.length;
  const tPairs = tarActivePairs.length + tarTargetActivePairs.length;
  
  const io = req.app.get('io');
  if (rPairs >= 1) await grantBadge(pair.requester_id, 'first_pair', io);
  if (tPairs >= 1) await grantBadge(pair.target_id, 'first_pair', io);
  if (rPairs >= 5) await grantBadge(pair.requester_id, 'five_pairs', io);
  if (tPairs >= 5) await grantBadge(pair.target_id, 'five_pairs', io);

  res.json({ message: 'Đã chấp nhận ghép cặp' });
});

// Từ chối yêu cầu
router.put('/:id/reject', auth, async (req, res) => {
  const pair = await db.pairs.findById(req.params.id);
  if (!pair) return res.status(404).json({ error: 'Không tìm thấy' });
  if (pair.target_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  await db.pairs.update(pair.id, { status: 'rejected' });
  const me = await db.users.findById(req.user.id);
  const notif = await db.notifications.insert({
    id: v4(), user_id: pair.requester_id, type: 'pair_rejected',
    title: '❌ Yêu cầu ghép cặp bị từ chối',
    body: `${me.full_name} đã từ chối yêu cầu ghép cặp`,
    ref_id: pair.id, is_read: false
  });
  req.app.get('io')?.to(`user_${pair.requester_id}`).emit('notification', notif);
  res.json({ message: 'Đã từ chối' });
});

// Hủy ghép cặp
router.put('/:id/cancel', auth, async (req, res) => {
  const pair = await db.pairs.findById(req.params.id);
  if (!pair) return res.status(404).json({ error: 'Không tìm thấy' });
  if (pair.requester_id !== req.user.id && pair.target_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });
  if (!['pending', 'active'].includes(pair.status)) return res.status(400).json({ error: 'Không thể hủy ở trạng thái này' });

  const wasActive = pair.status === 'active';
  await db.pairs.update(pair.id, { status: 'cancelled' });
  if (wasActive) {
    await db.users.incr(pair.requester_id, 'total_pairs', -1);
    await db.users.incr(pair.target_id, 'total_pairs', -1);
  }
  const me = await db.users.findById(req.user.id);
  const otherId = pair.requester_id === req.user.id ? pair.target_id : pair.requester_id;
  const notif = await db.notifications.insert({
    id: v4(), user_id: otherId, type: 'pair_cancelled',
    title: '⚠️ Ghép cặp đã bị hủy',
    body: `${me.full_name} đã hủy ghép cặp`,
    ref_id: pair.id, is_read: false
  });
  req.app.get('io')?.to(`user_${otherId}`).emit('notification', notif);
  res.json({ message: 'Đã hủy ghép cặp' });
});

// Xác nhận hoàn thành học
router.put('/:id/confirm-complete', auth, async (req, res) => {
  const pair = await db.pairs.findById(req.params.id);
  if (!pair) return res.status(404).json({ error: 'Không tìm thấy' });
  if (pair.status !== 'active') return res.status(400).json({ error: 'Chỉ ghép cặp đang hoạt động mới có thể xác nhận' });
  if (pair.requester_id !== req.user.id && pair.target_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });

  const isRequester = pair.requester_id === req.user.id;
  const update = isRequester ? { requester_confirmed: true } : { target_confirmed: true };
  const updated = await db.pairs.update(pair.id, update);

  const me = await db.users.findById(req.user.id);
  const otherId = isRequester ? pair.target_id : pair.requester_id;

  if (updated.requester_confirmed && updated.target_confirmed) {
    await db.pairs.update(pair.id, { status: 'completed', completed_at: new Date().toISOString() });
    await db.users.incr(pair.requester_id, 'reputation_score', 20);
    await db.users.incr(pair.target_id, 'reputation_score', 20);
    const io = req.app.get('io');
    
    for (const uid of [pair.requester_id, pair.target_id]) {
      const notif = await db.notifications.insert({
        id: v4(), user_id: uid, type: 'pair_completed',
        title: '🎉 Ghép cặp hoàn thành!',
        body: 'Bạn đã hoàn thành học tập. Hãy đánh giá nhau nhé!',
        ref_id: pair.id, is_read: false
      });
      io?.to(`user_${uid}`).emit('notification', notif);
    }

    const compPairs = await db.pairs.find({ status: 'completed' });
    const rTotal = compPairs.filter(p => p.requester_id === pair.requester_id || p.target_id === pair.requester_id).length;
    const tTotal = compPairs.filter(p => p.requester_id === pair.target_id || p.target_id === pair.target_id).length;
    if (rTotal >= 10) await grantBadge(pair.requester_id, 'complete_10', io);
    if (tTotal >= 10) await grantBadge(pair.target_id, 'complete_10', io);
    
    return res.json({ message: 'Cả 2 đã xác nhận — ghép cặp hoàn thành!', status: 'completed' });
  }

  const notif = await db.notifications.insert({
    id: v4(), user_id: otherId, type: 'pair_confirm',
    title: '✅ Bạn học đã xác nhận hoàn thành',
    body: `${me.full_name} đã xác nhận hoàn thành. Hãy xác nhận của bạn!`,
    ref_id: pair.id, is_read: false
  });
  req.app.get('io')?.to(`user_${otherId}`).emit('notification', notif);
  res.json({ message: 'Đã xác nhận. Chờ bên kia xác nhận.', status: 'waiting_other' });
});

// Đánh giá
router.post('/:id/review', auth, async (req, res) => {
  const pair = await db.pairs.findById(req.params.id);
  if (!pair) return res.status(404).json({ error: 'Không tìm thấy' });
  if (pair.status !== 'completed') return res.status(400).json({ error: 'Chỉ đánh giá sau khi hoàn thành' });
  if (pair.requester_id !== req.user.id && pair.target_id !== req.user.id) return res.status(403).json({ error: 'Không có quyền' });

  const reviewee_id = pair.requester_id === req.user.id ? pair.target_id : pair.requester_id;
  const existing = await db.reviews.findOne({ pair_id: pair.id, reviewer_id: req.user.id });
  if (existing) return res.status(409).json({ error: 'Bạn đã đánh giá người này rồi' });

  const { knowledge, teaching, attitude, punctuality, comment } = req.body;
  if (!knowledge || !teaching || !attitude || !punctuality) return res.status(400).json({ error: 'Vui lòng chấm đủ 4 tiêu chí' });

  await db.reviews.insert({
    id: v4(), pair_id: pair.id, reviewer_id: req.user.id,
    reviewee_id, knowledge, teaching, attitude, punctuality,
    comment: comment || ''
  });

  const allRevs = await db.reviews.find({ reviewee_id });
  const avg = allRevs.reduce((s, r) => s + (r.knowledge + r.teaching + r.attitude + r.punctuality) / 4, 0) / allRevs.length;
  await db.users.update(reviewee_id, { teaching_rating: +avg.toFixed(2) });
  await db.users.incr(reviewee_id, 'reputation_score', 10);

  const io = req.app.get('io');
  if (avg >= 4.5) await grantBadge(reviewee_id, 'top_rated', io);
  const revieweeUser = await db.users.findById(reviewee_id);
  const rep = revieweeUser?.reputation_score || 0;
  if (rep >= 300) await grantBadge(reviewee_id, 'rep_300', io);
  if (rep >= 1000) await grantBadge(reviewee_id, 'rep_1000', io);

  const me = await db.users.findById(req.user.id);
  const notif = await db.notifications.insert({
    id: v4(), user_id: reviewee_id, type: 'review',
    title: '⭐ Bạn nhận được đánh giá mới',
    body: `${me.full_name} đã đánh giá bạn ${((+knowledge + +teaching + +attitude + +punctuality) / 4).toFixed(1)} sao`,
    ref_id: pair.id, is_read: false
  });
  io?.to(`user_${reviewee_id}`).emit('notification', notif);
  res.status(201).json({ message: 'Đánh giá thành công' });
});

// Danh sách cặp của tôi
router.get('/my/all', auth, async (req, res) => {
  const { status } = req.query;
  const allPairs = await db.pairs.all();
  let myPairs = allPairs.filter(p => p.requester_id === req.user.id || p.target_id === req.user.id);
  if (status) myPairs = myPairs.filter(p => p.status === status);
  myPairs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const result = await Promise.all(myPairs.map(async p => {
    const partnerId = p.requester_id === req.user.id ? p.target_id : p.requester_id;
    const partner = await db.users.findById(partnerId);
    const myReview = await db.reviews.findOne({ pair_id: p.id, reviewer_id: req.user.id });
    const theirReview = await db.reviews.findOne({ pair_id: p.id, reviewer_id: partnerId });
    return {
      ...p,
      partner: safe(partner),
      partner_skills: await db.skills.find({ user_id: partnerId }),
      is_requester: p.requester_id === req.user.id,
      my_confirmed: p.requester_id === req.user.id ? p.requester_confirmed : p.target_confirmed,
      their_confirmed: p.requester_id === req.user.id ? p.target_confirmed : p.requester_confirmed,
      can_review: p.status === 'completed' && !myReview,
      my_review: myReview,
      their_review: theirReview,
    };
  }));
  res.json(result);
});

// Tình nguyện viên
router.get('/volunteers/list', auth, async (req, res) => {
  const { subject } = req.query;
  const allUsers = await db.users.all();
  let vols = allUsers.filter(u => u.id !== req.user.id && u.is_volunteer && !u.is_banned);
  
  const result = await Promise.all(vols.map(async u => {
    const skills = await db.skills.find({ user_id: u.id });
    return { ...safe(u), skills };
  }));

  let finalResult = result;
  if (subject) {
    finalResult = result.filter(u => u.skills.some(s => s.type === 'teach' && s.subject.toLowerCase().includes(subject.toLowerCase())));
  }
  
  res.json(finalResult);
});

module.exports = router;
