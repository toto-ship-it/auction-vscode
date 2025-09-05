// --- Config --------------------------------------------------------------
/** Toggle add-item from ENV (default: false) */
const ALLOW_ADD = String(process.env.ALLOW_ADD || '').toLowerCase() === 'true';

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/** DB path: use ENV on Render (mounted disk), else local db.json */
const DB_PATH  = process.env.DB_PATH || path.join(__dirname, 'db.json');
/** Fixed bid step: 100,000 LAK */
const BID_STEP = 100000;
/** Optional CORS origin, e.g., "https://your-frontend.example" or "*" */
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '';


// --- Small helpers -------------------------------------------------------
async function loadDB() {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && Array.isArray(parsed.items))
        ? parsed
        : { items: [] };
    } catch {
      // corrupted JSON → reset to empty
      return { items: [] };
    }
  } catch (e) {
    if (e.code === 'ENOENT') {
      const empty = { items: [] };
      await fs.writeFile(DB_PATH, JSON.stringify(empty, null, 2));
      return empty;
    }
    throw e;
  }
}

async function saveDB(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

function sortByCreatedDesc(items) {
  return [...items].sort((a, b) => (Number(b.createdAt||0) - Number(a.createdAt||0)));
}


// --- App setup -----------------------------------------------------------
const app = express();
app.use(express.json());

// Optional CORS (only if you set ALLOW_ORIGIN)
if (ALLOW_ORIGIN) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

// Serve static UI from /public
app.use(express.static(path.join(__dirname, 'public')));

// Health / readiness
app.get('/health', (_req, res) => res.send('ok'));
app.get('/api/health', (_req, res) => res.json({ ok: true }));


// --- API routes ----------------------------------------------------------

// List items
app.get('/api/items', async (_req, res, next) => {
  try {
    const db = await loadDB();
    res.json(sortByCreatedDesc(db.items));
  } catch (err) { next(err); }
});

// Get one item
app.get('/api/items/:id', async (req, res, next) => {
  try {
    const db = await loadDB();
    const item = db.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) { next(err); }
});

// Add new item (disabled by default; enable with ALLOW_ADD=true)
app.post('/api/items', async (req, res, next) => {
  try {
    if (!ALLOW_ADD) {
      return res.status(403).json({ error: 'Adding items is disabled' });
    }
    const { name, description = '', images = [], originalPrice = 0, status = 'Available' } = req.body || {};
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'name is required' });
    }

    const imgs = Array.isArray(images)
      ? images
      : String(images).split(',').map(s => s.trim()).filter(Boolean);

    const now = Date.now();
    const item = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      description: String(description || ''),
      images: imgs,
      originalPrice: Number(originalPrice) || 0,
      currentPrice: Number(originalPrice) || 0,
      status: status || 'Available',
      bids: [],
      createdAt: now
    };

    const db = await loadDB();
    db.items.push(item);
    await saveDB(db);
    res.json(item);
  } catch (err) { next(err); }
});

// Place a bid (+100,000 LAK each time) — requires name + bidderId
app.patch('/api/items/:id/bid', async (req, res, next) => {
  try {
    const { name, bidderId, user } = req.body || {};
    const bidderName = (name ?? user ?? '').toString().trim();
    const bidderID   = (bidderId ?? '').toString().trim();

    if (!bidderName || !bidderID) {
      return res.status(400).json({ error: 'name and bidderId are required' });
    }

    const db = await loadDB();
    const item = db.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.status && item.status !== 'Available') {
      return res.status(400).json({ error: 'Item is not available for bidding' });
    }

    item.currentPrice = Number(item.currentPrice || 0) + BID_STEP;

    const bid = {
      name: bidderName,
      bidderId: bidderID,
      amount: item.currentPrice,
      time: Date.now()
    };

    item.bids = Array.isArray(item.bids) ? item.bids : [];
    item.bids.push(bid);
    item.lastBidder = { name: bidderName, bidderId: bidderID };

    await saveDB(db);
    res.json(item);
  } catch (err) { next(err); }
});


// --- SPA fallback (serve index.html for non-API GETs) --------------------
app.get('*', (req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) return next();
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath);
});


// --- Error handler -------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal Server Error' });
});


// --- Start ---------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Auction app running → http://localhost:${PORT}`);
});
