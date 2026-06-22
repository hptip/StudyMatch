const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { v4 } = require('uuid');
const db = require('./db/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const JWT = process.env.JWT_SECRET || 'studymatch_2024_secret';

app.set('io', io);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/pairs', require('./routes/pairs'));
app.use('/api', require('./routes/comms'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/subjects', (req, res) => res.json(SUBJECTS));
app.get('/api/stats-public', async (req, res) => res.json({
  total_users: await db.users.count(),
  completed_pairs: (await db.pairs.find({ status: 'completed' })).length,
  volunteers: (await db.users.find({ is_volunteer: true })).length,
}));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

// ── SOCKET.IO ──
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Chưa xác thực'));
  try { socket.user = jwt.verify(token, JWT); next(); }
  catch { next(new Error('Token không hợp lệ')); }
});

io.on('connection', socket => {
  const uid = socket.user.id;
  socket.join(`user_${uid}`);
  socket.broadcast.emit('user_online', { userId: uid });

  socket.on('send_message', async ({ receiver_id, content }) => {
    if (!content?.trim() || !receiver_id) return;
    const msg = await db.messages.insert({ id: v4(), sender_id: uid, receiver_id, content: content.trim(), is_read: false });
    const sender = await db.users.findById(uid);
    const full = { ...msg, sender: { full_name: sender?.full_name, avatar: sender?.avatar } };
    io.to(`user_${receiver_id}`).emit('new_message', full);
    socket.emit('message_sent', full);
  });

  socket.on('mark_read', async ({ sender_id }) => {
    const msgs = await db.messages.all();
    const toUpdate = msgs.filter(m => m.sender_id === sender_id && m.receiver_id === uid && !m.is_read);
    for (const m of toUpdate) {
      await db.messages.update(m.id, { is_read: true });
    }
    io.to(`user_${sender_id}`).emit('messages_read', { by: uid });
  });

  socket.on('typing', ({ receiver_id }) => io.to(`user_${receiver_id}`).emit('typing', { from: uid, name: socket.user.full_name }));
  socket.on('stop_typing', ({ receiver_id }) => io.to(`user_${receiver_id}`).emit('stop_typing', { from: uid }));

  socket.on('disconnect', () => socket.broadcast.emit('user_offline', { userId: uid }));
});

// ── SEED DATA ──
async function seed() {
  await db.init();
  if (await db.users.count() > 0) return;
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('123456', 10);

  const users = [
    { id: v4(), email: 'admin@studymatch.vn', password: hash, full_name: 'Admin Hệ thống', role: 'admin', student_id: null, faculty: null, year_of_study: null, is_volunteer: false, is_banned: false, teaching_rating: 0, reputation_score: 9999, total_pairs: 0, badge_ids: [], profile_complete: true },
    { id: v4(), email: 'mod@studymatch.vn', password: hash, full_name: 'Nguyễn Moderator', role: 'moderator', student_id: 'MOD001', faculty: 'Khoa CNTT', year_of_study: 4, is_volunteer: false, is_banned: false, teaching_rating: 0, reputation_score: 500, total_pairs: 0, badge_ids: [], profile_complete: true },
    { id: v4(), email: 'an@sv.edu.vn', password: hash, full_name: 'Trần Văn An', role: 'student', student_id: 'SV001', faculty: 'Khoa CNTT', year_of_study: 3, bio: 'Mình giỏi lập trình Java và C++, cần học thêm về Machine Learning', is_volunteer: false, is_banned: false, teaching_rating: 4.7, reputation_score: 820, total_pairs: 12, badge_ids: ['first_pair', 'five_pairs', 'top_rated'], profile_complete: true },
    { id: v4(), email: 'binh@sv.edu.vn', password: hash, full_name: 'Lê Thị Bình', role: 'student', student_id: 'SV002', faculty: 'Khoa CNTT', year_of_study: 3, bio: 'Chuyên Toán và Xác suất, muốn học Web và Python', is_volunteer: true, is_banned: false, teaching_rating: 4.9, reputation_score: 1050, total_pairs: 18, badge_ids: ['first_pair', 'five_pairs', 'volunteer', 'top_rated', 'rep_1000'], profile_complete: true },
    { id: v4(), email: 'cuong@sv.edu.vn', password: hash, full_name: 'Phạm Văn Cường', role: 'student', student_id: 'SV003', faculty: 'Khoa CNTT', year_of_study: 2, bio: 'Năm 2, đang học OOP và Cơ sở dữ liệu', is_volunteer: false, is_banned: false, teaching_rating: 4.2, reputation_score: 240, total_pairs: 5, badge_ids: ['first_pair'], profile_complete: true },
    { id: v4(), email: 'dung@sv.edu.vn', password: hash, full_name: 'Hoàng Thị Dung', role: 'student', student_id: 'SV004', faculty: 'Khoa CNTT', year_of_study: 4, bio: 'Chuyên AI/ML và xử lý dữ liệu lớn', is_volunteer: true, is_banned: false, teaching_rating: 4.8, reputation_score: 680, total_pairs: 9, badge_ids: ['first_pair', 'five_pairs', 'volunteer', 'rep_300'], profile_complete: true },
    { id: v4(), email: 'em@sv.edu.vn', password: hash, full_name: 'Vũ Minh Em', role: 'student', student_id: 'SV005', faculty: 'Khoa CNTT', year_of_study: 1, bio: 'Sinh viên năm 1, cần hỗ trợ nhiều môn đại cương', is_volunteer: false, is_banned: false, teaching_rating: 0, reputation_score: 50, total_pairs: 0, badge_ids: [], profile_complete: false },
  ];

  const skillMap = {
    'Trần Văn An': { teach: ['Lập trình Java', 'Lập trình hướng đối tượng C++', 'Cấu trúc dữ liệu và giải thuật'], learn: ['Học máy (Machine Learning)', 'Khoa học dữ liệu và trí tuệ nhân tạo'] },
    'Lê Thị Bình': { teach: ['Toán đại cương', 'Xác suất thống kê', 'Toán học rời rạc'], learn: ['Lập trình trên môi trường Web', 'Khoa học dữ liệu và trí tuệ nhân tạo'] },
    'Phạm Văn Cường': { teach: ['Ngôn ngữ lập trình C', 'Nhập môn Cơ sở dữ liệu'], learn: ['Lập trình hướng đối tượng C++', 'Hệ quản trị Cơ sở dữ liệu', 'Kiến trúc máy tính'] },
    'Hoàng Thị Dung': { teach: ['Học máy (Machine Learning)', 'Trí tuệ nhân tạo', 'Khoa học dữ liệu và trí tuệ nhân tạo', 'Kỹ thuật và công nghệ dữ liệu lớn'], learn: ['Lập trình trên môi trường Web'] },
    'Vũ Minh Em': { teach: [], learn: ['Toán đại cương', 'Vật lý đại cương', 'Ngôn ngữ lập trình C', 'Tư tưởng Hồ Chí Minh'] },
  };

  for (const u of users) {
    await db.users.insert({ ...u, avatar: null, created_at: new Date().toISOString() });
    const smap = skillMap[u.full_name];
    if (smap) {
      for (const s of smap.teach) await db.skills.insert({ id: v4(), user_id: u.id, subject: s, type: 'teach' });
      for (const s of smap.learn) await db.skills.insert({ id: v4(), user_id: u.id, subject: s, type: 'learn' });
    }
  }

  // Tạo một vài cặp demo
  const an = users.find(u => u.full_name === 'Trần Văn An');
  const binh = users.find(u => u.full_name === 'Lê Thị Bình');
  const cuong = users.find(u => u.full_name === 'Phạm Văn Cường');
  const dung = users.find(u => u.full_name === 'Hoàng Thị Dung');

  if (an && binh) {
    await db.pairs.insert({ id: v4(), requester_id: an.id, target_id: binh.id, status: 'completed', message: 'Mình muốn ghép cặp học Toán với bạn!', requester_confirmed: true, target_confirmed: true, completed_at: new Date().toISOString() });
  }
  if (an && dung) {
    await db.pairs.insert({ id: v4(), requester_id: dung.id, target_id: an.id, status: 'active', message: 'Mình dạy ML, bạn dạy Java nhé!', requester_confirmed: false, target_confirmed: false, completed_at: null });
  }
  if (cuong && binh) {
    await db.pairs.insert({ id: v4(), requester_id: cuong.id, target_id: binh.id, status: 'pending', message: 'Bạn có thể dạy mình Toán được không?', requester_confirmed: false, target_confirmed: false, completed_at: null });
  }

  // Demo thông báo
  await db.announcements.insert({ id: v4(), title: '🎉 Chào mừng đến StudyMatch!', body: 'Nền tảng kết nối sinh viên học tập cùng nhau. Hãy cập nhật hồ sơ và bắt đầu ghép cặp!', type: 'success', author_id: users[0].id });

  console.log('✅ Seed data OK!');
  console.log('━━━ Tài khoản demo ━━━');
  console.log('Admin:     admin@studymatch.vn / 123456');
  console.log('Mod:       mod@studymatch.vn / 123456');
  console.log('Student 1: an@sv.edu.vn / 123456');
  console.log('Student 2: binh@sv.edu.vn / 123456  (Tình nguyện viên)');
  console.log('Student 3: cuong@sv.edu.vn / 123456');
  console.log('Student 4: dung@sv.edu.vn / 123456  (Tình nguyện viên)');
  console.log('Student 5: em@sv.edu.vn / 123456   (Chưa hoàn thiện hồ sơ)');
}

const SUBJECTS = [
  'Chủ nghĩa xã hội khoa học', 'Kinh tế chính trị Mác - Lênin', 'Lịch sử Đảng cộng sản Việt Nam',
  'Triết học Mác - Lênin', 'Tư tưởng Hồ Chí Minh', 'Pháp luật Việt Nam đại cương',
  'Tiếng Anh cơ bản', 'Tiếng Anh nâng cao', 'Tiếng Anh chuyên ngành',
  'Toán đại cương', 'Toán chuyên ngành', 'Toán học rời rạc', 'Xác suất thống kê',
  'Vật lý đại cương', 'Tin học', 'Khoa học dữ liệu và trí tuệ nhân tạo',
  'Tư duy hệ thống', 'Kỹ năng mềm', 'Nhập môn tìm hiểu ngành Công nghệ thông tin',
  'Ngôn ngữ lập trình C', 'Lập trình hướng đối tượng C++', 'Nhập môn Cơ sở dữ liệu',
  'Hệ quản trị Cơ sở dữ liệu', 'Nhập môn mạng máy tính', 'Kiến trúc máy tính',
  'Cấu trúc dữ liệu và giải thuật', 'Quản lý dự án', 'Công nghệ phần mềm',
  'Kiến trúc và thiết kế phần mềm', 'Phân tích và thiết kế hệ thống thông tin',
  'Kiểm thử phần mềm', 'Quản lý dự án phần mềm', 'Lập trình trên môi trường Web',
  'Lập trình Java', 'Lập trình trực quan C#', 'Lập trình di động', 'Lập trình Game',
  'Thiết kế UI/UX', 'Trí tuệ nhân tạo', 'Học máy (Machine Learning)',
  'Kỹ thuật và công nghệ dữ liệu lớn', 'Nhập môn Xử lý ảnh', 'Điện toán đám mây',
  'An toàn và bảo mật hệ thống thông tin', 'Hệ trợ giúp quyết định',
  'Hệ thống thông tin địa lý (GIS)', 'Hệ thống hoạch định nguồn lực doanh nghiệp (ERP)',
  'Automat và ngôn ngữ hình thức', 'Phương pháp nghiên cứu khoa học',
  'Kỹ năng viết báo cáo và trình bày', 'Văn hóa kinh doanh và tinh thần khởi nghiệp',
  'Mô hình, mô phỏng, thực tế ảo', 'Tâm lý học'
];

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await seed();
  console.log(`\n🚀 StudyMatch chạy tại: http://localhost:${PORT}\n`);
});
