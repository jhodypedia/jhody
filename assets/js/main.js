/* assets/js/main.js - unified client for WA backend */
/* CHANGE API_BASE to your backend (include /api at end) */
const API_BASE = "http://151.240.0.221:3000/api";

toastr.options = { closeButton: true, progressBar: true, positionClass: "toast-top-right", timeOut: 3500 };

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: "Bearer " + token } : {};
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}

/* ------------------ AUTH (index.html) ------------------ */
if (document.querySelector("#loginForm")) {
  document.querySelector("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.querySelector("#loginEmail").value.trim();
    const password = document.querySelector("#loginPassword").value;
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email, password })
      });
      const j = await safeJson(res);
      if (!res.ok) { toastr.error(j?.error || "Login failed"); return; }
      localStorage.setItem("token", j.token);
      if (j.apiKey) localStorage.setItem("apiKey", j.apiKey);
      if (j.username) localStorage.setItem("username", j.username);
      if (j.role) localStorage.setItem("role", j.role);
      toastr.success("Login successful");
      setTimeout(()=> window.location.href = "dashboard.html", 700);
    } catch (err) { console.error(err); toastr.error("Cannot reach server"); }
  });
}

if (document.querySelector("#registerForm")) {
  document.querySelector("#registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      username: document.querySelector("#regUsername").value.trim(),
      email: document.querySelector("#regEmail").value.trim(),
      phone: document.querySelector("#regPhone") ? document.querySelector("#regPhone").value.trim() : "",
      password: document.querySelector("#regPassword").value,
      role: document.querySelector("#regRole") ? document.querySelector("#regRole").value : "user"
    };
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      const j = await safeJson(res);
      if (!res.ok) { toastr.error(j?.error || "Register failed"); return; }
      toastr.success("Registered — please login");
      setTimeout(()=> window.location.href = "index.html", 900);
    } catch (err) { console.error(err); toastr.error("Server error"); }
  });
}

/* ------------------ COMMON: logout + profile load ------------------ */
if (document.querySelectorAll(".logoutBtn").length > 0) {
  document.querySelectorAll(".logoutBtn").forEach(b => b.addEventListener("click", () => {
    localStorage.clear(); window.location.href = "index.html";
  }));
}

/* auto-run profile on pages with profile placeholders */
async function loadProfileIfNeeded() {
  if (!document.querySelector("#pUsername") && !document.querySelector("#navUsername")) return;
  const token = localStorage.getItem("token");
  if (!token) { window.location.href = "index.html"; return; }

  // basic from localStorage
  const username = localStorage.getItem("username") || "";
  const role = localStorage.getItem("role") || "";
  const apiKey = localStorage.getItem("apiKey") || "";

  if (document.querySelector("#navUsername")) document.querySelector("#navUsername").textContent = username;
  if (document.querySelector("#pUsername")) document.querySelector("#pUsername").textContent = username;
  if (document.querySelector("#pRole")) document.querySelector("#pRole").textContent = role;
  if (document.querySelector("#pApiKey")) document.querySelector("#pApiKey").textContent = apiKey;

  // try fetch actual profile (if backend provides)
  try {
    const res = await fetch(`${API_BASE}/auth/profile`, { headers: { ...authHeaders() }});
    if (res.ok) {
      const p = await safeJson(res);
      if (p) {
        if (document.querySelector("#pUsername")) document.querySelector("#pUsername").textContent = p.username || username;
        if (document.querySelector("#pEmail")) document.querySelector("#pEmail").textContent = p.email || "-";
        if (document.querySelector("#pRole")) document.querySelector("#pRole").textContent = p.role || role;
        if (document.querySelector("#pPremium")) document.querySelector("#pPremium").textContent = p.premium ? (`Active until ${new Date(p.premiumUntil).toLocaleString()}`) : "Free";
        if (p.apiKey) {
          localStorage.setItem("apiKey", p.apiKey);
          if (document.querySelector("#pApiKey")) document.querySelector("#pApiKey").textContent = p.apiKey;
        }
      }
    }
  } catch (err) { /* ignore */ }
}
loadProfileIfNeeded();

