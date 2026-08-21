// AIOS Desktop Control Surface — Context Isolation Preload Script
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aios", {
  getAndroidNode: () => ipcRenderer.invoke("aios:get-android-node"),
  getWindowsNode: () => ipcRenderer.invoke("aios:get-windows-node"),
  readBattery: () => ipcRenderer.invoke("aios:read-battery"),
  getArtifacts: () => ipcRenderer.invoke("aios:get-artifacts"),
  getFormations: () => ipcRenderer.invoke("aios:get-formations"),
});
