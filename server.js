require('dotenv').config();

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ── Auto-generate missing secrets and persist them to .env ──────────────────
(function ensureSecrets() {
  const envPath = path.join(__dirname, '.env');
  let file = '';
  try { file = fs.readFileSync(envPath, 'utf8'); } catch (_) {}

  let changed = false;

  if (!process.env.SESSION_SECRET) {
    const v = crypto.randomBytes(32).toString('hex');
    process.env.SESSION_SECRET = v;
    file += `\nSESSION_SECRET=${v}`;
    changed = true;
  }
  if (!process.env.ENCRYPTION_KEY) {
    const v = crypto.randomBytes(32).toString('hex');
    process.env.ENCRYPTION_KEY = v;
    file += `\nENCRYPTION_KEY=${v}`;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(envPath, file.trimStart());
    console.log('  Generated and saved new secrets to .env');
  }
})();

const https        = require('https');
const express      = require('express');
const helmet       = require('helmet');
const session      = require('express-session');
const rateLimit    = require('express-rate-limit');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

const db           = require('./db/database');
const SQLiteStore  = require('./lib/session-store');
const { decrypt }  = require('./lib/crypto');
const { getCerts } = require('./lib/certs');

const app = express();

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json());

// ── Sessions ──────────────────────────────────────────────────────────────────
app.use(session({
  name:   'pf.sid',
  secret: process.env.SESSION_SECRET,
  store:  new SQLiteStore(db),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly:  true,
    sameSite:  'strict',
    secure:    true,
    maxAge:    8 * 3_600_000,
  },
}));

// ── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login.html');
}

// ── Plaid client ──────────────────────────────────────────────────────────────
if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
  console.warn('\n  WARNING: PLAID_CLIENT_ID and PLAID_SECRET not set in .env\n');
}
const plaidClient = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
      'PLAID-SECRET':    process.env.PLAID_SECRET    || '',
    },
  },
}));

// ── Public routes (no auth) ───────────────────────────────────────────────────
const authRouter = require('./routes/auth');
// Rate limit only the login endpoint
app.use('/api/auth/login', (req, res, next) => {
  if (req.method === 'POST') return loginLimiter(req, res, next);
  next();
});
app.use('/api/auth', authRouter);

// Static assets (CSS, JS, login/setup pages) — served without auth
// index: false prevents auto-serving index.html without auth
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ── Protected API routes ──────────────────────────────────────────────────────
const plaidRoutes = require('./routes/plaid');
app.use('/api/plaid',        requireAuth, plaidRoutes(plaidClient));
app.use('/api/accounts',     requireAuth, require('./routes/accounts'));
app.use('/api/transactions', requireAuth, require('./routes/transactions'));
app.use('/api/investments',  requireAuth, require('./routes/investments'));
app.use('/api/net-worth',    requireAuth, require('./routes/networth'));

app.post('/api/sync-all', requireAuth, async (req, res) => {
  const { syncItem } = require('./routes/plaid');
  const items = db.prepare('SELECT * FROM plaid_items').all();
  const results = [];
  for (const item of items) {
    try {
      await syncItem(plaidClient, item.id, decrypt(item.access_token));
      results.push({ institution: item.institution_name, success: true });
    } catch (e) {
      results.push({ institution: item.institution_name, success: false, error: e.message });
    }
  }
  res.json({ synced: results.length, results });
});

// ── Protected app shell ───────────────────────────────────────────────────────
app.get('*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT  = process.env.PORT || 3002;
const tls   = getCerts();

https.createServer(tls, app).listen(PORT, () => {
  console.log(`\n  Personal Finance Dashboard`);
  console.log(`  https://localhost:${PORT}`);
  console.log(`  Plaid environment: ${process.env.PLAID_ENV || 'sandbox'}`);
  console.log(`  Tokens encrypted: yes (AES-256-GCM)\n`);
});
