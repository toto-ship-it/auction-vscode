// Read-only UI from the web: creating items is disabled here
const ALLOW_ADD = false;

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ✅ allow override via environment variable for deploys
const DB_PATH  = process.env.DB_PATH || path.join(__dirname, 'db.json');
const BID_STEP = 100000; // LAK increment per bid

async function loadDB() {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8');
    try {
      const parsed = JSON.parse(raw);
      // ensure shape
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
        return { items: [] };
      }
      return parsed;
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

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// List items
app.get('/api/items', async (_req, res) => {
  const db = await loadDB();
  const items = [...db.items].sort((a, b) => b.createdAt - a.createdAt);
  res.json(items);
});

// Add new item (disabled from web)
app.post('/api/items', async (req, res) => {
  if (!ALLOW_ADD) {
    return res.status(403).json({ error: 'Adding items is disabled' });
  }
  const { name, description = '', images = [], originalPrice = 0, status = 'Available' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const imgs = Array.isArray(images)
    ? images
    : String(images).split(',').map(s => s.trim()).filter(Boolean);

  const item = {
    id: crypto.randomUUID(),
    name,
    description,
    images: imgs,
    originalPrice: Number(originalPrice) || 0,
    currentPrice: Number(originalPrice) || 0,
    status: status || 'Available',
    bids: [],
    createdAt: Date.now()
  };

  const db = await loadDB();
  db.items.push(item);
  await saveDB(db);
  res.json(item);
});

// Place a bid (+100,000 LAK each time) — requires name + bidderId
app.patch('/api/items/:id/bid', async (req, res) => {
  const { name, bidderId, user } = req.body || {};
  const bidderName = (name ?? user ?? '').trim();
  const bidderID   = String(bidderId ?? '').trim();

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
});

// NOTE: status update and delete endpoints have been removed (read-only from web)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auction app running → http://localhost:${PORT}`);
});
