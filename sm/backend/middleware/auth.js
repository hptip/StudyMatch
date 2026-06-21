const jwt = require('jsonwebtoken');
const JWT = process.env.JWT_SECRET || 'studymatch_2024_secret';

const auth = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try { req.user = jwt.verify(h.split(' ')[1], JWT); next(); }
  catch { res.status(401).json({ error: 'Phiên đăng nhập hết hạn' }); }
};

const adminOnly = (req, res, next) => {
  if (!['admin', 'moderator'].includes(req.user?.role))
    return res.status(403).json({ error: 'Không có quyền truy cập' });
  next();
};

const superAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Chỉ Admin mới có quyền này' });
  next();
};

module.exports = { auth, adminOnly, superAdmin };
