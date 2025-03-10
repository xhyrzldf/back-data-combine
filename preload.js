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
    
    // 添加获取后端端口的API
    getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
    
    // 添加检查后端状态的API
    checkBackendStatus: () => ipcRenderer.invoke('check-backend-status'),

    // 添加开发模式检测API
    isDevelopmentMode: () => ipcRenderer.invoke('is-development-mode'),
    
    // 添加接收后端错误的监听器
    onBackendError: (callback) => {
        ipcRenderer.on('backend-error', (event, data) => callback(data));
    },
    
    // 添加处理后端崩溃的监听器
    onBackendCrash: (callback) => {
        ipcRenderer.on('backend-crash', (event, data) => callback(data));
    },
    
    // 添加窗口控制 API
    minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
    closeWindow: () => ipcRenderer.invoke('window-close')
});

// 添加调试信息，确认preload脚本已加载
console.log('Preload script loaded!');