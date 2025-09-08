// ===== API base (set in docs/index.html) =====
const API_BASE = (window.API_BASE || 'https://auction-vscode.onrender.com').replace(/\/+$/, '');

// DOM
const itemsEl    = document.getElementById('items');
const refreshBtn = document.getElementById('refresh');

// Utils
const LAK = (n) => `₭ ${Number(n || 0).toLocaleString('en-US')}`;
const TIMEOUT_MS = 90000; // 90s for Render cold-starts
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJSON(path, options = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      ...options,
      signal: controller.signal
    });

    // Try to parse JSON; if not JSON, fall back to text
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      const txt = await res.text().catch(() => '');
      data = txt ? { message: txt } : null;
    }

    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;                 // allow retry logic to see status
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

// ===== Data calls =====
async function fetchItems() {
  return fetchJSON('/api/items');
}

async function bidItem(id, name, bidderId) {
  return fetchJSON(`/api/items/${id}/bid`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, bidderId })
  });
}

// ===== Rendering =====
function renderItems(items) {
  if (!items || !items.length) {
    itemsEl.innerHTML = '<p class="muted">No items yet. Add items in the backend (db.json).</p>';
    return;
  }
  itemsEl.innerHTML = items.map(renderCard).join('');
  attachCardHandlers();
}

function renderCard(item) {
  const img = (item.images && item.images[0]) || 'https://picsum.photos/seed/placeholder/800/500';

  const bidsCount = (item.bids || []).length;
  const last = bidsCount ? item.bids[bidsCount - 1] : null;
  const lastLabel = last ? `${last.name}${last.bidderId ? ' (' + last.bidderId + ')' : ''}` : '—';

  const statusColor = {
    'Available': 'status available',
    'Hold': 'status hold',
    'Sold out': 'status sold'
  }[item.status] || 'status';

  return `
    <article class="item-card" data-id="${item.id}">
      <img class="thumb" src="${img}" alt="${item.name}" />
      <div class="body">
        <div class="row between">
          <h3>${item.name}</h3>
          <span class="${statusColor}">${item.status}</span>
        </div>
        <p class="desc">${item.description || ''}</p>

        <div class="prices">
          <div><span class="label">Original</span><strong>${LAK(item.originalPrice)}</strong></div>
          <div><span class="label">Current</span><strong>${LAK(item.currentPrice)}</strong></div>
        </div>

        <div class="row wrap gap">
          <label class="inline">
            <span>Your ID</span>
            <input type="text" class="bidder-id" placeholder="Your ID" />
          </label>
          <label class="inline">
            <span>Your name</span>
            <input type="text" class="bidder-name" placeholder="Your name" />
          </label>

        <button class="btn bid" ${item.status !== 'Available' ? 'disabled' : ''}>Bid +100,000</button>
        </div>

        <div class="meta">
          <span class="muted">Bids: ${bidsCount} • Last bidder: ${lastLabel}</span>
        </div>

        ${renderThumbs(item.images)}
      </div>
    </article>
  `;
}

function renderThumbs(images = []) {
  if (!images.length) return '';
  const thumbs = images
    .map((src, i) => `<img data-src="${src}" class="mini" alt="img-${i}" src="${src}">`)
    .join('');
  return `<div class="thumbs">${thumbs}</div>`;
}

// ===== Handlers =====
function attachCardHandlers() {
  document.querySelectorAll('.item-card').forEach(card => {
    const id        = card.dataset.id;
    const bidBtn    = card.querySelector('.bid');
    const nameInput = card.querySelector('.bidder-name');
    const idInput   = card.querySelector('.bidder-id');
    const mainImg   = card.querySelector('.thumb');

    if (bidBtn) {
      bidBtn.addEventListener('click', async () => {
        const name     = nameInput?.value?.trim();
        const bidderId = idInput?.value?.trim();
        if (!name || !bidderId) {
          alert('Please enter your ID and name');
          return;
        }
        try {
          bidBtn.disabled = true;
          bidBtn.textContent = 'Bidding...';
          await bidItem(id, name, bidderId);
          await load(); // refresh list
        } catch (e) {
          alert(e.message || 'Bid failed');
        } finally {
          bidBtn.disabled = false;
          bidBtn.textContent = 'Bid +100,000';
        }
      });
    }

    // thumbnail switcher
    card.querySelectorAll('.mini').forEach(mini => {
      mini.addEventListener('click', () => { mainImg.src = mini.dataset.src; });
    });
  });
}

// ===== Retry helpers (cold start & transient errors) =====
function isTransient(err) {
  const msg = String(err?.message || '').toLowerCase();
  return err?.name === 'AbortError'
      || [429, 502, 503, 504].includes(err?.status)
      || /abort|timeout|network/.test(msg);
}

async function fetchWithRetry(path, options = {}, retries = 3, delayMs = 2000) {
  try {
    return await fetchJSON(path, options);
  } catch (e) {
    if (retries > 0 && isTransient(e)) {
      await sleep(delayMs);
      return fetchWithRetry(path, options, retries - 1, Math.min(delayMs * 1.5, 10000));
    }
    throw e;
  }
}

// ===== Page boot =====
async function load() {
  try {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Loading...';

    // Pre-warm the API (helps free tier cold starts)
    await fetch(`${API_BASE}/health`, { cache: 'no-store' }).catch(() => {});

    // Try up to 3 times to fetch items
    const items = await fetchWithRetry('/api/items', {}, 3);
    renderItems(items);
  } catch (e) {
    console.error('Load failed:', e);
    itemsEl.innerHTML = `<p class="error">Cannot load items: ${e.message || 'Network error'}</p>`;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
  }
}

refreshBtn?.addEventListener('click', load);
load();
