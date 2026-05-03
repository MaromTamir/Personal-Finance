// ─── Helpers ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) { window.location.href = '/login.html'; return null; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function fmt(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const str = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs);
  return n < 0 ? `-${str}` : str;
}

function fmtFull(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtPct(n) {
  if (n == null) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
}

let toastTimer;
function toast(msg, type = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function categoryEmoji(cat) {
  const map = {
    FOOD_AND_DRINK: '🍔', TRAVEL: '✈️', SHOPS: '🛍️', RECREATION: '🎉',
    SERVICE: '🔧', HEALTHCARE: '💊', TRANSFER: '💸', PAYMENT: '💳',
    BANK_FEES: '🏦', INCOME: '💰', GENERAL_MERCHANDISE: '🛒', TRANSPORTATION: '🚗',
    RENT_AND_UTILITIES: '🏠', PERSONAL_CARE: '💅', ENTERTAINMENT: '🎬',
    GENERAL_SERVICES: '⚙️', GOVERNMENT_AND_NON_PROFIT: '🏛️', LOAN_PAYMENTS: '📋',
  };
  return map[cat] || '💳';
}

// ─── Charts ──────────────────────────────────────────────────────────────────

const charts = {};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function makeNetworthChart(history) {
  destroyChart('nw');
  const canvas = $('networth-chart');
  if (!canvas) return;
  if (!history.length) { canvas.parentElement.innerHTML = '<div class="empty"><p>No history yet — connect an account and sync to see your net worth trend.</p></div>'; return; }

  const labels = history.map(h => {
    const d = new Date(h.snapshot_date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  charts.nw = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Net Worth',
          data: history.map(h => h.net_worth),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,.1)',
          borderWidth: 2.5,
          fill: true,
          tension: .4,
          pointRadius: history.length < 15 ? 4 : 0,
          pointHoverRadius: 5,
        },
        {
          label: 'Assets',
          data: history.map(h => h.total_assets),
          borderColor: '#10b981',
          borderWidth: 1.5,
          borderDash: [4, 4],
          fill: false,
          tension: .4,
          pointRadius: 0,
        },
        {
          label: 'Liabilities',
          data: history.map(h => h.total_liabilities),
          borderColor: '#ef4444',
          borderWidth: 1.5,
          borderDash: [4, 4],
          fill: false,
          tension: .4,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 12 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 11 } } },
        y: {
          ticks: {
            font: { size: 11 },
            callback: v => '$' + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + 'k' : v),
          },
          grid: { color: '#f1f5f9' },
        },
      },
      interaction: { intersect: false, mode: 'index' },
    },
  });
}

function makeSpendingChart(byCategory) {
  destroyChart('sp');
  const canvas = $('spending-chart');
  if (!canvas) return;
  const top = byCategory.slice(0, 8);
  if (!top.length) { canvas.parentElement.innerHTML = '<div class="empty"><p>No spending data yet.</p></div>'; return; }

  charts.sp = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: top.map(c => c.category || 'Other'),
      datasets: [{
        data: top.map(c => c.total),
        backgroundColor: ['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4','#8b5cf6','#f97316','#64748b'],
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 }, padding: 8 } },
        tooltip: { callbacks: { label: ctx => ` ${fmtFull(ctx.parsed)}` } },
      },
      cutout: '62%',
    },
  });
}

