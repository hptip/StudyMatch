#!/bin/bash
cd "$(dirname "$0")/backend"
[ ! -d node_modules ] && npm install
echo ""
echo "🚀 StudyMatch đang khởi động..."
echo "📌 Mở trình duyệt: http://localhost:3000"
echo ""
echo "━━━ Tài khoản demo (mật khẩu: 123456) ━━━"
echo "🛡️  Admin:       admin@studymatch.vn"
echo "🔰  Moderator:  mod@studymatch.vn"
echo "🎓  Student:    an@sv.edu.vn"
echo "🙋  TNV:        binh@sv.edu.vn / dung@sv.edu.vn"
echo ""
node server.js
