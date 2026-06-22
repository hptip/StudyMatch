const fs = require('fs');
const path = require('path');
const db = require('./db/database');

async function importToPg() {
  try {
    console.log('Đang kết nối tới database...');
    await db.init();
    
    const dataDir = path.join(__dirname, 'data');
    const loadJson = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));

    const users = loadJson('users.json');
    const skills = loadJson('skills.json');
    const pairs = loadJson('pairs.json');
    const reviews = loadJson('reviews.json');

    console.log(`Bắt đầu import ${users.length} users...`);
    for (const u of users) {
      const existing = await db.users.findById(u.id);
      if (!existing) {
        // Remove avatar field if it's null to let DB use default if any, or keep it.
        // db.users.insert will set created_at again, but that's fine.
        try {
          await db.users.insert(u);
        } catch (e) {
          if (!e.message.includes('duplicate key value')) {
             console.error(`Lỗi thêm user ${u.email}:`, e.message);
          }
        }
      }
    }

    console.log(`Bắt đầu import ${skills.length} skills...`);
    for (const s of skills) {
      const existing = await db.skills.findById(s.id);
      if (!existing) {
        await db.skills.insert(s);
      }
    }

    console.log(`Bắt đầu import ${pairs.length} pairs...`);
    for (const p of pairs) {
      const existing = await db.pairs.findById(p.id);
      if (!existing) {
        await db.pairs.insert(p);
      }
    }

    console.log(`Bắt đầu import ${reviews.length} reviews...`);
    for (const r of reviews) {
      const existing = await db.reviews.findById(r.id);
      if (!existing) {
        await db.reviews.insert(r);
      }
    }

    console.log('✅ Import dữ liệu lên PostgreSQL thành công!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Lỗi import:', err);
    process.exit(1);
  }
}

importToPg();
