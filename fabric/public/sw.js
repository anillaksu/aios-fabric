// AI-OS service worker.
// Amac SADECE PWA kurulabilirligi + kabuk varliklarinin (Framework7, HTML)
// hizli acilmasi. VERI (capability okumalari, LLM) ASLA onbelleklenmez -
// pil/ag/uygulama listesi her zaman canli olmali.

const SHELL = "aios-shell-v5";
const SHELL_FILES = [
  "/",
  "/vendor/framework7-bundle.min.css",
  "/vendor/framework7-bundle.min.js",
  "/vendor/framework7-icons.css",
  "/vendor/fonts/Framework7Icons-Regular.woff2",
  "/css/tokens.css",
  "/css/themes.css",
  "/css/components.css",
  "/js/app.js",
  "/js/api.js",
  "/js/registry.js",
  "/js/renderer.js",
  "/js/screens.js",
  "/manifest.json",
  "/icons/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // POST ve API yollari: her zaman aga git, onbellege ASLA yazma
  if (e.request.method !== "GET" || url.pathname.startsWith("/read") ||
      url.pathname.startsWith("/intent") || url.pathname.startsWith("/events") ||
      url.pathname.startsWith("/a2a") || url.pathname.startsWith("/state")) {
    return;
  }
  // Kabuk varliklari: once ag, olmazsa onbellek (guncel kalir ama cevrimdisi acilir)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/"))),
  );
});
