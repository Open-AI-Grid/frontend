// Configurable endpoints – override via URL params or env-injected globals
const NODE_API  = window.NODE_API  || "http://localhost:9000";
const AUTH_API  = window.AUTH_API  || "http://localhost:8800";

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  tasks: [],
  modelCatalog: null,
  lastModelsRefreshMs: 0,
  accessToken: localStorage.getItem("aig_access_token") || null,
  partialToken: null,   // used during MFA flow
  user: null,
};

const byId = (id) => document.getElementById(id);

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmtSeconds(s) {
  const t = Math.floor(Number(s || 0));
  return `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m ${t % 60}s`;
}

function fmtMs(ms) {
  if (ms >= 3_600_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  if (ms >= 60_000)    return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000)     return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function setStatus(text, ok = true) {
  const el = byId("connectionStatus");
  el.textContent = text;
  el.style.color = ok ? "#3dd6a0" : "#ff5a66";
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

function authHeaders() {
  return state.accessToken
    ? { "Content-Type": "application/json", Authorization: `Bearer ${state.accessToken}` }
    : { "Content-Type": "application/json" };
}

// ── Auth UI ───────────────────────────────────────────────────────────────────
function showAuth()       { byId("authModal").classList.remove("hidden"); }
function closeAuth()      { byId("authModal").classList.add("hidden"); clearAuthError(); }
function clearAuthError() { const e = byId("authError"); e.textContent=""; e.classList.add("hidden"); }
function showAuthError(m) { const e = byId("authError"); e.textContent=m; e.classList.remove("hidden"); }

function switchToRegister() {
  byId("authLoginForm").classList.add("hidden");
  byId("authRegisterForm").classList.remove("hidden");
  byId("authTitle").textContent = "Create Account";
  clearAuthError();
}
function switchToLogin() {
  byId("authRegisterForm").classList.add("hidden");
  byId("authLoginForm").classList.remove("hidden");
  byId("authTitle").textContent = "Sign In";
  clearAuthError();
}

async function doRegister() {
  clearAuthError();
  try {
    const res = await fetchJson(`${AUTH_API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: byId("regUsername").value.trim(),
        email:    byId("regEmail").value.trim(),
        password: byId("regPassword").value,
      }),
    });
    showAuthError(`✓ ${res.message} – now sign in.`);
    byId("authError").style.color = "#3dd6a0";
    switchToLogin();
  } catch (e) {
    showAuthError(e.message);
  }
}

async function doLogin() {
  clearAuthError();
  try {
    const res = await fetchJson(`${AUTH_API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: byId("authUsername").value.trim(),
        password: byId("authPassword").value,
      }),
    });

    if (res.mfa_required) {
      state.partialToken = res.partial_token;
      byId("authLoginForm").classList.add("hidden");
      byId("authMfaForm").classList.remove("hidden");
      byId("authTitle").textContent = "Two-Factor Auth";
      return;
    }

    applyTokens(res);
  } catch (e) {
    showAuthError(e.message);
  }
}

