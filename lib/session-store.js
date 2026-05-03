const { Store } = require('express-session');

// SQLite-backed session store — sessions survive server restarts
class SQLiteStore extends Store {
  constructor(db) {
    super();
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid     TEXT PRIMARY KEY,
        sess    TEXT NOT NULL,
        expire  INTEGER NOT NULL
      )
    `);
    db.prepare('DELETE FROM sessions WHERE expire < ?').run(Date.now());
    setInterval(() => db.prepare('DELETE FROM sessions WHERE expire < ?').run(Date.now()), 300_000);
    this.db = db;
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT sess, expire FROM sessions WHERE sid=?').get(sid);
      if (!row || row.expire < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try {
      const expire = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + 8 * 3_600_000;
      this.db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?,?,?)').run(
        sid, JSON.stringify(sess), expire
      );
      cb(null);
    } catch (e) { cb(e); }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid=?').run(sid);
      cb(null);
    } catch (e) { cb(e); }
  }
}

module.exports = SQLiteStore;
