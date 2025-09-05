# Simple Auction (Local JSON DB)

A tiny auction page you can run in VS Code with Node.js. Data is stored locally in **db.json** (no external database).

## 1) Requirements
- Node.js 18+
- VS Code (optional, just for editing)

## 2) Install & Run
```bash
npm install
npm start
# open http://localhost:3000
```

## 3) How it works
- Server: `server.js` (Express) serves the static site and JSON API
- Frontend: `public/index.html`, `public/app.js`, `public/styles.css`
- Local database: `db.json`
- LAK bids go up **+100,000** each click.
- Item fields: name, description, images (comma-separated URLs), originalPrice, status (Available, Hold, Sold out).

## 4) API (optional)
- `GET /api/items` — list items
- `POST /api/items` — create item (body: { name, description?, images?, originalPrice?, status? })
- `PATCH /api/items/:id/bid` — place a bid (+100,000)
- `PATCH /api/items/:id/status` — set status (Available | Hold | Sold out)
- `DELETE /api/items/:id` — delete item

## 5) Notes
- This is for local/demo use. For real-world use, move to a proper DB and add auth/logins.
- Images use URLs. To use local images, drop them into `/public` and reference like `/myphoto.jpg`.
