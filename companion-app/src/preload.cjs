const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("liveTranslatorCompanion", {
  getStatus: () => ipcRenderer.invoke("companion:get-status"),
  saveConfig: (config) => ipcRenderer.invoke("companion:save-config", config),
  restartServices: () => ipcRenderer.invoke("companion:restart-services"),
  openServiceEnv: () => ipcRenderer.invoke("companion:open-service-env"),
  onStatus: (callback) => {
    ipcRenderer.on("companion:status", (_event, payload) => callback(payload));
  }
});
