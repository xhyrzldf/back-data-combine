const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const process = require('process');

// 保持对窗口对象的全局引用
let mainWindow;
let pythonProcess;

// 创建主窗口的函数
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'frontend', 'src', 'index.html'));

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (pythonProcess) {
            pythonProcess.kill();
        }
    });
}

// 启动Python后端服务器
function startPythonBackend() {
    let scriptPath;

    if (app.isPackaged) {
        // 在打包的应用中，Python脚本位于resources/backend
        scriptPath = path.join(process.resourcesPath, 'backend', 'backend.py');
    } else {
        // 在开发环境中
        scriptPath = path.join(__dirname, 'backend', 'backend.py');
    }

    // 检查Python脚本是否存在
    if (!fs.existsSync(scriptPath)) {
        console.error(`Python脚本未找到: ${scriptPath}`);
        dialog.showErrorBox('错误', `Python脚本未找到: ${scriptPath}`);
        app.quit();
        return;
    }

    // 确定Python可执行文件
    let pythonExecutable;

    if (app.isPackaged) {
        if (process.platform === 'win32') {
            pythonExecutable = path.join(process.resourcesPath, 'python', 'python.exe');
        } else {
            pythonExecutable = path.join(process.resourcesPath, 'python', 'bin', 'python3');
        }
    } else {
        pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    }

    // 启动Python进程
    pythonProcess = spawn(pythonExecutable, [scriptPath]);

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python进程已退出，退出码 ${code}`);
        if (code !== 0 && mainWindow) {
            dialog.showErrorBox('错误', `Python后端进程已退出，退出码 ${code}`);
        }
    });

    // 等待后端启动
    return new Promise((resolve) => {
        setTimeout(resolve, 1000);
    });
}

// 处理来自渲染进程的IPC消息
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

// 应用生命周期事件
app.whenReady().then(async () => {
    await startPythonBackend();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    if (pythonProcess) {
        pythonProcess.kill();
    }
});