function makeAllocationChart(byType) {
  destroyChart('al');
  const canvas = $('allocation-chart');
  if (!canvas) return;
  const entries = Object.entries(byType).filter(([, v]) => v > 0);
  if (!entries.length) { canvas.parentElement.innerHTML = '<div class="empty"><p>No investment data yet.</p></div>'; return; }

  charts.al = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: ['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4','#8b5cf6'],
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${fmtFull(ctx.parsed)}` } },
      },
      cutout: '60%',
    },
  });
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const [nw, txnSummary, recentTxns] = await Promise.all([
      api('/api/net-worth'),
      api('/api/transactions/summary'),
      api('/api/transactions?limit=8'),
    ]);

    $('m-networth').textContent    = fmt(nw.current.net_worth);
    $('m-assets').textContent      = fmt(nw.current.assets);
    $('m-liabilities').textContent = fmt(nw.current.liabilities);

    const spending30 = txnSummary.byCategory.reduce((s, c) => s + c.total, 0);
    $('m-spending').textContent = fmt(spending30);

    if (nw.history.length >= 2) {
      const prev = nw.history[nw.history.length - 2];
      const diff = nw.current.net_worth - prev.net_worth;
      $('m-networth-change').textContent = (diff >= 0 ? '▲ ' : '▼ ') + fmt(Math.abs(diff)) + ' vs yesterday';
      $('m-networth-change').style.color = diff >= 0 ? 'var(--green)' : 'var(--red)';
    }

    if (nw.history.length) {
      const last = new Date(nw.history[nw.history.length - 1].snapshot_date + 'T00:00:00');
      $('last-updated').textContent = 'Last updated ' + last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    makeNetworthChart(nw.history);
    makeSpendingChart(txnSummary.byCategory);
    renderRecentTxns(recentTxns.transactions);
  } catch (e) {
    console.error(e);
    toast('Error loading dashboard: ' + e.message, 'error');
  }
}

function renderRecentTxns(txns) {
  const el = $('recent-txns');
  if (!txns.length) { el.innerHTML = '<div class="empty"><p>No transactions yet. Connect an account to get started.</p></div>'; return; }
  el.innerHTML = txns.map(renderTxnRow).join('');
}

function renderTxnRow(t) {
  const isCredit = t.amount < 0;
  const icon = t.logo_url
    ? `<img src="${t.logo_url}" alt="">`
    : `<span>${categoryEmoji(t.category)}</span>`;
  return `
    <div class="txn-row">
      <div class="txn-icon">${icon}</div>
      <div class="txn-details">
        <div class="txn-name">${t.merchant_name || t.name}${t.pending ? '<span class="txn-pending">Pending</span>' : ''}</div>
        <div class="txn-meta">${t.account_name} · ${t.category || 'Other'}</div>
      </div>
      <div class="txn-date">${fmtDate(t.date)}</div>
      <div class="txn-amount ${isCredit ? 'credit' : 'debit'}">${isCredit ? '+' : ''}${fmtFull(Math.abs(t.amount))}</div>
    </div>
  `;
}

// ─── Accounts ────────────────────────────────────────────────────────────────

async function loadAccounts() {
  const el = $('accounts-content');
  el.innerHTML = '<div class="loading">Loading accounts…</div>';
  try {
    const { accounts, summary } = await api('/api/accounts');
    if (!accounts.length) {
      el.innerHTML = `<div class="empty"><h3>No accounts connected</h3><p>Connect your bank accounts to start tracking your finances.</p><button class="btn btn-primary" onclick="openPlaidLink()">+ Connect Account</button></div>`;
      return;
    }

    const groups = { depository: 'Cash & Checking', credit: 'Credit Cards', investment: 'Investments', loan: 'Loans', other: 'Other' };
    const grouped = {};
    for (const a of accounts) {
      const key = groups[a.type] ? a.type : 'other';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    }

    let html = '';
    for (const [type, label] of Object.entries(groups)) {
      if (!grouped[type]?.length) continue;
      html += `<div class="account-section"><div class="account-section-title">${label}</div><div class="account-grid">`;
      for (const a of grouped[type]) {
        html += renderAccountCard(a, type);
      }
      html += '</div></div>';
    }
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="empty"><p>Error: ${e.message}</p></div>`;
  }
}

