const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 960,
        frame: false, // 移除窗口边框和系统控制按钮
        webPreferences: {
            preload: path.join(__dirname, '..', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            sandbox: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

    // 隐藏菜单栏
    mainWindow.setMenuBarVisibility(false);
    // 完全移除菜单
    mainWindow.setMenu(null);

    // 在 createWindow 函数中添加
    mainWindow.webContents.on('before-input-event', (event, input) => {
        // 检测 Ctrl+Shift+I
        if (input.control && input.shift && input.key.toLowerCase() === 'i') {
        mainWindow.webContents.toggleDevTools();
        event.preventDefault();
        }
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

// 添加 IPC 处理程序
ipcMain.handle('show-open-dialog', async (event, options) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(options);
    if (canceled) {
        return '';
    } else {
        return options.properties.includes('multiSelections') ? filePaths : filePaths[0];
    }
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    const { canceled, filePath } = await dialog.showSaveDialog(options);
    if (canceled) {
        return '';
    } else {
        return filePath;
    }
});

ipcMain.handle('get-file-stats', async (event, filePath) => {
    try {
        const stats = fs.statSync(filePath);
        return {
            size: stats.size,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            created: stats.birthtime,
            modified: stats.mtime
        };
    } catch (error) {
        console.error(`获取文件信息失败: ${filePath}`, error);
        throw error;
    }
});

// 添加窗口控制 IPC 处理程序
ipcMain.handle('window-minimize', () => {
    if (mainWindow) {
        mainWindow.minimize();
    }
});

ipcMain.handle('window-close', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});