const { contextBridge, ipcRenderer } = require('electron');

// 向渲染进程暴露特定的Electron API
contextBridge.exposeInMainWorld('electronAPI', {
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options)
});