// Test/kontrol paneli - hem telefonda hem PC/baska cihazlarda tarayicidan
// acilabilir (Tailscale IP:9300). Optimistic projection + reconciliation
// akisini GOZLE gormek icin: her aksiyon aninda (iyimser) bir durum
// gosterir, gercek sonuc SSE'den gelince "dogrulandi" olarak isaretlenir.

export const UI_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fabric Control Panel</title>
<style>
  :root { --bg:#0a0e14; --panel:#121a24; --fg:#d8f0e0; --accent:#4ade80; --accent2:#38bdf8; --dim:#5c7a70; --err:#f87171; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family: ui-monospace, "Courier New", monospace; padding:14px; }
  h1 { font-size:16px; color:var(--accent2); margin:0 0 4px; }
  .sub { color:var(--dim); font-size:12px; margin-bottom:16px; }
  .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap:12px; }
  .card { background:var(--panel); border:1px solid #24333f; border-radius:6px; padding:12px; }
  .card h2 { font-size:13px; color:var(--accent); margin:0 0 8px; text-transform:uppercase; letter-spacing:1px; }
  button { background:#16321f; color:var(--fg); border:1px solid var(--accent); border-radius:4px; padding:8px 10px; font-family:inherit; font-size:12px; cursor:pointer; margin:3px 3px 3px 0; }
  button:active { background:var(--accent); color:#0a0e14; }
  input, textarea { background:#0d141c; color:var(--fg); border:1px solid #24333f; border-radius:4px; padding:6px 8px; font-family:inherit; font-size:12px; width:100%; margin:4px 0; }
  .row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .status { font-size:11px; padding:2px 6px; border-radius:3px; display:inline-block; }
  .status.pending, .status.optimistic { background:#4a3b0a; color:#facc15; }
  .status.running { background:#0a3b4a; color:var(--accent2); }
  .status.completed { background:#0a4a1f; color:var(--accent); }
  .status.failed, .status.interrupted { background:#4a0a0a; color:var(--err); }
  #log { height:220px; overflow-y:auto; font-size:11px; background:#050809; padding:8px; border-radius:4px; }
  #log div { padding:2px 0; border-bottom:1px dashed #1a2530; }
  .conn { font-size:11px; }
  .conn.ok { color:var(--accent); }
  .conn.bad { color:var(--err); }
  #screenPreview { background:#050809; border:2px solid var(--accent); border-radius:6px; padding:10px; min-height:80px; font-size:12px; }
  .taskline { font-size:11px; margin:2px 0; }
  pre { white-space: pre-wrap; word-break: break-word; font-size:11px; margin:4px 0; }
</style>
</head>
<body>
<h1>FABRIC CONTROL PANEL</h1>
<div class="sub">REFLEX / THOUGHT / AGENT plane test paneli — <span id="conn" class="conn">baglaniyor...</span> — self: <span id="selfUrl"></span></div>

<div class="grid">

  <div class="card">
    <h2>REFLEX — Sensor / Cihaz</h2>
    <div class="row">
      <button data-intent='{"type":"sensor.battery.read"}'>Pil oku</button>
      <button data-intent='{"type":"sensor.location.read"}'>Konum oku</button>
    </div>
    <div class="row">
      <input id="notifText" placeholder="bildirim metni" value="Fabric test bildirimi">
      <button onclick="sendNotif()">Bildirim gonder</button>
    </div>
    <div class="row">
      <input id="ttsText" placeholder="soylenecek metin" value="Fabric hazir">
      <button onclick="speak()">TTS soyle</button>
    </div>
    <pre id="sensorOut"></pre>
  </div>

  <div class="card">
    <h2>REFLEX — Uygulama (Shizuku)</h2>
    <div class="row">
      <input id="pkgInput" placeholder="paket adi (ör. com.twitter.android)">
    </div>
    <div class="row">
      <button onclick="appAction('app.freeze')">Dondur</button>
      <button onclick="appAction('app.unfreeze')">Geri Ac</button>
      <button onclick="appAction('app.open')">Ac</button>
    </div>
    <div id="appStatus"></div>
  </div>

  <div class="card">
    <h2>THOUGHT — Ekran uret (retro-os)</h2>
    <div class="row">
      <button onclick="renderScreen('boot')">boot</button>
      <button onclick="renderScreen('open_apps')">open_apps</button>
      <button onclick="renderScreen('go_home')">go_home</button>
    </div>
    <div id="screenPreview">henuz ekran uretilmedi</div>
  </div>

  <div class="card">
    <h2>AGENT — Hermes'e sor (yerel delegation)</h2>
    <div class="row">
      <input id="askText" placeholder="Hermes'e soru/gorev yaz" value="Kisaca kendini tanit">
      <button onclick="askHermes()">Gonder</button>
    </div>
    <div id="askStatus"></div>
    <pre id="askReply"></pre>
  </div>

  <div class="card">
    <h2>AGENT — Uzak peer'a delege et</h2>
    <div class="row">
      <input id="peerName" placeholder="peer adi (ör. pc-coding-agent)">
      <input id="peerUrl" placeholder="http://100.x.x.x:9310">
      <button onclick="addPeer()">Peer ekle</button>
    </div>
    <div class="row">
      <select id="peerSelect"></select>
      <input id="peerText" placeholder="gorev metni">
      <button onclick="delegate()">Delege et</button>
    </div>
    <pre id="peerOut"></pre>
  </div>

  <div class="card" style="grid-column: 1 / -1;">
    <h2>Canli Event Akisi (journal → SSE)</h2>
    <div id="log"></div>
  </div>

</div>

<script>
const BASE = location.origin;
document.getElementById('selfUrl').textContent = BASE;

function logLine(text, cls) {
  const el = document.getElementById('log');
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = text;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 300) el.removeChild(el.firstChild);
}

async function postIntent(intent) {
  logLine('→ intent: ' + JSON.stringify(intent));
  const res = await fetch(BASE + '/intent', {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(intent)
  });
  return res.json();
}

document.querySelectorAll('[data-intent]').forEach(btn => {
  btn.onclick = () => postIntent(JSON.parse(btn.getAttribute('data-intent')));
});

function appAction(type) {
  const pkg = document.getElementById('pkgInput').value.trim();
  if (!pkg) { alert('paket adi gir'); return; }
  document.getElementById('appStatus').innerHTML = '<span class="status optimistic">optimistic: ' + type + '</span>';
  postIntent({ type, payload: { pkg } });
}

function sendNotif() {
  postIntent({ type: 'notification.send', payload: { title: 'Fabric', content: document.getElementById('notifText').value } });
}
function speak() {
  postIntent({ type: 'tts.speak', payload: { text: document.getElementById('ttsText').value } });
}

let currentSession = '';
function renderScreen(action) {
  document.getElementById('screenPreview').innerHTML = '<span class="dim">optimistic: uretiliyor...</span>';
  postIntent({ type: 'screen.render', payload: { action, session: currentSession } });
}

async function askHermes() {
  const text = document.getElementById('askText').value;
  document.getElementById('askStatus').innerHTML = '<span class="status submitted">submitted</span>';
  document.getElementById('askReply').textContent = '';
  const res = await fetch(BASE + '/a2a/tasks', {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ text })
  });
  const task = await res.json();
  window.__lastAskTaskId = task.id;
}

async function loadPeers() {
  const res = await fetch(BASE + '/a2a/peers');
  const peers = await res.json();
  const sel = document.getElementById('peerSelect');
  sel.innerHTML = peers.map(p => '<option value="' + p.name + '">' + p.name + '</option>').join('');
}
async function addPeer() {
  const name = document.getElementById('peerName').value.trim();
  const url = document.getElementById('peerUrl').value.trim();
  if (!name || !url) { alert('name ve url gir'); return; }
  await fetch(BASE + '/a2a/peers', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name, url }) });
  loadPeers();
}
async function delegate() {
  const peer = document.getElementById('peerSelect').value;
  const text = document.getElementById('peerText').value;
  if (!peer || !text) { alert('peer sec ve metin gir'); return; }
  document.getElementById('peerOut').textContent = 'delege ediliyor...';
  const res = await fetch(BASE + '/a2a/delegate', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ peer, text }) });
  const task = await res.json();
  document.getElementById('peerOut').textContent = JSON.stringify(task, null, 2);
}
loadPeers();

