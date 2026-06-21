# 📚 StudyMatch v2.0 — Kết nối học tập thông minh

## 🚀 Chạy ngay

```bash
# Mac / Linux
./start.sh

# Windows
start.bat

# Hoặc thủ công
cd backend && npm install && node server.js
```

Mở trình duyệt: **http://localhost:3000**

---

## 🔑 Tài khoản demo (mật khẩu: `123456`)

| Tài khoản | Email | Vai trò |
|-----------|-------|---------|
| Admin hệ thống | admin@studymatch.vn | 🛡️ Admin |
| Moderator | mod@studymatch.vn | 🔰 Moderator |
| Trần Văn An | an@sv.edu.vn | 🎓 Student (giỏi Java) |
| Lê Thị Bình | binh@sv.edu.vn | 🙋 Tình nguyện viên (giỏi Toán) |
| Phạm Văn Cường | cuong@sv.edu.vn | 🎓 Student |
| Hoàng Thị Dung | dung@sv.edu.vn | 🙋 Tình nguyện viên (giỏi AI/ML) |
| Vũ Minh Em | em@sv.edu.vn | 🎓 Student mới |

---

## 🏗️ Kiến trúc

```
studymatch/
├── backend/
│   ├── server.js           # Entry + Socket.io + Seed data
│   ├── db/database.js      # JSON database engine
│   ├── middleware/auth.js  # JWT + Role middleware
│   └── routes/
│       ├── auth.js         # Đăng ký / Đăng nhập / Đổi mật khẩu
│       ├── users.js        # Hồ sơ / Kỹ năng / Leaderboard / Badge
│       ├── pairs.js        # Ghép cặp / Xác nhận / Hủy / Đánh giá
│       ├── comms.js        # Chat / Thông báo / Báo cáo
│       └── admin.js        # Quản trị toàn hệ thống
└── frontend/
    ├── index.html          # Landing page
    ├── auth.html           # Đăng nhập / Đăng ký
    ├── dashboard.html      # Tổng quan
    ├── matches.html        # Ghép cặp thông minh
    ├── pairs.html          # Quản lý cặp đôi
    ├── chat.html           # Nhắn tin realtime
    ├── profile.html        # Hồ sơ & Kỹ năng
    ├── leaderboard.html    # Bảng xếp hạng
    ├── notifications.html  # Thông báo
    ├── css/style.css       # Global stylesheet
    ├── js/app.js           # API utils, Auth, Toast, Helpers
    └── admin/
        ├── index.html      # Dashboard admin
        ├── users.html      # Quản lý user
        ├── pairs.html      # Quản lý cặp đôi
        ├── reports.html    # Báo cáo vi phạm
        ├── announcements.html # Thông báo hệ thống
        └── logs.html       # Nhật ký hoạt động
```

---

## ✅ Tính năng đầy đủ

### Xác thực
- Đăng ký tài khoản (email, mật khẩu, MSSV, khoa, năm)
- Đăng nhập với JWT (7 ngày)
- Đổi mật khẩu
- Kiểm tra tài khoản bị ban

### Hồ sơ học tập
- Cập nhật thông tin cá nhân
- **Toggle Tình nguyện viên**: Bật → chỉ hiện môn dạy / Tắt → hiện cả môn dạy + muốn học
- Danh sách 55 môn học chuẩn (theo chương trình CNTT)
- Huy hiệu thành tích (7 loại)
- Thống kê: cặp đang học, hoàn thành, rating, lượt xem hồ sơ

### Ghép cặp thông minh
- Thuật toán tính điểm 6 tiêu chí (môn học 50%, rating 15%, khoa 10%, uy tín 10%, năm học 5%, TNV 10%)
- Xem hồ sơ chi tiết trên panel bên phải
- **Gửi yêu cầu ghép cặp** kèm lời nhắn
- Gửi nhiều lời mời với nhiều người khác nhau
- Lọc theo khoa, tình nguyện viên
- Tìm kiếm theo tên / môn học

### Cơ chế ghép cặp 2 phía
- **Pending** → chờ phía kia xác nhận/từ chối
- **Active** → đang học cùng nhau
- **Confirmed** → cả 2 xác nhận hoàn thành → **Completed**
- **Hủy ghép cặp** bất kỳ lúc nào (pending hoặc active)
- **Đánh giá** chỉ sau khi cặp đôi đã hoàn thành (4 tiêu chí: Kiến thức, Truyền đạt, Thái độ, Nghiêm túc)

### Chat realtime (Socket.io)
- Nhắn tin trực tiếp theo thời gian thực
- Typing indicator ("đang soạn...")
- Đánh dấu đã đọc
- Lịch sử 60 tin nhắn gần nhất

### Gamification
- Điểm uy tín (+20 khi cặp hoàn thành, +10 khi nhận đánh giá)
- 7 huy hiệu: Ghép đôi đầu tiên / 5 lần / 10 lần / TNV / Top rated / 300 điểm / 1000 điểm
- Bảng xếp hạng 3 loại: Uy tín / Cặp học / Rating

### Thông báo
- Realtime qua Socket.io
- Các loại: yêu cầu ghép cặp, xác nhận, từ chối, hủy, hoàn thành, đánh giá, huy hiệu, thông báo HT
- Đánh dấu đã đọc

### Báo cáo vi phạm
- Student báo cáo người dùng vi phạm
- Admin/Mod nhận notification ngay lập tức
- Xử lý: Resolved / Dismissed

### Admin Dashboard
- Thống kê realtime: tổng user, cặp hoàn thành, báo cáo chờ, TNV, đăng ký & login hôm nay
- Quản lý user: tìm kiếm, lọc, xem chi tiết, ban/unban, đổi role, reset mật khẩu
- Quản lý cặp đôi toàn hệ thống
- Xử lý báo cáo vi phạm
- Gửi thông báo hệ thống (đến tất cả student)
- Nhật ký hoạt động 100 gần nhất

---

## ⚙️ Tech Stack

- **Backend**: Node.js + Express + Socket.io + JWT + bcryptjs
- **Database**: JSON file (không cần cài DB)
- **Frontend**: HTML5 + CSS3 + Vanilla JS (không cần build)
- **Realtime**: Socket.io

## 📋 Danh sách 55 môn học tích hợp

Chủ nghĩa xã hội khoa học, Kinh tế chính trị, Lịch sử Đảng, Triết học, Tư tưởng HCM, Pháp luật, Tiếng Anh (3 cấp), Toán (4 loại), Vật lý, Tin học, KHDT&AI, Lập trình C/C++/Java/C#, CSDL, Mạng máy tính, Kiến trúc máy tính, CTDL&GT, Công nghệ phần mềm, Web, Mobile, Game, UI/UX, AI, ML, Big Data, Xử lý ảnh, Cloud, Bảo mật, GIS, ERP, và nhiều môn khác...