async function doMfaVerify() {
  clearAuthError();
  try {
    const res = await fetchJson(`${AUTH_API}/auth/mfa/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partial_token: state.partialToken, code: byId("mfaCode").value }),
    });
    applyTokens(res);
  } catch (e) {
    showAuthError(e.message);
  }
}

function applyTokens(res) {
  state.accessToken = res.access_token;
  state.user = res.user;
  localStorage.setItem("aig_access_token", res.access_token);
  if (res.refresh_token) localStorage.setItem("aig_refresh_token", res.refresh_token);
  updateUserBadge();
  closeAuth();
  refreshContributions();
}

function logout() {
  state.accessToken = null;
  state.user = null;
  localStorage.removeItem("aig_access_token");
  localStorage.removeItem("aig_refresh_token");
  byId("loginBtn").textContent = "Sign In";
  byId("loginBtn").onclick = showAuth;
  byId("userBadge").style.display = "none";
  byId("contributionsPanel").style.display = "none";
}

function updateUserBadge() {
  if (!state.user) return;
  byId("loginBtn").textContent = "Sign Out";
  byId("loginBtn").onclick = logout;
  const badge = byId("userBadge");
  badge.textContent = `${state.user.username} · ${state.user.rank}`;
  badge.style.display = "inline";
  byId("contributionsPanel").style.display = "";
}

// ── Node info + metrics ───────────────────────────────────────────────────────
async function refreshInfo() {
  try {
    const info = await fetchJson(`${NODE_API}/info`);
    const stats = info.stats || {};
    const gpu   = stats.gpu || {};

    byId("uptime").textContent    = fmtSeconds(stats.uptime_seconds || info.uptime_seconds || 0);
    byId("cpu").textContent       = `${(stats.cpu_percent || 0).toFixed(1)}%`;
    byId("memory").textContent    = `${(stats.memory_percent || 0).toFixed(1)}%`;
    byId("completed").textContent = String(stats.tasks_completed || 0);
    byId("gpu").textContent       = gpu.available ? (gpu.name || "CUDA") : "Not available";
    byId("gpuLoad").textContent   = gpu.available ? `${(gpu.load_percent || 0).toFixed(1)}%` : "N/A";
    byId("gpuMem").textContent    = gpu.available
      ? `${(gpu.memory_percent || 0).toFixed(1)}% (${(gpu.memory_reserved_mb || 0).toFixed(0)} / ${(gpu.memory_total_mb || 0).toFixed(0)} MB)`
      : "N/A";

    const runtime = stats.llm_runtime || {};
    byId("activeModel").textContent = runtime.last_used_model || runtime.default_model || "Unknown";
    byId("nodeMeta").textContent = `${info.name} • ${info.node_id} • ${info.host}:${info.port} • v${info.version || "?"}`;
    setStatus("Connected", true);
  } catch (e) {
    setStatus("Node offline", false);
    byId("nodeMeta").textContent = `Error: ${e.message}`;
  }
}

function updateModelSelect(models, defaultModel) {
  const sel = byId("modelSelect");
  const cur = sel.value;
  const vals = models && models.length ? models : [defaultModel || "mistral:latest"];
  sel.innerHTML = vals.map((n) => `<option value="${n}">${n}</option>`).join("");
  if (vals.includes(cur)) sel.value = cur;
  else if (defaultModel && vals.includes(defaultModel)) sel.value = defaultModel;
}

async function refreshModels(force = false) {
  const now = Date.now();
  if (!force && now - state.lastModelsRefreshMs < 30_000) return;
  try {
    const catalog = await fetchJson(`${NODE_API}/models`);
    state.modelCatalog = catalog;
    state.lastModelsRefreshMs = now;
    updateModelSelect(catalog.available_models, catalog.default_model);
    byId("activeModel").textContent = catalog.last_used_model || catalog.default_model || "-";
    byId("modelMeta").textContent =
      `${catalog.backend || "?"} backend • default ${catalog.default_model} • ${(catalog.available_models || []).length} model(s)`;
  } catch (e) {
    byId("modelMeta").textContent = `Model catalog unavailable: ${e.message}`;
  }
}

// ── Contributions ─────────────────────────────────────────────────────────────
async function refreshContributions() {
  if (!state.accessToken) return;
  try {
    const data = await fetchJson(`${AUTH_API}/auth/contributions`, {
      headers: authHeaders(),
    });
    state.user = { ...state.user, ...data };
    const s = data.stats || {};
    byId("myRank").textContent     = data.rank || "-";
    byId("myCompleted").textContent = String(s.tasks_completed || 0);
    byId("myCompute").textContent  = fmtMs(s.total_compute_time_ms || 0);
    byId("myTokens").textContent   = String(s.total_tokens_generated || 0);
    byId("contributionsPanel").style.display = "";
    updateUserBadge();
  } catch (_) {}
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function refreshLeaderboard() {
  try {
    const data = await fetchJson(`${AUTH_API}/auth/leaderboard?limit=10`);
    const entries = data.leaderboard || [];
    const el = byId("leaderboard");
    if (!entries.length) {
      el.innerHTML = '<div class="task-item muted">No contributions yet.</div>';
      return;
    }
    el.innerHTML = entries.map((e, i) => `
      <div class="task-item">
        <strong>#${i + 1} ${e.username}</strong>
        <div class="mono muted">${e.tasks_completed} tasks · ${fmtMs(e.total_compute_time_ms || 0)} compute</div>
      </div>
    `).join("");
  } catch (_) {}
}

// ── Peers ─────────────────────────────────────────────────────────────────────
async function refreshPeers() {
  try {
    const data = await fetchJson(`${NODE_API}/peers`);
    const peers = Object.values(data.peers || {});
    byId("peerSummary").textContent =
      `${data.stats?.online || 0} online / ${data.stats?.total || 0} total`;
    const list = byId("peerList");
    if (!peers.length) {
      list.innerHTML = '<div class="task-item muted">No peers yet.</div>';
      return;
    }
    list.innerHTML = peers.slice(0, 8).map((p) => `
      <div class="task-item">
        <strong>${p.name || "Unnamed"}</strong>
        <div class="mono muted">${p.host}:${p.port} • ${p.node_id}</div>
      </div>
    `).join("");
  } catch (e) {
    byId("peerSummary").textContent = `Error: ${e.message}`;
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
async function refreshTasks() {
  const container = byId("tasks");
  if (!state.tasks.length) {
    container.innerHTML = '<div class="task-item muted">No tasks submitted yet.</div>';
    return;
  }
  try {
    const results = await Promise.all(
      state.tasks.slice(0, 8).map(async (id) => {
        const d = await fetchJson(`${NODE_API}/tasks/${id}`);
        return { id, ...d };
      })
    );
    container.innerHTML = results.map((t) => {
      const output = t.output ? JSON.stringify(t.output).slice(0, 120) : "-";
      return `
        <div class="task-item">
          <strong>${t.status || "unknown"}</strong>
          <div class="mono muted">${t.task_id}</div>
          <div class="mono">${output}</div>
        </div>`;
    }).join("");
  } catch (e) {
    container.innerHTML = `<div class="task-item muted">Error: ${e.message}</div>`;
  }
}

async function submitTask(payload) {
  const res = await fetchJson(`${NODE_API}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  state.tasks.unshift(res.task_id);
  byId("submitResult").textContent = `Submitted: ${res.task_id}`;
  await refreshTasks();
}

// ── Forms / Tabs ──────────────────────────────────────────────────────────────
function setupTabs() {
  const tabs     = [...document.querySelectorAll(".tab")];
  const dataForm = byId("dataTaskForm");
  const llmForm  = byId("llmTaskForm");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isData = tab.dataset.tab === "data";
      dataForm.classList.toggle("hidden", !isData);
      llmForm.classList.toggle("hidden", isData);
    });
  });
}

