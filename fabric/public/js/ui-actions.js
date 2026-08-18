// UI'nin kendi ic gezinme eylemleri (capability degil, capabilityMap'te yok).
// fabric/src/screenspec.ts:UI_META_ACTIONS ile BIREBIR ayni liste olmali -
// biri degisip digeri unutulursa sunucu ve istemci farkli seyi "gecerli"
// sayar (B-6, W1.9/W1.10 deseni). fabric/test/registry-drift.test.ts bu
// listeyi sunucudakiyle karsilastirir.
//
// Ayri dosyada: app.js DOM'a (window/document) top-level bagli, Node testi
// onu dogrudan import edemez. Bu dosyanin bagimliligi YOK - hem tarayicida
// hem Node'da guvenle import edilir.
export const UI_META_ACTIONS = [
  "ui.goto", "ui.back", "ui.appsheet", "ui.control", "ui.ask", "ui.artifact",
  "ui.compose", "cap.test", "ui.taskCancel", "ui.taskRetry", "ui.taskUndo",
  "ui.miniapp", "ui.application", "ui.ruleAdd", "ui.ruleToggle", "ui.ruleRemove",
];
