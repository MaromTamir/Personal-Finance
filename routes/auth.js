const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db/database');

const router = express.Router();

router.get('/status', (req, res) => {
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  res.json({
    authenticated: !!req.session?.authenticated,
    setup_required: !user,
  });
});

router.post('/setup', async (req, res) => {
  if (db.prepare('SELECT id FROM users LIMIT 1').get()) {
    return res.status(400).json({ error: 'Setup already complete' });
  }
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO users (password_hash) VALUES (?)').run(hash);
  req.session.authenticated = true;
  res.json({ success: true });
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return res.status(400).json({ error: 'Run setup first' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await bcrypt.compare('dummy', user.password_hash); // constant-time padding
    return res.status(401).json({ error: 'Invalid password' });
  }

  req.session.authenticated = true;
  db.prepare(`UPDATE users SET last_login=datetime('now') WHERE id=?`).run(user.id);
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('pf.sid');
    res.json({ success: true });
  });
});

router.post('/change-password', async (req, res) => {
  if (!req.session?.authenticated) return res.status(401).json({ error: 'Not authenticated' });
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();

  if (!(await bcrypt.compare(current_password, user.password_hash))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(
    await bcrypt.hash(new_password, 12), user.id
  );
  res.json({ success: true });
});

module.exports = router;
