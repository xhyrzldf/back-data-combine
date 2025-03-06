const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const process = require('process');
const http = require('http');

// 禁用硬件加速，解决图形驱动相关警告
app.disableHardwareAcceleration();

// 保持对窗口对象的全局引用
let mainWindow;
let pythonProcess;
let backendHealthCheckInterval;
let backendStartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

// 创建主窗口的函数
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true
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
async function startPythonBackend() {
    if (backendStartAttempts >= MAX_RESTART_ATTEMPTS) {
        dialog.showErrorBox('错误', '后端服务启动失败，已达到最大重试次数');
        app.quit();
        return false;
    }
    
    backendStartAttempts++;
    
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
        return false;
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

    // 启动Python进程，设置更大的缓冲区
    pythonProcess = spawn(pythonExecutable, [scriptPath], {
        env: {
            ...process.env,
            // 增加Node IPC缓冲区大小
            NODE_OPTIONS: '--max-old-space-size=4096',
            // 强制设置Flask监听IPv4地址
            FLASK_RUN_HOST: '127.0.0.1'
        },
        stdio: ['pipe', 'pipe', 'pipe']
    });

    console.log(`启动后端进程，PID: ${pythonProcess.pid}`);

    // 设置更大的进程间通信缓冲区
    if (pythonProcess.stdin) {
        pythonProcess.stdin.setDefaultEncoding('utf-8');
        // 增加管道缓冲区
        pythonProcess.stdin._writableState.highWaterMark = 1024 * 1024 * 10; // 10MB
    }
    if (pythonProcess.stdout) {
        // 增加管道缓冲区
        pythonProcess.stdout._readableState.highWaterMark = 1024 * 1024 * 10; // 10MB
    }

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python进程已退出，退出码 ${code}`);
        clearInterval(backendHealthCheckInterval);
        
        if (code !== 0 && mainWindow) {
            mainWindow.webContents.send('backend-crash', {
                message: `Python后端进程意外退出，退出码 ${code}`,
                canRestart: backendStartAttempts < MAX_RESTART_ATTEMPTS
            });
            
            // 尝试重启后端
            if (backendStartAttempts < MAX_RESTART_ATTEMPTS) {
                console.log('尝试重启后端进程...');
                startPythonBackend();
            }
        }
    });

    // 开始健康检查
    startHealthCheck();

    // 等待后端启动
    try {
        await waitForBackendReady();
        console.log('后端服务已就绪');
        backendStartAttempts = 0; // 重置计数器
        return true;
    } catch (error) {
        console.error('后端服务启动失败:', error);
        // 尝试HTTP请求检查，避免Node.js fetch API的问题
        if (await checkBackendReadyWithHttp()) {
            console.log('通过HTTP检查，后端服务实际已就绪');
            backendStartAttempts = 0; // 重置计数器
            return true;
        }
        return false;
    }
}

// 使用原生HTTP检查后端是否就绪
function checkBackendReadyWithHttp() {
    return new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:5000/api/ping', (res) => {
            if (res.statusCode === 200) {
                let data = '';
                res.on('data', chunk => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.status === 'success') {
                            resolve(true);
                            return;
                        }
                    } catch (e) {
                        // 解析JSON失败
                    }
                    resolve(false);
                });
            } else {
                resolve(false);
            }
        });
        
        req.on('error', () => {
            resolve(false);
        });
        
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

// 等待后端准备好
function waitForBackendReady(timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkInterval = 500; // 每500ms检查一次
        
        const check = async () => {
            try {
                // 明确使用IPv4地址
                const response = await fetch('http://127.0.0.1:5000/api/ping');
                const data = await response.json();
                if (data.status === 'success') {
                    resolve();
                    return;
                }
            } catch (error) {
                // 尝试HTTP模块检查
                if (await checkBackendReadyWithHttp()) {
                    resolve();
                    return;
                }
                // 忽略错误，继续尝试
            }
            
            if (Date.now() - startTime > timeout) {
                reject(new Error('后端服务启动超时'));
                return;
            }
            
            setTimeout(check, checkInterval);
        };
        
        check();
    });
}

// 启动健康检查
function startHealthCheck() {
    if (backendHealthCheckInterval) {
        clearInterval(backendHealthCheckInterval);
    }
    
    backendHealthCheckInterval = setInterval(async () => {
        try {
            // 使用HTTP模块进行健康检查，避免fetch问题
            const isHealthy = await checkBackendReadyWithHttp();
            
            if (!isHealthy) {
                console.error('后端健康检查失败');
                
                // 如果后端不响应且进程不存在，尝试重启
                if (!pythonProcess || pythonProcess.exitCode !== null) {
                    console.log('检测到后端已停止，尝试重启...');
                    startPythonBackend();
                }
            }
        } catch (error) {
            console.error('后端健康检查错误:', error);
            
            // 如果后端不响应且进程不存在，尝试重启
            if (!pythonProcess || pythonProcess.exitCode !== null) {
                console.log('检测到后端已停止，尝试重启...');
                startPythonBackend();
            }
        }
    }, 30000); // 每30秒检查一次
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

// 添加获取文件信息的IPC处理
ipcMain.handle('get-file-stats', async (event, filePath) => {
    try {
        const stats = await fs.promises.stat(filePath);
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

// 应用生命周期事件
app.whenReady().then(async () => {
    const backendStarted = await startPythonBackend();
    
    // 即使后端报告启动失败，我们也创建窗口，因为实际上后端可能已经启动
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
    
    if (backendHealthCheckInterval) {
        clearInterval(backendHealthCheckInterval);
    }
});