/* ------------------ DASHBOARD (dashboard.html) ------------------ */
if (document.querySelector("#dashboardRoot")) {
  // basic stats
  (async () => {
    try {
      const resUsers = await fetch(`${API_BASE}/auth/users`, { headers: { ...authHeaders() }});
      const users = resUsers.ok ? await safeJson(resUsers) : [];
      if (document.querySelector("#statUsers")) document.querySelector("#statUsers").textContent = users.length || 0;
    } catch (err) { /* ignore */ }
  })();
}

/* ------------------ DEVICES & SSE QR (devices.html) ------------------ */
let es = null;
if (document.querySelector("#devicesRoot")) {
  // start SSE button
  const startBtn = document.querySelector("#btnStartSSE");
  const connectBtn = document.querySelector("#btnConnectSession");
  const qrImg = document.querySelector("#qrImage");
  const qrPlaceholder = document.querySelector("#qrPlaceholder");

  startBtn && startBtn.addEventListener("click", () => {
    const apiKey = localStorage.getItem("apiKey");
    if (!apiKey) { toastr.error("No API Key — login and ensure profile has apikey"); return; }
    if (es) { es.close(); es = null; }
    const sseUrl = `${API_BASE.replace(/\/api$/, "")}/api/v1/qr-stream?apiKey=${apiKey}`;
    es = new EventSource(sseUrl);
    toastr.info("SSE started — waiting for QR");
    es.addEventListener("qr", ev => {
      try {
        const p = JSON.parse(ev.data);
        const url = p.qrDataUrl || p.qr || p.qrUrl || null;
        if (url) {
          qrImg.src = url; qrImg.classList.remove("d-none"); qrPlaceholder.classList.add("d-none");
        }
      } catch (e) {}
    });
    es.onerror = () => toastr.info("SSE ended or error");
  });

  connectBtn && connectBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/connect`, { method: "POST", headers: { ...authHeaders(), "Content-Type":"application/json" }});
      const j = await safeJson(res);
      if (res.ok) toastr.success(j?.message || "Connect started");
      else toastr.error(j?.error || "Connect failed");
    } catch (err) { toastr.error("Server error"); }
  });

  // load devices
  async function loadDevices(){
    try {
      const res = await fetch(`${API_BASE}/v1/devices`, { headers: { ...authHeaders() }});
      const j = await safeJson(res);
      const wrap = document.querySelector("#deviceList");
      if (!wrap) return;
      if (!res.ok || !Array.isArray(j) || j.length === 0) { wrap.innerHTML = "<li class='list-group-item'>No devices</li>"; return; }
      wrap.innerHTML = j.map(d => `<li class="list-group-item d-flex justify-content-between align-items-center">
        <div><strong>${d.name||d.id}</strong><br/><small class="small">${d.status||""} • ${d.userId||""}</small></div>
        <div><button class="btn btn-sm btn-outline-danger" data-id="${d.id}" onclick="disconnectDevice('${d.id}')">Disconnect</button></div>
      </li>`).join("");
    } catch (err) { toastr.error("Failed load devices"); }
  }
  window.disconnectDevice = async (id) => {
    if (!confirm("Disconnect device?")) return;
    try {
      const res = await fetch(`${API_BASE}/v1/devices/${id}/disconnect`, { method: "POST", headers: { ...authHeaders() }});
      const j = await safeJson(res);
      if (res.ok) { toastr.success(j?.message || "Disconnected"); loadDevices(); }
      else toastr.error(j?.error || "Disconnect failed");
    } catch (err) { toastr.error("Server error"); }
  };
  loadDevices();
}

/* ------------------ SEND single message (send.html) ------------------ */
if (document.querySelector("#sendRoot")) {
  const sendForm = document.querySelector("#sendForm");
  sendForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const to = document.querySelector("#sendTo").value.trim();
    const text = document.querySelector("#sendText").value.trim();
    if (!to || !text) { toastr.error("Fill target & message"); return; }
    try {
      const res = await fetch(`${API_BASE}/v1/send-text`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type":"application/json" },
        body: JSON.stringify({ to, text })
      });
      const j = await safeJson(res);
      if (res.ok) { toastr.success("Message sent"); sendForm.reset(); }
      else toastr.error(j?.error || "Send failed");
    } catch (err) { toastr.error("Server error"); }
  });
}

/* ------------------ BROADCAST (broadcast.html) ------------------ */
if (document.querySelector("#broadcastRoot")) {
  document.querySelector("#broadcastForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = document.querySelector("#broadcastText").value.trim();
    if (!text) { toastr.error("Fill message"); return; }
    try {
      const res = await fetch(`${API_BASE}/v1/broadcast`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type":"application/json" },
        body: JSON.stringify({ text })
      });
      const j = await safeJson(res);
      if (res.ok) { toastr.success("Broadcast queued"); document.querySelector("#broadcastForm").reset(); }
      else toastr.error(j?.error || "Broadcast failed");
    } catch (err) { toastr.error("Server error"); }
  });
}

/* ------------------ PAYMENTS (payments.html) ------------------ */
if (document.querySelector("#paymentsRoot")) {
  document.querySelector("#createQrisBtn").addEventListener("click", async () => {
    try {
      const res = await fetch(`${API_BASE}/payment/qris`, { method: "POST", headers: { ...authHeaders() }});
      const j = await safeJson(res);
      if (!res.ok) { toastr.error(j?.error || "Create QR failed"); return; }
      const qrUrl = j?.qris?.qrUrl || (j?.qris?.raw && j.qris.raw.qr_string ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(j.qris.raw.qr_string)}&size=300x300` : null);
      if (qrUrl) {
        document.querySelector("#paymentQrImg").src = qrUrl;
        document.querySelector("#paymentQrWrap").classList.remove("d-none");
        document.querySelector("#paymentOrder").textContent = `Order: ${j.orderId}`;
        toastr.success("QR created — scan to pay");
      } else toastr.info("QR created — check response");
    } catch (err) { toastr.error("Server error"); }
  });

  async function loadPayments(){
    try {
      const res = await fetch(`${API_BASE.replace(/\/api$/, "")}/api/admin/payments`, { headers: { ...authHeaders() }});
      const j = await safeJson(res);
      const tbody = document.querySelector("#paymentsTable tbody");
      if (!res.ok || !Array.isArray(j)) { tbody.innerHTML = "<tr><td colspan='6'>No data</td></tr>"; return; }
      tbody.innerHTML = j.map(p => `<tr>
        <td>${p.orderId}</td><td>${p.userId||'-'}</td><td>${p.amount||'-'}</td><td>${p.status||'-'}</td><td>${p.provider||'-'}</td><td>${new Date(p.createdAt).toLocaleString()}</td>
      </tr>`).join("");
    } catch (err) { toastr.error("Failed load payments"); }
  }
  loadPayments();
}

