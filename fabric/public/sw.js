// AI-OS service worker.
// Amac SADECE PWA kurulabilirligi + kabuk varliklarinin (HTML, ikon fontu)
// hizli acilmasi. VERI (capability okumalari, LLM) ASLA onbelleklenmez -
// pil/ag/uygulama listesi her zaman canli olmali.

const SHELL = "aios-shell-v7";
// TAM liste: app.js nerdeyse her modulu ustte statik import eder (bkz.
// app.js:14-38), yani ilk ONLINE acilista bunlarin tumu zaten fetch
// handler'dan gecip firsatci onbelleklenir. Ama bu install-time precache
// listesi EKSIKse, SW kurulumu bitip de ilk online oturum TAMAMLANMADAN
// (orn. kurulum sirasinda kesintili baglanti) cevrimdisiya gecen kullanici
// bos/olu bir ekranla kalir - onbellekte olmayan bir modul import edilemez.
// Liste public/js ve public/css dizinlerinin TAM icerigidir;
// test/sw-shell.test.ts bunu gercek dosya sistemiyle karsilastirip sapmayi
// yakalar (registry-drift.test.ts ile ayni desen).
const SHELL_FILES = [
  "/",
  "/vendor/framework7-icons.css",
  "/vendor/fonts/Framework7Icons-Regular.woff2",
  "/css/tokens.css",
  "/css/themes.css",
  "/css/components.css",
  "/js/api.js",
  "/js/app.js",
  "/js/application-model.js",
  "/js/artifact-contract.js",
  "/js/artifact-parse.js",
  "/js/artifact-store.js",
  "/js/client-log.js",
  "/js/clipboard-import.js",
  "/js/continuity-projection.js",
  "/js/dispatch-utils.js",
  "/js/formation-canvas-view.js",
  "/js/formation-canvas.js",
  "/js/formation-explorer.js",
  "/js/formation-memory.js",
  "/js/navigation-state.js",
  "/js/parse-client.js",
  "/js/parse-worker.js",
  "/js/prompt-cache.js",
  "/js/reference-artifacts.js",
  "/js/registry.js",
  "/js/renderer.js",
  "/js/screens.js",
  "/js/surface-classification.js",
  "/js/ui-actions.js",
  "/js/ui-requirements.js",
  "/js/view-transitions.js",
  "/js/windowmanager.js",
  "/js/workspace-catalog.js",
  "/js/workspace-dock.js",
  "/js/workspace-surface.js",
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