function setupForms() {
  byId("dataTaskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await submitTask({
        task_type:  "data_processing",
        operation:  byId("operation").value,
        input_data: JSON.parse(byId("dataInput").value),
        parameters: JSON.parse(byId("dataParams").value),
      });
    } catch (err) {
      byId("submitResult").textContent = `Failed: ${err.message}`;
    }
  });

  byId("llmTaskForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const custom = (byId("modelCustom").value || "").trim();
      await submitTask({
        task_type:   "llm_inference",
        prompt:      byId("prompt").value,
        model:       custom || byId("modelSelect").value || "mistral:latest",
        max_tokens:  Number(byId("maxTokens").value || 256),
        require_gpu: byId("requireGpu").checked,
      });
    } catch (err) {
      byId("submitResult").textContent = `Failed: ${err.message}`;
    }
  });
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function tick() {
  await Promise.all([
    refreshInfo(),
    refreshPeers(),
    refreshTasks(),
    refreshModels(false),
    refreshLeaderboard(),
    refreshContributions(),
  ]);
}

async function init() {
  setupTabs();
  setupForms();

  // Restore session
  if (state.accessToken) {
    try {
      const me = await fetchJson(`${AUTH_API}/auth/me`, { headers: authHeaders() });
      state.user = me;
      updateUserBadge();
    } catch (_) {
      state.accessToken = null;
      localStorage.removeItem("aig_access_token");
    }
  }

  await refreshModels(true);
  await tick();
  setInterval(tick, 3000);
}

init();
