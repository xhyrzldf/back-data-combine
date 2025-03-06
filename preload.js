const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const util = require('util');

// 将fs.stat转换为Promise
const statAsync = util.promisify(fs.stat);

// 向渲染进程暴露特定的Electron API
contextBridge.exposeInMainWorld('electronAPI', {
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    getFileStats: async (path) => {
        try {
            return await statAsync(path);
        } catch (error) {
            throw new Error(`无法获取文件信息: ${error.message}`);
        }
    },
    // 添加处理后端崩溃的监听器
    onBackendCrash: (callback) => {
        ipcRenderer.on('backend-crash', (event, data) => callback(data));
    }
});

// 添加调试信息，确认preload脚本已加载
console.log('Preload script loaded!');