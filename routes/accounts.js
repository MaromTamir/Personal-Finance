const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  const accounts = db.prepare(`
    SELECT a.*, pi.institution_name,
      l.type as liability_type, l.interest_rate, l.minimum_payment, l.next_payment_date,
      l.origination_principal, l.origination_date
    FROM accounts a
    JOIN plaid_items pi ON pi.id = a.item_id
    LEFT JOIN liabilities l ON l.account_id = a.id
    ORDER BY a.type, pi.institution_name, a.name
  `).all();

  const summary = db.prepare(`
    SELECT
      SUM(CASE WHEN type IN ('depository','investment') THEN COALESCE(balance_current,0) ELSE 0 END) as total_assets,
      SUM(CASE WHEN type IN ('credit','loan') THEN COALESCE(balance_current,0) ELSE 0 END) as total_liabilities,
      SUM(CASE WHEN type='depository' THEN COALESCE(balance_current,0) ELSE 0 END) as cash,
      SUM(CASE WHEN type='investment' THEN COALESCE(balance_current,0) ELSE 0 END) as investments,
      SUM(CASE WHEN type='credit' THEN COALESCE(balance_current,0) ELSE 0 END) as credit_debt,
      SUM(CASE WHEN type='loan' THEN COALESCE(balance_current,0) ELSE 0 END) as loan_debt
    FROM accounts
  `).get();

  res.json({ accounts, summary });
});

module.exports = router;
