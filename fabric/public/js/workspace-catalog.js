/* AIOS Phone Workspace'in yerel keşif kataloğu.
   Bu bir wire formatı, capability ya da ApplicationEntry değildir: mevcut
   yüzeylere giden deterministik, istemci-içi ürün metadata'sıdır. */

export const WORKSPACE_CATEGORIES = [
  { id: "Cihaz", icon: "iphone", subtitle: "Pil ve telefon durumu" },
  { id: "Medya", icon: "music_note", subtitle: "Ses ve oynatma" },
  { id: "Ağ", icon: "wifi", subtitle: "Wi-Fi ve bağlantı" },
  { id: "Uygulamalar", icon: "square_grid_2x2_fill", subtitle: "Telefondaki uygulamalar" },
  { id: "Sistem", icon: "gear_alt_fill", subtitle: "Ayarlar ve durum" },
  { id: "AIOS", icon: "sparkles", subtitle: "Görevler ve artefaktlar" },
  { id: "Araçlar", icon: "wrench_and_screwdriver_fill", subtitle: "Hızlı cihaz eylemleri" },
];

export const WORKSPACE_ENTRIES = [
  {
    id: "device-status", category: "Cihaz", icon: "gauge",
    title: "Cihaz Durum Merkezi", subtitle: "Gerçek pil, Wi-Fi ve uygulama sayısı",
    searchTerms: ["cihaz", "durum", "telefon", "pil", "batarya", "sistem", "sıcaklık", "voltaj", "döngü"],
    action: { type: "ui.referenceDeviceStatus" },
  },
  {
    id: "network-status", category: "Ağ", icon: "wifi",
    title: "Ağ Durumu", subtitle: "Gerçek Wi-Fi, IP, sinyal ve bağlantı hızı",
    searchTerms: ["ağ", "internet", "wifi", "wi-fi", "bağlantı", "ip", "sinyal", "frekans"],
    action: { type: "ui.referenceDeviceStatus" },
  },
  {
    id: "sound-panel", category: "Medya", icon: "speaker_2_fill",
    title: "Kaydırılabilir Ses Paneli", subtitle: "Ses, oynat/duraklat, önceki/sonraki",
    searchTerms: ["medya", "ses", "müzik", "volume", "oynat", "duraklat", "sonraki", "önceki"],
    action: { type: "ui.referenceSoundPanel" },
  },
  {
    id: "android-apps", category: "Uygulamalar", icon: "square_grid_2x2_fill",
    title: "Telefon Uygulamaları", subtitle: "Cihazda yüklü uygulamaları aç",
    searchTerms: ["uygulama", "app", "telefon", "launcher", "liste"],
    action: { type: "ui.goto", payload: { screen: "androidApps" } },
  },
  {
    id: "system-settings", category: "Sistem", icon: "gear_alt_fill",
    title: "Sistem ve Ayarlar", subtitle: "Shizuku, bağlantılar ve görünüm",
    searchTerms: ["sistem", "ayar", "shizuku", "bağlantı", "tema"],
    action: { type: "ui.goto", payload: { screen: "settings" } },
  },
  {
    id: "quick-tools", category: "Araçlar", icon: "wrench_and_screwdriver_fill",
    title: "Hızlı Araçlar", subtitle: "Fener ve titreşim",
    searchTerms: ["araç", "fener", "ışık", "titreşim", "titre", "torch"],
    action: { type: "ui.goto", payload: { screen: "tools" } },
  },
  {
    id: "my-applications", category: "AIOS", icon: "square_grid_2x2_fill",
    title: "Uygulamalarım", subtitle: "Artifact'e bağlı kalıcı launcher girişleri",
    searchTerms: ["aios", "uygulamalarım", "ana ekran", "application", "launcher"],
    action: { type: "ui.goto", payload: { screen: "miniapps" } },
  },
  {
    id: "artifact-gallery", category: "AIOS", icon: "square_stack_3d_up_fill",
    title: "Artefakt Galerisi", subtitle: "Oluşturulan ekranları aç ve yönet",
    searchTerms: ["aios", "artefakt", "galeri", "panel", "oluşturulan"],
    action: { type: "ui.goto", payload: { tab: "artifacts" } },
  },
  {
    id: "active-work", category: "AIOS", icon: "list_bullet",
    title: "Aktif Görevler", subtitle: "Çalışan, başarısız ve yeniden denenebilir işler",
    searchTerms: ["aios", "aktif", "görev", "iş", "hata", "journal"],
    action: { type: "ui.goto", payload: { tab: "activity" } },
  },
  {
    id: "permissions", category: "AIOS", icon: "lock_fill",
    title: "İzinler", subtitle: "İnsan onayı gerektiren capability'ler",
    searchTerms: ["aios", "izin", "onay", "approval", "yetki"],
    action: { type: "ui.control" },
  },
  {
    id: "management", category: "AIOS", icon: "gear_alt_fill",
    title: "Yönetim Merkezi", subtitle: "Servisler, görevler, izinler ve sistem yönetimi",
    searchTerms: ["aios", "yönetim", "yonetim", "admin", "servis", "hata", "journal", "izin", "bakım"],
    action: { type: "ui.goto", payload: { screen: "management" } },
  },
];

/** Doğal dil yorumu değil; Türkçe karakterleri de kapsayan kesin metadata eşlemesi. */
export function foldWorkspaceText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[çğıöşü]/g, (ch) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[ch]);
}

export function entriesForCategory(category) {
  return WORKSPACE_ENTRIES.filter((entry) => entry.category === category);
}

export function searchWorkspaceEntries(query) {
  const needle = foldWorkspaceText(query).trim();
  if (!needle) return [];
  return WORKSPACE_ENTRIES.filter((entry) => {
    const haystack = [entry.title, entry.subtitle, entry.category, ...(entry.searchTerms || [])]
      .map(foldWorkspaceText)
      .join(" ");
    return haystack.includes(needle);
  });
}
