const express = require('express');
const { Products, CountryCode } = require('plaid');
const db = require('../db/database');
const { encrypt, decrypt } = require('../lib/crypto');

async function syncItem(plaidClient, itemId, accessToken) {
  // Sync account balances
  try {
    const { data } = await plaidClient.accountsGet({ access_token: accessToken });
    for (const acct of data.accounts) {
      db.prepare(`
        INSERT OR REPLACE INTO accounts
          (id, item_id, name, official_name, type, subtype,
           balance_current, balance_available, balance_limit, mask, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
      `).run(
        acct.account_id, itemId, acct.name, acct.official_name,
        acct.type, acct.subtype,
        acct.balances.current, acct.balances.available, acct.balances.limit,
        acct.mask
      );
    }
  } catch (e) {
    console.error('accounts sync error:', e.response?.data?.error_message || e.message);
  }

  // Sync transactions via cursor-based sync
  try {
    const item = db.prepare('SELECT transaction_cursor FROM plaid_items WHERE id=?').get(itemId);
    let cursor = item?.transaction_cursor || null;
    let hasMore = true;

    while (hasMore) {
      const params = { access_token: accessToken };
      if (cursor) params.cursor = cursor;

      const { data } = await plaidClient.transactionsSync(params);

      for (const txn of data.added) {
        db.prepare(`
          INSERT OR IGNORE INTO transactions
            (id, account_id, amount, date, name, merchant_name, category, subcategory, pending, currency, logo_url)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          txn.transaction_id, txn.account_id, txn.amount, txn.date,
          txn.name, txn.merchant_name,
          txn.personal_finance_category?.primary || (txn.category?.[0] ?? null),
          txn.personal_finance_category?.detailed || (txn.category?.[1] ?? null),
          txn.pending ? 1 : 0,
          txn.iso_currency_code || 'USD',
          txn.logo_url || null
        );
      }
      for (const txn of data.modified) {
        db.prepare(`
          UPDATE transactions SET amount=?,date=?,name=?,merchant_name=?,category=?,subcategory=?,pending=?
          WHERE id=?
        `).run(
          txn.amount, txn.date, txn.name, txn.merchant_name,
          txn.personal_finance_category?.primary || (txn.category?.[0] ?? null),
          txn.personal_finance_category?.detailed || (txn.category?.[1] ?? null),
          txn.pending ? 1 : 0, txn.transaction_id
        );
      }
      for (const txn of data.removed) {
        db.prepare('DELETE FROM transactions WHERE id=?').run(txn.transaction_id);
      }

      cursor = data.next_cursor;
      hasMore = data.has_more;
    }

    db.prepare('UPDATE plaid_items SET transaction_cursor=? WHERE id=?').run(cursor, itemId);
  } catch (e) {
    console.error('transactions sync error:', e.response?.data?.error_message || e.message);
  }

  // Sync investment holdings
  try {
    const { data } = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });
    const secMap = {};
    for (const s of data.securities) secMap[s.security_id] = s;

    for (const h of data.holdings) {
      const sec = secMap[h.security_id] || {};
      db.prepare(`
        INSERT OR REPLACE INTO investment_holdings
          (account_id, security_id, ticker_symbol, name, quantity, institution_price,
           close_price, market_value, cost_basis, type, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
      `).run(
        h.account_id, h.security_id, sec.ticker_symbol, sec.name,
        h.quantity, h.institution_price, sec.close_price,
        h.institution_value, h.cost_basis, sec.type
      );
    }
  } catch (e) {
    if (!e.response?.data?.error_code?.includes('PRODUCTS_NOT_SUPPORTED') &&
        !e.response?.data?.error_code?.includes('NO_INVESTMENT')) {
      console.error('investments sync error:', e.response?.data?.error_message || e.message);
    }
  }

  // Sync liabilities (credit cards, mortgages, student/auto loans)
  try {
    const { data } = await plaidClient.liabilitiesGet({ access_token: accessToken });
    const { credit = [], mortgage = [], student = [] } = data.liabilities;

    for (const c of credit) {
      db.prepare(`INSERT OR REPLACE INTO liabilities (account_id,type,interest_rate,outstanding_balance,minimum_payment,next_payment_date)
        VALUES (?,'credit',?,?,?,?)`).run(
        c.account_id, c.aprs?.[0]?.apr_percentage ?? null,
        c.last_statement_balance, c.minimum_payment_amount, c.next_payment_due_date
      );
    }
    for (const m of mortgage) {
      db.prepare(`INSERT OR REPLACE INTO liabilities (account_id,type,interest_rate,outstanding_balance,minimum_payment,origination_principal,origination_date)
        VALUES (?,'mortgage',?,?,?,?,?)`).run(
        m.account_id, m.interest_rate?.percentage ?? null,
        m.outstanding_principal_balance, m.next_monthly_payment,
        m.origination_principal_amount, m.origination_date
      );
    }
    for (const s of student) {
      db.prepare(`INSERT OR REPLACE INTO liabilities (account_id,type,interest_rate,outstanding_balance,minimum_payment,origination_principal,origination_date)
        VALUES (?,'student',?,?,?,?,?)`).run(
        s.account_id, s.interest_rate_percentage ?? null,
        s.outstanding_interest_amount, s.minimum_payment_amount,
        s.origination_principal_amount, s.origination_date
      );
    }
  } catch (e) {
    if (!e.response?.data?.error_code?.includes('PRODUCTS_NOT_SUPPORTED')) {
      console.error('liabilities sync error:', e.response?.data?.error_message || e.message);
    }
  }

  db.prepare(`UPDATE plaid_items SET last_synced=datetime('now') WHERE id=?`).run(itemId);

  // Snapshot net worth
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN type IN ('depository','investment') THEN COALESCE(balance_current,0) ELSE 0 END) as assets,
      SUM(CASE WHEN type IN ('credit','loan') THEN COALESCE(balance_current,0) ELSE 0 END) as liabilities
    FROM accounts
  `).get();
  const assets = row?.assets || 0;
  const liabilities = row?.liabilities || 0;
  db.prepare(`
    INSERT OR REPLACE INTO net_worth_snapshots (total_assets, total_liabilities, net_worth, snapshot_date)
    VALUES (?,?,?,date('now'))
  `).run(assets, liabilities, assets - liabilities);
}

module.exports = (plaidClient) => {
  const router = express.Router();

  router.post('/create-link-token', async (req, res) => {
    try {
      const { data } = await plaidClient.linkTokenCreate({
        user: { client_user_id: 'personal-finance-user' },
        client_name: 'Personal Finance',
        products: [Products.Transactions, Products.Investments, Products.Liabilities],
        country_codes: [CountryCode.Us],
        language: 'en',
      });
      res.json({ link_token: data.link_token });
    } catch (e) {
      console.error(e.response?.data || e.message);
      res.status(500).json({ error: 'Could not create link token. Check your Plaid credentials in .env' });
    }
  });

  router.post('/exchange-token', async (req, res) => {
    const { public_token } = req.body;
    try {
      const exchange = await plaidClient.itemPublicTokenExchange({ public_token });
      const { access_token, item_id } = exchange.data;

      const itemRes = await plaidClient.itemGet({ access_token });
      const institutionId = itemRes.data.item.institution_id;
      let institutionName = 'Unknown Institution';

      if (institutionId) {
        try {
          const instRes = await plaidClient.institutionsGetById({
            institution_id: institutionId,
            country_codes: [CountryCode.Us],
          });
          institutionName = instRes.data.institution.name;
        } catch (_) {}
      }

      db.prepare(`
        INSERT OR REPLACE INTO plaid_items (id, access_token, institution_name, institution_id)
        VALUES (?,?,?,?)
      `).run(item_id, encrypt(access_token), institutionName, institutionId);

      await syncItem(plaidClient, item_id, access_token);
      res.json({ success: true, institution: institutionName });
    } catch (e) {
      console.error(e.response?.data || e.message);
      res.status(500).json({ error: e.response?.data?.error_message || 'Failed to connect account' });
    }
  });

  router.post('/sync/:itemId', async (req, res) => {
    const item = db.prepare('SELECT * FROM plaid_items WHERE id=?').get(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    try {
      await syncItem(plaidClient, item.id, decrypt(item.access_token));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/items', (req, res) => {
    const items = db.prepare(`
      SELECT pi.id, pi.institution_name, pi.institution_id, pi.last_synced, pi.created_at,
        COUNT(a.id) as account_count
      FROM plaid_items pi
      LEFT JOIN accounts a ON a.item_id = pi.id
      GROUP BY pi.id
      ORDER BY pi.institution_name
    `).all();
    res.json(items);
  });

  router.delete('/items/:id', async (req, res) => {
    const item = db.prepare('SELECT * FROM plaid_items WHERE id=?').get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    try {
      await plaidClient.itemRemove({ access_token: decrypt(item.access_token) });
    } catch (_) {}
    db.prepare('DELETE FROM plaid_items WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  return router;
};

module.exports.syncItem = syncItem;
