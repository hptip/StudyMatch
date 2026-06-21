const fs = require('fs'), path = require('path');
const DATA = path.join(__dirname, '../data');
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

class Table {
  constructor(name) {
    this.file = path.join(DATA, `${name}.json`);
    this.rows = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
  }
  _save() { fs.writeFileSync(this.file, JSON.stringify(this.rows, null, 2)); }
  all() { return [...this.rows]; }
  findById(id) { return this.rows.find(r => r.id === id) || null; }
  findOne(w) { return this.find(w)[0] || null; }
  find(w = {}) { return this.rows.filter(r => Object.entries(w).every(([k, v]) => r[k] === v)); }
  count(w = {}) { return this.find(w).length; }
  insert(row) {
    const r = { created_at: new Date().toISOString(), ...row };
    this.rows.push(r); this._save(); return r;
  }
  update(id, ch) {
    const i = this.rows.findIndex(r => r.id === id);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i], ...ch, updated_at: new Date().toISOString() };
    this._save(); return this.rows[i];
  }
  delete(id) { const n = this.rows.length; this.rows = this.rows.filter(r => r.id !== id); this._save(); return this.rows.length < n; }
  deleteWhere(w) { const n = this.rows.length; this.rows = this.rows.filter(r => !Object.entries(w).every(([k, v]) => r[k] === v)); this._save(); return n - this.rows.length; }
  incr(id, f, d = 1) { const i = this.rows.findIndex(r => r.id === id); if (i < 0) return; this.rows[i][f] = (this.rows[i][f] || 0) + d; this._save(); }
}

module.exports = {
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
