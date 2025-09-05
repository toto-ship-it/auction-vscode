const itemsEl    = document.getElementById('items');
const refreshBtn = document.getElementById('refresh');

const LAK = (n) => `₭ ${Number(n || 0).toLocaleString('en-US')}`;

async function fetchItems() {
  const res = await fetch('/api/items');
  return res.json();
}

function renderItems(items) {
  if (!items.length) {
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

  // We keep the status badge as display-only (no dropdown)
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
          <!-- Status selector & Delete button removed for read-only UI -->
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
  const thumbs = images.map((src, i) => `<img data-src="${src}" class="mini" alt="img-${i}" src="${src}">`).join('');
  return `<div class="thumbs">${thumbs}</div>`;
}

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
        const res = await fetch(`/api/items/${id}/bid`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, bidderId })
        });
        if (!res.ok) {
          const e = await res.json().catch(()=>({error:'Bid failed'}));
          alert(e.error || 'Bid failed');
          return;
        }
        load();
      });
    }

    // thumbnail switcher
    card.querySelectorAll('.mini').forEach(mini => {
      mini.addEventListener('click', () => { mainImg.src = mini.dataset.src; });
    });
  });
}

async function load() {
  const items = await fetchItems();
  renderItems(items);
}

refreshBtn.addEventListener('click', load);
load();