function renderAccountCard(a, type) {
  const isCredit = type === 'credit';
  const utilPct = (isCredit && a.balance_limit) ? (a.balance_current / a.balance_limit * 100) : 0;
  const barClass = utilPct > 90 ? 'danger' : utilPct > 70 ? 'warn' : '';

  return `
    <div class="account-card">
      <div class="account-card-top">
        <div>
          <div class="account-name">${a.name}</div>
          <div class="account-institution">${a.institution_name}</div>
        </div>
        ${a.mask ? `<div class="account-mask">••${a.mask}</div>` : ''}
      </div>
      <div class="account-balance ${isCredit ? 'credit' : ''}">${fmtFull(a.balance_current ?? 0)}</div>
      <div class="account-balance-label">
        ${isCredit ? 'Current Balance' : type === 'investment' ? 'Portfolio Value' : type === 'loan' ? 'Remaining Balance' : 'Available Balance'}
        ${a.balance_available != null && !isCredit ? ` · ${fmtFull(a.balance_available)} available` : ''}
      </div>
      ${isCredit && a.balance_limit ? `
        <div class="credit-bar-wrap">
          <div class="credit-bar-labels">
            <span>${utilPct.toFixed(0)}% used</span>
            <span>Limit ${fmtFull(a.balance_limit)}</span>
          </div>
          <div class="credit-bar"><div class="credit-bar-fill ${barClass}" style="width:${Math.min(utilPct, 100)}%"></div></div>
        </div>
      ` : ''}
      ${a.minimum_payment ? `<div class="metric-sub" style="margin-top:10px">Min. payment: ${fmtFull(a.minimum_payment)}${a.next_payment_date ? ' · Due ' + fmtDate(a.next_payment_date) : ''}</div>` : ''}
      ${a.interest_rate ? `<div class="metric-sub">APR: ${a.interest_rate}%</div>` : ''}
    </div>
  `;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

let txnOffset = 0;
const TXN_LIMIT = 50;

async function loadTransactions() {
  txnOffset = 0;
  await fetchTransactions();
}

async function fetchTransactions() {
  const el = $('txn-list');
  const search = $('txn-search').value;
  const category = $('txn-category').value;
  const start = $('txn-start').value;
  const end = $('txn-end').value;

  const params = new URLSearchParams({ limit: TXN_LIMIT, offset: txnOffset });
  if (search) params.set('search', search);
  if (category) params.set('category', category);
  if (start) params.set('start_date', start);
  if (end) params.set('end_date', end);

  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { transactions, total } = await api(`/api/transactions?${params}`);

    if (!transactions.length && txnOffset === 0) {
      el.innerHTML = '<div class="empty"><p>No transactions found.</p></div>';
      $('txn-pagination').innerHTML = '';
      return;
    }

    el.innerHTML = transactions.map(renderTxnRow).join('');

    // Pagination
    const totalPages = Math.ceil(total / TXN_LIMIT);
    const currentPage = Math.floor(txnOffset / TXN_LIMIT) + 1;
    $('txn-pagination').innerHTML = `
      <button onclick="txnPrev()" ${txnOffset === 0 ? 'disabled' : ''}>← Prev</button>
      <span>${currentPage} of ${totalPages} (${total} total)</span>
      <button onclick="txnNext(${total})" ${txnOffset + TXN_LIMIT >= total ? 'disabled' : ''}>Next →</button>
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty"><p>Error: ${e.message}</p></div>`;
  }
}

function txnPrev() { txnOffset = Math.max(0, txnOffset - TXN_LIMIT); fetchTransactions(); }
function txnNext(total) { if (txnOffset + TXN_LIMIT < total) { txnOffset += TXN_LIMIT; fetchTransactions(); } }

async function populateCategoryFilter() {
  try {
    const { byCategory } = await api('/api/transactions/summary');
    const sel = $('txn-category');
    sel.innerHTML = '<option value="">All Categories</option>';
    for (const c of byCategory) {
      sel.innerHTML += `<option value="${c.category}">${c.category || 'Other'} (${fmt(c.total)})</option>`;
    }
  } catch (_) {}
}

// ─── Investments ──────────────────────────────────────────────────────────────

