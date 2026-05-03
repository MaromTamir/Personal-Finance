const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const { account_id, category, search, start_date, end_date, limit = 50, offset = 0 } = req.query;

  let where = 'WHERE 1=1';
  const params = [];

  if (account_id)  { where += ' AND t.account_id=?';  params.push(account_id); }
  if (category)    { where += ' AND t.category=?';    params.push(category); }
  if (start_date)  { where += ' AND t.date>=?';       params.push(start_date); }
  if (end_date)    { where += ' AND t.date<=?';       params.push(end_date); }
  if (search)      { where += ' AND (t.name LIKE ? OR t.merchant_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const rows = db.prepare(`
    SELECT t.*, a.name as account_name, a.type as account_type, pi.institution_name
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN plaid_items pi ON pi.id = a.item_id
    ${where}
    ORDER BY t.date DESC, t.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), parseInt(offset));

  const { total } = db.prepare(`
    SELECT COUNT(*) as total FROM transactions t ${where}
  `).get(...params);

  res.json({ transactions: rows, total });
});

router.get('/summary', (req, res) => {
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const start = req.query.start_date || thirtyAgo.toISOString().slice(0, 10);
  const end   = req.query.end_date   || new Date().toISOString().slice(0, 10);

  const byCategory = db.prepare(`
    SELECT category, SUM(amount) as total, COUNT(*) as count
    FROM transactions
    WHERE date BETWEEN ? AND ? AND pending=0 AND amount > 0
    GROUP BY category
    ORDER BY total DESC
  `).all(start, end);

  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as spending,
      SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as income
    FROM transactions
    WHERE date >= date('now','-12 months') AND pending=0
    GROUP BY month
    ORDER BY month
  `).all();

  res.json({ byCategory, monthly, period: { start, end } });
});

module.exports = router;
