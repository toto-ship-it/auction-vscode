// data/export-to-excel.js
// Exports 2 sheets (Items, Bids) from db.json with better ordering, widths & formats.

import xlsx from 'xlsx';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_PATH       = path.join(__dirname, '..', 'db.json');
const XLSX_OUT      = path.join(__dirname, 'auction-export.xlsx');
const CSV_BIDS_OUT  = path.join(__dirname, 'bids-export.csv');

// ---------- helpers ----------
const toISO = (ts) => (ts ? new Date(ts).toISOString() : '');
const asCSV = (arr) => (arr || []).join(', ');
const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Set Excel column widths based on max text length (rough heuristic). */
function autoFitColumns(ws, headerKeys) {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = xlsx.utils.decode_range(ref);
  const widths = new Array(headerKeys.length).fill(10);

  for (let C = 0; C < headerKeys.length; C++) {
    const header = headerKeys[C];
    widths[C] = Math.max(widths[C], String(header).length + 2);
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const cell = ws[xlsx.utils.encode_cell({ r: R, c: C })];
      const txt = cell?.w ?? cell?.v ?? '';
      widths[C] = Math.max(widths[C], String(txt).length + 2);
    }
  }
  ws['!cols'] = widths.map((w) => ({ wch: Math.min(Math.max(w, 8), 60) }));
}

/** Apply number format to selected columns by index. */
function applyNumberFormat(ws, numberColIdxs) {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = xlsx.utils.decode_range(ref);
  for (let C of numberColIdxs) {
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const addr = xlsx.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      if (typeof cell.v === 'number') {
        // Simple thousands format; Excel will show as 1,500,000 etc.
        cell.z = '#,##0';
        // also set w so preview looks nice in some viewers
        cell.w = cell.v.toLocaleString('en-US');
      }
    }
  }
}

/** Reorder object keys to match a header order. */
function order(obj, keys) {
  const out = {};
  keys.forEach((k) => (out[k] = obj[k]));
  return out;
}

// ---------- main ----------
async function main() {
  // Load DB (fail-safe)
  let items = [];
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8');
    const db = JSON.parse(raw || '{}');
    items = Array.isArray(db.items) ? db.items : [];
  } catch (e) {
    console.warn('⚠️ Could not read db.json; exporting empty sheets.');
  }

  // Stable sort: newest first, then name
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(a.name).localeCompare(String(b.name)));

  // ----- Sheet 1: Items -----
  const itemsHeader = [
    'id',
    'name',
    'status',
    'originalPrice',
    'currentPrice',
    'totalBids',
    'lastBidAmount',
    'lastBidderId',
    'lastBidderName',
    'images',
    'description',
    'createdAt'
  ];

  const itemsRows = items.map((it) => {
    const lastBid = (it.bids && it.bids.length) ? it.bids[it.bids.length - 1] : null;
    const row = {
      id: it.id,
      name: it.name,
      status: it.status || '',
      originalPrice: toNum(it.originalPrice),
      currentPrice: toNum(it.currentPrice),
      totalBids: (it.bids || []).length,
      lastBidAmount: lastBid ? toNum(lastBid.amount) : 0,
      lastBidderId: it.lastBidder?.bidderId || lastBid?.bidderId || '',
      lastBidderName: it.lastBidder?.name || lastBid?.name || '',
      images: asCSV(it.images),
      description: it.description || '',
      createdAt: toISO(it.createdAt)
    };
    return order(row, itemsHeader);
  });

  // ----- Sheet 2: Bids -----
  const bidsHeader = [
    'itemId',
    'itemName',
    'bidNo',
    'bidderId',
    'bidderName',
    'amount',
    'time'
  ];

  const bidsRows = [];
  items.forEach((it) => {
    (it.bids || []).forEach((b, idx) => {
      const row = {
        itemId: it.id,
        itemName: it.name,
        bidNo: idx + 1,
        bidderId: b.bidderId || '',
        bidderName: b.name || '',
        amount: toNum(b.amount),
        time: toISO(b.time)
      };
      bidsRows.push(order(row, bidsHeader));
    });
  });

  // Sort bids by time ascending within each item
  bidsRows.sort((a, b) => (a.itemId === b.itemId ? a.bidNo - b.bidNo : String(a.itemId).localeCompare(String(b.itemId))));

  // Build workbook
  const wb = xlsx.utils.book_new();

  const wsItems = xlsx.utils.json_to_sheet(itemsRows, { header: itemsHeader });
  autoFitColumns(wsItems, itemsHeader);
  // numeric columns for Items: originalPrice, currentPrice, totalBids, lastBidAmount
  applyNumberFormat(wsItems, [itemsHeader.indexOf('originalPrice'), itemsHeader.indexOf('currentPrice'), itemsHeader.indexOf('totalBids'), itemsHeader.indexOf('lastBidAmount')]);
  xlsx.utils.book_append_sheet(wb, wsItems, 'Items');

  const wsBids = xlsx.utils.json_to_sheet(bidsRows, { header: bidsHeader });
  autoFitColumns(wsBids, bidsHeader);
  // numeric columns for Bids: bidNo, amount
  applyNumberFormat(wsBids, [bidsHeader.indexOf('bidNo'), bidsHeader.indexOf('amount')]);
  xlsx.utils.book_append_sheet(wb, wsBids, 'Bids');

  // Write files
  xlsx.writeFile(wb, XLSX_OUT);

  // Quick-view CSV for VS Code
  const csvBids = xlsx.utils.sheet_to_csv(wsBids);
  await fs.writeFile(CSV_BIDS_OUT, csvBids, 'utf8');

  console.log(`✅ Exported ${itemsRows.length} items and ${bidsRows.length} bids.`);
  console.log(`   Excel: ${XLSX_OUT}`);
  console.log(`   CSV  : ${CSV_BIDS_OUT}`);
}

main().catch((err) => {
  console.error('❌ Export failed:', err);
  process.exit(1);
});
