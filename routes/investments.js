const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const holdings = db.prepare(`
    SELECT ih.*, a.name as account_name, pi.institution_name
    FROM investment_holdings ih
    JOIN accounts a ON a.id = ih.account_id
    JOIN plaid_items pi ON pi.id = a.item_id
    ORDER BY ih.market_value DESC NULLS LAST
  `).all();

  const totalValue    = holdings.reduce((s, h) => s + (h.market_value  || 0), 0);
  const totalCost     = holdings.reduce((s, h) => s + (h.cost_basis    || 0), 0);
  const totalGain     = totalValue - totalCost;
  const gainPercent   = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  const byType = {};
  for (const h of holdings) {
    const t = h.type || 'other';
    byType[t] = (byType[t] || 0) + (h.market_value || 0);
  }

  res.json({ holdings, totalValue, totalCost, totalGain, gainPercent, byType });
});

module.exports = router;
