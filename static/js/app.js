"use strict";

const grid        = document.getElementById("news-grid");
const loader      = document.getElementById("loader");
const statusBar   = document.getElementById("status-bar");
const searchInput = document.getElementById("search");
const refreshBtn  = document.getElementById("refresh-btn");
const lastUpdated = document.getElementById("last-updated");
const totalCount  = document.getElementById("total-count");

let allNews     = [];
let activeCategory = "全部";
let searchQuery    = "";

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchNews() {
  loader.classList.remove("hidden");
  grid.innerHTML = "";
  statusBar.classList.add("hidden");
  refreshBtn.classList.add("spinning");

  try {
    const res = await fetch("/api/news");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allNews = await res.json();
    const now = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
    lastUpdated.textContent = `上次更新：${now}`;
    render();
  } catch (err) {
    showStatus(`無法載入新聞：${err.message}`);
  } finally {
    loader.classList.add("hidden");
    refreshBtn.classList.remove("spinning");
  }
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
  const q = searchQuery.toLowerCase();

  const filtered = allNews.filter(item => {
    const catMatch = activeCategory === "全部" || item.category === activeCategory;
    const qMatch   = !q || item.title.toLowerCase().includes(q) ||
                     item.summary.toLowerCase().includes(q) ||
                     item.source.toLowerCase().includes(q);
    return catMatch && qMatch;
  });

  totalCount.textContent = filtered.length;
  grid.innerHTML = "";

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state"><span class="icon">🔍</span>找不到符合的新聞</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach(item => fragment.appendChild(buildCard(item)));
  grid.appendChild(fragment);
}

// ── Card ───────────────────────────────────────────────────────────────────────
function buildCard(item) {
  const card = document.createElement("article");
  card.className = "card";

  if (item.image) {
    const img = document.createElement("img");
    img.className = "card-image";
    img.src = item.image;
    img.alt = item.title;
    img.loading = "lazy";
    img.onerror = () => img.remove();
    card.appendChild(img);
  }

  const body = document.createElement("div");
  body.className = "card-body";

  const meta = document.createElement("div");
  meta.className = "card-meta";
  meta.innerHTML = `
    <span class="badge badge-${item.category}">${item.category}</span>
    <span>${escHtml(item.source)}</span>
    ${item.published ? `<span>· ${escHtml(item.published)}</span>` : ""}
  `;

  const title = document.createElement("h2");
  title.className = "card-title";
  const a = document.createElement("a");
  a.href   = item.link;
  a.target = "_blank";
  a.rel    = "noopener noreferrer";
  a.textContent = item.title;
  title.appendChild(a);

  body.appendChild(meta);
  body.appendChild(title);

  if (item.summary) {
    const summary = document.createElement("p");
    summary.className = "card-summary";
    summary.textContent = item.summary;
    body.appendChild(summary);
  }

  card.appendChild(body);
  return card;
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Events ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".cat-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeCategory = btn.dataset.cat;
    render();
  });
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  render();
});

refreshBtn.addEventListener("click", fetchNews);

function showStatus(msg) {
  statusBar.textContent = msg;
  statusBar.classList.remove("hidden");
}

// ── Init ───────────────────────────────────────────────────────────────────────
fetchNews();
