const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'finance.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS plaid_items (
    id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    institution_name TEXT,
    institution_id TEXT,
    transaction_cursor TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_synced TEXT
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
    name TEXT,
    official_name TEXT,
    type TEXT,
    subtype TEXT,
    balance_current REAL DEFAULT 0,
    balance_available REAL,
    balance_limit REAL,
    currency TEXT DEFAULT 'USD',
    mask TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount REAL,
    date TEXT,
    name TEXT,
    merchant_name TEXT,
    category TEXT,
    subcategory TEXT,
    pending INTEGER DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    logo_url TEXT
  );

  CREATE TABLE IF NOT EXISTS investment_holdings (
    account_id TEXT NOT NULL,
    security_id TEXT NOT NULL,
    ticker_symbol TEXT,
    name TEXT,
    quantity REAL,
    institution_price REAL,
    close_price REAL,
    market_value REAL,
    cost_basis REAL,
    type TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, security_id)
  );

  CREATE TABLE IF NOT EXISTS liabilities (
    account_id TEXT PRIMARY KEY,
    type TEXT,
    interest_rate REAL,
    outstanding_balance REAL,
    minimum_payment REAL,
    next_payment_date TEXT,
    origination_principal REAL,
    origination_date TEXT
  );

  CREATE TABLE IF NOT EXISTS net_worth_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_assets REAL DEFAULT 0,
    total_liabilities REAL DEFAULT 0,
    net_worth REAL DEFAULT 0,
    snapshot_date TEXT DEFAULT (date('now')),
    UNIQUE(snapshot_date)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire INTEGER NOT NULL
  );
`);

module.exports = db;