// ---- SSE: canli event akisi + reconciliation ----
const conn = document.getElementById('conn');
function connectSSE() {
  const es = new EventSource(BASE + '/events');
  es.onopen = () => { conn.textContent = 'baglandi'; conn.className = 'conn ok'; };
  es.onerror = () => { conn.textContent = 'baglanti koptu, yeniden deneniyor...'; conn.className = 'conn bad'; };
  es.onmessage = (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch { return; }
    logLine('#' + ev.seq + ' ' + ev.type + ' :: ' + JSON.stringify(ev.payload).slice(0,140));

    if (ev.type === 'sensor.read.confirmed') {
      document.getElementById('sensorOut').textContent = JSON.stringify(ev.payload.value, null, 2);
    }
    if (ev.type === 'app.freeze.confirmed' || ev.type === 'app.unfreeze.confirmed') {
      const ok = ev.payload.ok;
      document.getElementById('appStatus').innerHTML =
        '<span class="status ' + (ok ? 'completed' : 'failed') + '">' + (ok ? 'dogrulandi' : 'basarisiz') + '</span>';
    }
    if (ev.type === 'screen.render.optimistic') {
      document.getElementById('screenPreview').innerHTML = ev.payload.skeletonHtml;
    }
    if (ev.type === 'screen.render.confirmed') {
      document.getElementById('screenPreview').innerHTML = ev.payload.html;
      if (ev.payload.session) currentSession = ev.payload.session;
    }
    if (ev.type.startsWith('a2a.task.') && ev.payload && ev.payload.id === window.__lastAskTaskId) {
      document.getElementById('askStatus').innerHTML = '<span class="status ' + ev.payload.state + '">' + ev.payload.state + '</span>';
      if (ev.payload.state === 'completed') {
        const last = ev.payload.history[ev.payload.history.length - 1];
        document.getElementById('askReply').textContent = last.parts[0].text;
      }
      if (ev.payload.state === 'failed') {
        document.getElementById('askReply').textContent = 'HATA: ' + ev.payload.error;
      }
    }
  };
}
connectSSE();
</script>
</body>
</html>
`;