async function loadInvestments() {
  const metricsEl = $('invest-metrics');
  const holdingsEl = $('holdings-table');

  metricsEl.innerHTML = '<div class="loading">Loading…</div>';
  holdingsEl.innerHTML = '';
  try {
    const data = await api('/api/investments');
    const { holdings, totalValue, totalCost, totalGain, gainPercent, byType } = data;

    metricsEl.innerHTML = `
      <div class="metric-card"><div class="metric-label">Portfolio Value</div><div class="metric-value">${fmt(totalValue)}</div></div>
      <div class="metric-card"><div class="metric-label">Total Cost Basis</div><div class="metric-value">${fmt(totalCost)}</div></div>
      <div class="metric-card"><div class="metric-label">Total Gain / Loss</div>
        <div class="metric-value ${totalGain >= 0 ? 'green' : 'red'}">${totalGain >= 0 ? '+' : ''}${fmt(totalGain)}</div>
        <div class="metric-sub">${fmtPct(gainPercent)}</div>
      </div>
      <div class="metric-card"><div class="metric-label">Positions</div><div class="metric-value">${holdings.length}</div></div>
    `;

    makeAllocationChart(byType);

    if (!holdings.length) {
      holdingsEl.innerHTML = '<div class="empty"><p>No investment holdings found. Connect a brokerage account.</p></div>';
      return;
    }

    holdingsEl.innerHTML = `
      <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>Name / Ticker</th><th>Account</th><th>Qty</th>
          <th>Price</th><th>Market Value</th><th>Cost Basis</th><th>Gain / Loss</th>
        </tr></thead>
        <tbody>
          ${holdings.map(h => {
            const gain = (h.market_value || 0) - (h.cost_basis || 0);
            const gainPct = h.cost_basis ? (gain / h.cost_basis * 100) : null;
            return `<tr>
              <td><div style="font-weight:600">${h.name || '—'}</div>${h.ticker_symbol ? `<div style="font-size:11px;color:var(--text-muted)">${h.ticker_symbol}</div>` : ''}</td>
              <td style="color:var(--text-muted);font-size:12px">${h.account_name}<br>${h.institution_name}</td>
              <td>${h.quantity != null ? h.quantity.toFixed(4) : '—'}</td>
              <td>${fmtFull(h.institution_price)}</td>
              <td style="font-weight:600">${fmtFull(h.market_value)}</td>
              <td>${fmtFull(h.cost_basis)}</td>
              <td class="${gain >= 0 ? 'gain' : 'loss'}">${gain >= 0 ? '+' : ''}${fmtFull(gain)}${gainPct != null ? `<br><small>${fmtPct(gainPct)}</small>` : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
    `;
  } catch (e) {
    metricsEl.innerHTML = `<div class="empty"><p>Error: ${e.message}</p></div>`;
  }
}

// ─── Debts ───────────────────────────────────────────────────────────────────

async function loadDebts() {
  const el = $('debts-content');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { accounts } = await api('/api/accounts');
    const debtAccounts = accounts.filter(a => a.type === 'credit' || a.type === 'loan');

    if (!debtAccounts.length) {
      el.innerHTML = '<div class="empty"><h3>No debts found</h3><p>Connect accounts with loans or credit cards to track them here.</p></div>';
      return;
    }

    const totalDebt = debtAccounts.reduce((s, a) => s + (a.balance_current || 0), 0);
    const totalMinPayment = debtAccounts.reduce((s, a) => s + (a.minimum_payment || 0), 0);

    el.innerHTML = `
      <div class="metric-grid" style="margin-bottom:20px">
        <div class="metric-card"><div class="metric-label">Total Debt</div><div class="metric-value red">${fmt(totalDebt)}</div></div>
        <div class="metric-card"><div class="metric-label">Min. Monthly Payments</div><div class="metric-value">${fmt(totalMinPayment)}</div></div>
        <div class="metric-card"><div class="metric-label">Accounts</div><div class="metric-value">${debtAccounts.length}</div></div>
      </div>
      <div class="debt-grid">
        ${debtAccounts.map(a => renderDebtCard(a)).join('')}
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty"><p>Error: ${e.message}</p></div>`;
  }
}

function renderDebtCard(a) {
  const type = a.liability_type || a.subtype || a.type;
  const badgeClass = type === 'mortgage' ? 'mortgage' : type === 'student' ? 'student' : (type === 'auto' || type === 'car') ? 'auto' : '';
  const paidOff = a.origination_principal ? Math.max(0, a.origination_principal - (a.balance_current || 0)) : null;
  const paidPct = (paidOff != null && a.origination_principal) ? (paidOff / a.origination_principal * 100) : null;

  return `
    <div class="debt-card">
      <div class="debt-type-badge ${badgeClass}">${type || 'debt'}</div>
      <div class="debt-name">${a.name}</div>
      <div class="debt-institution">${a.institution_name}${a.mask ? ' ••' + a.mask : ''}</div>
      <div class="debt-balance">${fmtFull(a.balance_current)}</div>
      <div class="debt-details">
        ${a.interest_rate ? `<span>Interest rate: <strong>${a.interest_rate}%</strong></span>` : ''}
        ${a.minimum_payment ? `<span>Min. payment: <strong>${fmtFull(a.minimum_payment)}</strong></span>` : ''}
        ${a.next_payment_date ? `<span>Next due: <strong>${fmtDate(a.next_payment_date)}</strong></span>` : ''}
        ${a.origination_principal ? `<span>Original amount: <strong>${fmtFull(a.origination_principal)}</strong></span>` : ''}
      </div>
      ${paidPct != null ? `
        <div class="debt-progress">
          <div class="progress-labels">
            <span>${paidPct.toFixed(0)}% paid off</span>
            <span>${fmtFull(paidOff)} paid</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(paidPct, 100)}%"></div></div>
        </div>
      ` : ''}
    </div>
  `;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  const el = $('institutions-list');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const items = await api('/api/plaid/items');
    if (!items.length) {
      el.innerHTML = '<div class="empty"><p>No accounts connected yet. Click <strong>+ Connect Account</strong> to get started.</p></div>';
      return;
    }

    el.innerHTML = items.map(item => `
      <div class="institution-row">
        <div class="institution-info">
          <div class="institution-name">${item.institution_name}</div>
          <div class="institution-meta">
            ${item.account_count} account${item.account_count !== 1 ? 's' : ''}
            · Connected ${fmtDate(item.created_at?.slice(0,10))}
            ${item.last_synced ? ' · Last synced ' + new Date(item.last_synced).toLocaleString('en-US', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''}
          </div>
        </div>
        <div class="institution-actions">
          <button class="btn btn-ghost btn-sm" onclick="syncItem('${item.id}', this)">Sync</button>
          <button class="btn btn-danger btn-sm" onclick="disconnectItem('${item.id}', '${item.institution_name}', this)">Disconnect</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = `<div class="empty"><p>Error: ${e.message}</p></div>`;
  }
}

async function syncItem(itemId, btn) {
  const orig = btn.textContent;
  btn.textContent = '⟳ Syncing…';
  btn.disabled = true;
  try {
    await api(`/api/plaid/sync/${itemId}`, 'POST');
    toast('Synced successfully', 'success');
    await loadSettings();
  } catch (e) {
    toast('Sync failed: ' + e.message, 'error');
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

async function disconnectItem(itemId, name, btn) {
  if (!confirm(`Disconnect ${name}? All associated data will be removed.`)) return;
  btn.disabled = true;
  try {
    await api(`/api/plaid/items/${itemId}`, 'DELETE');
    toast(`${name} disconnected`, 'success');
    await loadSettings();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false;
  }
}

// ─── Plaid Link ───────────────────────────────────────────────────────────────

async function openPlaidLink() {
  try {
    const { link_token } = await api('/api/plaid/create-link-token', 'POST');

    const handler = Plaid.create({
      token: link_token,
      onSuccess: async (public_token, metadata) => {
        toast('Connecting account…');
        try {
          const result = await api('/api/plaid/exchange-token', 'POST', { public_token });
          toast(`${result.institution} connected!`, 'success');
          loadCurrentPage();
        } catch (e) {
          toast('Error: ' + e.message, 'error');
        }
      },
      onExit: (err) => {
        if (err) toast('Connection error: ' + err.display_message, 'error');
      },
    });

    handler.open();
  } catch (e) {
    toast('Could not open Plaid Link. Check your API keys in .env: ' + e.message, 'error');
  }
}

// ─── Sync All ─────────────────────────────────────────────────────────────────

async function syncAll() {
  const btn = $('sync-btn');
  btn.textContent = '⟳ Syncing…';
  btn.disabled = true;
  try {
    const result = await api('/api/sync-all', 'POST');
    toast(`Synced ${result.synced} institution${result.synced !== 1 ? 's' : ''}`, 'success');
    loadCurrentPage();
  } catch (e) {
    toast('Sync error: ' + e.message, 'error');
  } finally {
    btn.textContent = 'Sync All';
    btn.disabled = false;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

let currentPage = 'dashboard';

function loadCurrentPage() {
  switch (currentPage) {
    case 'dashboard':    return loadDashboard();
    case 'accounts':     return loadAccounts();
    case 'transactions': return fetchTransactions();
    case 'investments':  return loadInvestments();
    case 'debts':        return loadDebts();
    case 'settings':     return loadSettings();
  }
}

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.remove('hidden');

  const navEl = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  currentPage = page;
  window.location.hash = page;
  loadCurrentPage();
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    navigate(link.dataset.page);
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

async function changePassword(e) {
  e.preventDefault();
  const errEl = $('pw-error');
  const okEl  = $('pw-success');
  const btn   = $('cp-btn');
  errEl.style.display = 'none';
  okEl.style.display  = 'none';

  const current = $('cp-current').value;
  const next    = $('cp-new').value;
  const confirm = $('cp-confirm').value;

  if (next !== confirm) {
    errEl.textContent = 'New passwords do not match.';
    errEl.style.display = 'block';
    return;
  }

  btn.textContent = 'Updating…';
  btn.disabled = true;
  try {
    await api('/api/auth/change-password', 'POST', { current_password: current, new_password: next });
    okEl.style.display = 'block';
    e.target.reset();
  } catch (ex) {
    errEl.textContent = ex.message;
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Update Password';
    btn.disabled = false;
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  // Verify session is still valid before rendering anything
  const status = await fetch('/api/auth/status').then(r => r.json()).catch(() => null);
  if (!status) return;
  if (status.setup_required) { window.location.href = '/setup.html'; return; }
  if (!status.authenticated) { window.location.href = '/login.html'; return; }

  const hash = window.location.hash.replace('#', '');
  const startPage = ['dashboard','accounts','transactions','investments','debts','settings'].includes(hash) ? hash : 'dashboard';
  navigate(startPage);

  populateCategoryFilter();
});
