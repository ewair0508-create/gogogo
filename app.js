// ============ Storage helpers ============
const LS_KEY = "medreminder.conn";

function loadConn() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveConn(conn) {
  localStorage.setItem(LS_KEY, JSON.stringify(conn));
}

// ============ State ============
let conn = loadConn();
let data = { timezone: "Asia/Taipei", medications: [] };
let dataSha = null;
let dirty = false;
let editingId = null;

// ============ Utils ============
function uuid() {
  return "med-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.className = "toast";
  }, 2800);
}

function setStatus(text, kind = "") {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = "status " + kind;
}

function setDirty(v) {
  dirty = v;
  document.getElementById("dirty-bar").classList.toggle("hidden", !v);
}

// UTF-8 safe base64
function b64encode(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}
function b64decode(b64) {
  const clean = b64.replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ============ GitHub API ============
function ghHeaders() {
  return {
    Authorization: `Bearer ${conn.pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function ghContentsUrl() {
  const branch = conn.branch || "main";
  return `https://api.github.com/repos/${conn.owner}/${conn.repo}/contents/medications.json?ref=${encodeURIComponent(branch)}`;
}

async function ghLoad() {
  const res = await fetch(ghContentsUrl(), { headers: ghHeaders() });
  if (res.status === 404) {
    data = { timezone: "Asia/Taipei", medications: [] };
    dataSha = null;
    return;
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = b64decode(json.content);
  data = JSON.parse(text);
  if (!data.medications) data.medications = [];
  if (!data.timezone) data.timezone = "Asia/Taipei";
  dataSha = json.sha;
}

async function ghSave() {
  const url = `https://api.github.com/repos/${conn.owner}/${conn.repo}/contents/medications.json`;
  const body = {
    message: `Update medications (${new Date().toISOString()})`,
    content: b64encode(JSON.stringify(data, null, 2) + "\n"),
    branch: conn.branch || "main",
  };
  if (dataSha) body.sha = dataSha;
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  const json = await res.json();
  dataSha = json.content.sha;
}

async function ghTriggerWorkflow() {
  const branch = conn.branch || "main";
  const url = `https://api.github.com/repos/${conn.owner}/${conn.repo}/actions/workflows/reminder.yml/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: branch }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
}

// ============ Rendering ============
function isConfigured() {
  return conn.owner && conn.repo && conn.pat;
}

function render() {
  const notCfg = document.getElementById("not-configured");
  const list = document.getElementById("med-list");
  const empty = document.getElementById("med-empty");

  notCfg.classList.toggle("hidden", isConfigured());

  if (!isConfigured()) {
    list.innerHTML = "";
    empty.classList.add("hidden");
    return;
  }

  if (!data.medications.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  list.innerHTML = data.medications
    .map((m) => {
      const times = (m.times || [])
        .slice()
        .sort()
        .map((t) => `<span class="time-chip">${escapeHtml(t)}</span>`)
        .join("");
      return `
        <div class="med-card">
          <div class="med-card-header">
            <div>
              <div class="med-name">${escapeHtml(m.name)}</div>
              ${m.dose ? `<div class="med-meta">劑量:${escapeHtml(m.dose)}</div>` : ""}
            </div>
            <div class="med-actions">
              <button data-edit="${m.id}">編輯</button>
              <button data-delete="${m.id}" class="danger">刪除</button>
            </div>
          </div>
          <div class="med-times">${times || '<span class="med-meta">尚未設定時段</span>'}</div>
          ${m.note ? `<div class="med-note">${escapeHtml(m.note)}</div>` : ""}
        </div>
      `;
    })
    .join("");

  list.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => openModal(b.dataset.edit)),
  );
  list.querySelectorAll("[data-delete]").forEach((b) =>
    b.addEventListener("click", () => deleteMed(b.dataset.delete)),
  );
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ============ Modal ============
function openModal(id) {
  editingId = id || null;
  const modal = document.getElementById("med-modal");
  const title = document.getElementById("modal-title");
  const med = id ? data.medications.find((m) => m.id === id) : null;
  title.textContent = med ? "編輯藥品" : "新增藥品";

  document.getElementById("med-id").value = med?.id || "";
  document.getElementById("med-name").value = med?.name || "";
  document.getElementById("med-dose").value = med?.dose || "";
  document.getElementById("med-note").value = med?.note || "";

  const timeList = document.getElementById("time-list");
  timeList.innerHTML = "";
  const times = med?.times?.length ? med.times : ["08:00"];
  times.forEach(addTimeRow);

  modal.classList.remove("hidden");
}

function closeModal() {
  document.getElementById("med-modal").classList.add("hidden");
  editingId = null;
}

function addTimeRow(value = "08:00") {
  const timeList = document.getElementById("time-list");
  const row = document.createElement("div");
  row.className = "time-row";
  row.innerHTML = `
    <input type="time" value="${escapeHtml(value)}" required />
    <button type="button" class="remove-time">移除</button>
  `;
  row.querySelector(".remove-time").addEventListener("click", () => {
    if (document.querySelectorAll("#time-list .time-row").length > 1) {
      row.remove();
    } else {
      toast("至少需要一個時段", "error");
    }
  });
  timeList.appendChild(row);
}

function submitModal(e) {
  e.preventDefault();
  const id = document.getElementById("med-id").value || uuid();
  const name = document.getElementById("med-name").value.trim();
  const dose = document.getElementById("med-dose").value.trim();
  const note = document.getElementById("med-note").value.trim();
  const times = Array.from(document.querySelectorAll("#time-list input[type=time]"))
    .map((i) => i.value)
    .filter(Boolean);

  if (!name) return toast("請填藥品名稱", "error");
  if (!times.length) return toast("至少一個時段", "error");

  const existing = data.medications.find((m) => m.id === id);
  if (existing) {
    Object.assign(existing, { name, dose, note, times });
  } else {
    data.medications.push({ id, name, dose, note, times });
  }
  closeModal();
  setDirty(true);
  render();
}

function deleteMed(id) {
  const med = data.medications.find((m) => m.id === id);
  if (!med) return;
  if (!confirm(`確定要刪除「${med.name}」嗎?`)) return;
  data.medications = data.medications.filter((m) => m.id !== id);
  setDirty(true);
  render();
}

// ============ Tab switching ============
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name),
  );
  document.querySelectorAll(".tab").forEach((s) =>
    s.classList.toggle("active", s.id === "tab-" + name),
  );
}

// ============ Settings ============
function loadSettingsForm() {
  document.getElementById("gh-owner").value = conn.owner || "";
  document.getElementById("gh-repo").value = conn.repo || "";
  document.getElementById("gh-branch").value = conn.branch || "main";
  document.getElementById("gh-pat").value = conn.pat || "";
  updateActionsLink();
}

function readSettingsForm() {
  return {
    owner: document.getElementById("gh-owner").value.trim(),
    repo: document.getElementById("gh-repo").value.trim(),
    branch: document.getElementById("gh-branch").value.trim() || "main",
    pat: document.getElementById("gh-pat").value.trim(),
  };
}

function updateActionsLink() {
  const a = document.getElementById("actions-link");
  if (conn.owner && conn.repo) {
    a.href = `https://github.com/${conn.owner}/${conn.repo}/actions`;
  } else {
    a.href = "#";
  }
}

async function saveConnection() {
  const next = readSettingsForm();
  if (!next.owner || !next.repo || !next.pat) {
    return toast("請填完 owner / repo / PAT", "error");
  }
  conn = next;
  saveConn(conn);
  updateActionsLink();
  toast("已儲存連接設定", "success");
  await refreshFromGitHub();
}

async function testConnection() {
  const next = readSettingsForm();
  if (!next.owner || !next.repo || !next.pat) {
    return toast("請先填 owner / repo / PAT", "error");
  }
  const prev = conn;
  conn = next;
  try {
    setStatus("測試中…");
    const res = await fetch(`https://api.github.com/repos/${conn.owner}/${conn.repo}`, {
      headers: ghHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    toast("連接成功 ✓", "success");
    setStatus("已連接", "connected");
  } catch (err) {
    conn = prev;
    toast("連接失敗:" + err.message, "error");
    setStatus("連接失敗", "error");
  }
}

async function refreshFromGitHub() {
  if (!isConfigured()) {
    setStatus("未連接");
    render();
    return;
  }
  try {
    setStatus("載入中…");
    await ghLoad();
    setStatus("已連接", "connected");
    setDirty(false);
    render();
  } catch (err) {
    setStatus("載入失敗", "error");
    toast("載入失敗:" + err.message, "error");
  }
}

async function saveToGitHub() {
  if (!isConfigured()) return toast("尚未設定 GitHub 連接", "error");
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  try {
    setStatus("儲存中…");
    await ghSave();
    setStatus("已連接", "connected");
    setDirty(false);
    toast("已儲存到 GitHub ✓", "success");
  } catch (err) {
    setStatus("儲存失敗", "error");
    toast("儲存失敗:" + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function triggerWorkflow() {
  if (!isConfigured()) return toast("尚未設定 GitHub 連接", "error");
  try {
    await ghTriggerWorkflow();
    toast("已觸發 workflow,可到 Actions 頁面查看", "success");
  } catch (err) {
    toast("觸發失敗:" + err.message, "error");
  }
}

// ============ Init ============
function init() {
  // Tab navigation
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)),
  );

  // Med list actions
  document.getElementById("add-med-btn").addEventListener("click", () => {
    if (!isConfigured()) return toast("請先到「設定」分頁完成 GitHub 設定", "error");
    openModal(null);
  });
  document.getElementById("refresh-btn").addEventListener("click", refreshFromGitHub);
  document.getElementById("save-btn").addEventListener("click", saveToGitHub);
  document.getElementById("discard-btn").addEventListener("click", () => {
    if (confirm("捨棄所有未儲存的變更?")) refreshFromGitHub();
  });

  // Modal
  document.getElementById("med-form").addEventListener("submit", submitModal);
  document.getElementById("cancel-btn").addEventListener("click", closeModal);
  document.getElementById("add-time-btn").addEventListener("click", () => addTimeRow("08:00"));
  document.getElementById("med-modal").addEventListener("click", (e) => {
    if (e.target.id === "med-modal") closeModal();
  });

  // Settings
  document.getElementById("save-conn-btn").addEventListener("click", saveConnection);
  document.getElementById("test-conn-btn").addEventListener("click", testConnection);
  document.getElementById("trigger-btn").addEventListener("click", triggerWorkflow);

  // Warn on leave with unsaved changes
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  loadSettingsForm();
  if (isConfigured()) {
    refreshFromGitHub();
  } else {
    switchTab("settings");
    render();
  }
}

init();