/* ------------------ LOGS (logs.html) ------------------ */
if (document.querySelector("#logsRoot")) {
  (async ()=> {
    try {
      const res = await fetch(`${API_BASE}/logs`, { headers: { ...authHeaders() }});
      const j = await safeJson(res);
      const wrap = document.querySelector("#logsList");
      if (!res.ok || !Array.isArray(j)) { wrap.innerHTML = "<li class='list-group-item'>No logs</li>"; return; }
      wrap.innerHTML = j.map(l => `<li class="list-group-item"><small>${new Date(l.createdAt).toLocaleString()}</small><div><strong>${l.action || l.type}</strong></div><div class="small">${JSON.stringify(l.meta || l.details || '')}</div></li>`).join("");
    } catch (err) { toastr.error("Failed load logs"); }
  })();
}

/* ------------------ ADMIN (admin.html) ------------------ */
if (document.querySelector("#adminRoot")) {
  (async ()=> {
    try {
      const resU = await fetch(`${API_BASE}/auth/users`, { headers: { ...authHeaders() }});
      const users = resU.ok ? await safeJson(resU) : [];
      const tbodyU = document.querySelector("#usersTable tbody");
      if (Array.isArray(users)) tbodyU.innerHTML = users.map(u => `<tr><td>${u.id}</td><td>${u.username}</td><td>${u.email}</td><td>${u.role}</td><td style="font-size:12px">${u.apiKey||''}</td></tr>`).join("");
    } catch (err) { toastr.error("Failed load users"); }

    try {
      const resP = await fetch(`${API_BASE.replace(/\/api$/, "")}/api/admin/payments`, { headers: { ...authHeaders() }});
      const payments = resP.ok ? await safeJson(resP) : [];
      const tbodyP = document.querySelector("#adminPaymentsTable tbody");
      if (Array.isArray(payments)) tbodyP.innerHTML = payments.map(p => `<tr><td>${p.orderId}</td><td>${p.userId}</td><td>${p.amount}</td><td>${p.status}</td></tr>`).join("");
    } catch (err) { /* ignore */ }
  })();
}
