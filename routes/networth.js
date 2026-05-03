const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const current = db.prepare(`
    SELECT
      SUM(CASE WHEN type IN ('depository','investment') THEN COALESCE(balance_current,0) ELSE 0 END) as total_assets,
      SUM(CASE WHEN type IN ('credit','loan') THEN COALESCE(balance_current,0) ELSE 0 END) as total_liabilities
    FROM accounts
  `).get();

  const assets      = current?.total_assets      || 0;
  const liabilities = current?.total_liabilities || 0;

  const history = db.prepare(`
    SELECT snapshot_date, total_assets, total_liabilities, net_worth
    FROM net_worth_snapshots
    ORDER BY snapshot_date DESC
    LIMIT 90
  `).all().reverse();

  const byType = db.prepare(`
    SELECT type, subtype, SUM(COALESCE(balance_current,0)) as total
    FROM accounts
    GROUP BY type, subtype
    ORDER BY type, total DESC
  `).all();

  res.json({
    current: { assets, liabilities, net_worth: assets - liabilities },
    history,
    byType,
  });
});

module.exports = router;
