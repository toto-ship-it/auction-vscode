// data/sync-from-excel.js
import xlsx from "xlsx";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer items.xlsx; fall back to items.csv
let EXCEL_PATH = path.join(__dirname, "items.xlsx");
if (!fsSync.existsSync(EXCEL_PATH)) {
  EXCEL_PATH = path.join(__dirname, "items.csv");
}
const DB_PATH = path.join(__dirname, "..", "db.json");
const VALID_STATUS = ["Available", "Hold", "Sold out"];

function toNumber(v) {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function toArrayFromCSV(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  return String(v).split(",").map(s => s.trim()).filter(Boolean);
}
const norm = s => String(s || "").toLowerCase().trim();
const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj[norm(k)];
    if (v != null && String(v).trim() !== "") return v;
  }
  return undefined;
};

async function main() {
  if (!fsSync.existsSync(EXCEL_PATH)) {
    console.error(`No items.xlsx or items.csv found in ${__dirname}`);
    process.exit(1);
  }

  console.log("Reading:", EXCEL_PATH);
  console.log("Writing:", DB_PATH);

  const wb = xlsx.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]]; // FIRST sheet only
  const rowsRaw = xlsx.utils.sheet_to_json(ws, { defval: "" });
  console.log("Rows in first sheet:", rowsRaw.length);

  const items = rowsRaw.map((row, idx) => {
    // build a lowercased+trimmed key map
    const r = {};
    for (const [k, v] of Object.entries(row)) r[norm(k)] = v;

    const id =
      String(pick(r, ["id", "id (optional)", "item id"]) || "").trim() ||
      `item-${crypto.randomUUID()}`;

    const name = String(
      pick(r, ["name", "item name", "ชื่อ"]) || ""
    ).trim();

    const description = String(
      pick(r, ["description", "desc", "รายละเอียด"]) || ""
    ).trim();

    const imagesCell =
      pick(r, ["images", "images (comma separated)", "image", "ภาพ"]) || "";
    const images = toArrayFromCSV(imagesCell);

    const originalPrice = toNumber(
      pick(r, ["originalprice", "original price", "starting price", "price"])
    );
    const currentPriceRaw = toNumber(
      pick(r, ["currentprice", "current price"])
    );
    const currentPrice = currentPriceRaw || originalPrice;

    const statusRaw = String(pick(r, ["status", "สถานะ"]) || "").trim();
    const status = VALID_STATUS.includes(statusRaw) ? statusRaw : "Available";

    if (!name) {
      console.warn(`Row ${idx + 2}: missing "name" → skipping`);
      return null;
    }

    return {
      id, name, description, images,
      originalPrice, currentPrice, status,
      bids: [], createdAt: Date.now()
    };
  }).filter(Boolean);

  await fs.writeFile(DB_PATH, JSON.stringify({ items }, null, 2));
  console.log(`✅ Synced ${items.length} item(s) from ${path.basename(EXCEL_PATH)} → ${DB_PATH}`);
}

main().catch(err => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
