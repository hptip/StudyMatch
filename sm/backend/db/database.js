const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/studymatch',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

class Table {
  constructor(name) {
    this.name = name;
  }

  async all() {
    const res = await pool.query(`SELECT * FROM ${this.name}`);
    return res.rows;
  }

  async findById(id) {
    const res = await pool.query(`SELECT * FROM ${this.name} WHERE id = $1`, [id]);
    return res.rows[0] || null;
  }

  async findOne(w = {}) {
    const keys = Object.keys(w);
    if (keys.length === 0) {
      const res = await pool.query(`SELECT * FROM ${this.name} LIMIT 1`);
      return res.rows[0] || null;
    }
    const conditions = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    const values = Object.values(w);
    const res = await pool.query(`SELECT * FROM ${this.name} WHERE ${conditions} LIMIT 1`, values);
    return res.rows[0] || null;
  }

  async find(w = {}) {
    const keys = Object.keys(w);
    if (keys.length === 0) return this.all();
    const conditions = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    const values = Object.values(w);
    const res = await pool.query(`SELECT * FROM ${this.name} WHERE ${conditions}`, values);
    return res.rows;
  }

  async count(w = {}) {
    const keys = Object.keys(w);
    if (keys.length === 0) {
      const res = await pool.query(`SELECT COUNT(*) FROM ${this.name}`);
      return parseInt(res.rows[0].count, 10);
    }
    const conditions = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    const values = Object.values(w);
    const res = await pool.query(`SELECT COUNT(*) FROM ${this.name} WHERE ${conditions}`, values);
    return parseInt(res.rows[0].count, 10);
  }

  async insert(row) {
    const r = { created_at: new Date().toISOString(), ...row };
    // Handle objects/arrays for jsonb mapping
    for (let key in r) {
      if (typeof r[key] === 'object' && r[key] !== null && !(r[key] instanceof Date)) {
        r[key] = JSON.stringify(r[key]);
      }
    }
    const keys = Object.keys(r);
    const values = Object.values(r);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const res = await pool.query(
      `INSERT INTO ${this.name} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return res.rows[0];
  }

  async update(id, ch) {
    const ch2 = { ...ch, updated_at: new Date().toISOString() };
    for (let key in ch2) {
      if (typeof ch2[key] === 'object' && ch2[key] !== null && !(ch2[key] instanceof Date)) {
        ch2[key] = JSON.stringify(ch2[key]);
      }
    }
    const keys = Object.keys(ch2);
    if (keys.length === 0) return this.findById(id);
    const assignments = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...Object.values(ch2)];
    const res = await pool.query(
      `UPDATE ${this.name} SET ${assignments} WHERE id = $1 RETURNING *`,
      values
    );
    return res.rows[0] || null;
  }

  async delete(id) {
    const res = await pool.query(`DELETE FROM ${this.name} WHERE id = $1 RETURNING id`, [id]);
    return res.rowCount > 0;
  }

  async deleteWhere(w = {}) {
    const keys = Object.keys(w);
    if (keys.length === 0) {
      const res = await pool.query(`DELETE FROM ${this.name}`);
      return res.rowCount;
    }
    const conditions = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    const values = Object.values(w);
    const res = await pool.query(`DELETE FROM ${this.name} WHERE ${conditions}`, values);
    return res.rowCount;
  }

  async incr(id, f, d = 1) {
    const res = await pool.query(`UPDATE ${this.name} SET ${f} = COALESCE(${f}, 0) + $2 WHERE id = $1 RETURNING *`, [id, d]);
    return res.rows[0] || null;
  }
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(50) PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      full_name VARCHAR(255),
      student_id VARCHAR(50),
      faculty VARCHAR(255),
      year_of_study INTEGER,
      bio TEXT,
      avatar TEXT,
      role VARCHAR(50),
      is_volunteer BOOLEAN,
      is_banned BOOLEAN,
      ban_reason TEXT,
      teaching_rating FLOAT,
      reputation_score INTEGER,
      total_pairs INTEGER,
      badge_ids JSONB,
      profile_complete BOOLEAN,
      profile_views INTEGER DEFAULT 0,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS skills (
      id VARCHAR(50) PRIMARY KEY,
      user_id VARCHAR(50),
      subject VARCHAR(255),
      type VARCHAR(50),
      created_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pairs (
      id VARCHAR(50) PRIMARY KEY,
      requester_id VARCHAR(50),
      target_id VARCHAR(50),
      status VARCHAR(50),
      message TEXT,
      requester_confirmed BOOLEAN,
      target_confirmed BOOLEAN,
      completed_at TIMESTAMP,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id VARCHAR(50) PRIMARY KEY,
      pair_id VARCHAR(50),
      reviewer_id VARCHAR(50),
      reviewee_id VARCHAR(50),
      knowledge FLOAT,
      teaching FLOAT,
      attitude FLOAT,
      punctuality FLOAT,
      comment TEXT,
      created_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(50) PRIMARY KEY,
      sender_id VARCHAR(50),
      receiver_id VARCHAR(50),
      content TEXT,
      is_read BOOLEAN,
      created_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(50) PRIMARY KEY,
      user_id VARCHAR(50),
      type VARCHAR(50),
      title TEXT,
      body TEXT,
      ref_id VARCHAR(50),
      is_read BOOLEAN,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR(50) PRIMARY KEY,
      title TEXT,
      body TEXT,
      type VARCHAR(50),
      author_id VARCHAR(50),
      created_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id VARCHAR(50) PRIMARY KEY,
      reporter_id VARCHAR(50),
      reported_id VARCHAR(50),
      reason TEXT,
      detail TEXT,
      status VARCHAR(50),
      resolved_by VARCHAR(50),
      resolved_at TIMESTAMP,
      created_at TIMESTAMP,
      updated_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS logs (
      id VARCHAR(50) PRIMARY KEY,
      user_id VARCHAR(50),
      action VARCHAR(100),
      detail TEXT,
      created_at TIMESTAMP
    );
  `);
}

module.exports = {
  pool,
  init,
  users: new Table('users'),
  skills: new Table('skills'),
  pairs: new Table('pairs'),
  reviews: new Table('reviews'),
  messages: new Table('messages'),
  notifications: new Table('notifications'),
  announcements: new Table('announcements'),
  reports: new Table('reports'),
  logs: new Table('logs'),
};
