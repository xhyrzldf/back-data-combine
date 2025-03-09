const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const si = require('systeminformation');
const Store = require('electron-store');
const isDev = process.env.NODE_ENV === 'development';

// 存储应用配置和授权数据
const store = new Store({
  encryptionKey: 'your-encryption-key-here', // 加密密钥，确保安全
  name: 'app-config'
});

// 全局变量
let mainWindow;
let backendProcess = null;
let appExpired = false;
const targetPort = 51234;
const expirationDate = new Date('2024-07-01T00:00:00Z');
let hardwareId = null;

// 添加到IPC处理程序
ipcMain.handle('is-development-mode', () => {
    return isDev;
});

// 检查应用程序是否过期
function checkExpiration() {
  const currentDate = new Date();
  
  // 从加密存储中获取上次运行日期
  const lastRunTimestamp = store.get('lastRunTimestamp');
  if (lastRunTimestamp) {
    const lastRunDate = new Date(lastRunTimestamp);
    // 防止时间被回调（如果当前时间早于上次运行时间一天以上，可能是时间被改回）
    if (currentDate < lastRunDate && (lastRunDate - currentDate) > 24 * 60 * 60 * 1000) {
      console.log('检测到可能的时间篡改');
      return true; // 视为过期
    }
  }
  
  // 始终存储当前运行时间
  store.set('lastRunTimestamp', currentDate.toISOString());
  
  // 检查是否超过目标截止日期
  return currentDate >= expirationDate;
}

// 获取主板信息并创建硬件ID
async function getHardwareId() {
  try {
    const baseboardInfo = await si.baseboard();
    const cpuInfo = await si.cpu();
    
    // 组合多个硬件标识符创建唯一指纹
    const idData = [
      baseboardInfo.serial || '',
      baseboardInfo.manufacturer || '',
      baseboardInfo.model || '',
      cpuInfo.manufacturer || '',
      cpuInfo.brand || '',
      cpuInfo.stepping || '',
      cpuInfo.revision || ''
    ].join('|');
    
    // 创建密码学安全的哈希
    return crypto.createHash('sha256').update(idData).digest('hex');
  } catch (error) {
    console.error('获取硬件ID失败:', error);
    return null;
  }
}

// 验证硬件ID是否匹配
function verifyHardwareId(currentId) {
  const storedId = store.get('hardwareId');
  
  // 如果没有存储的ID，则是首次运行，存储当前ID
  if (!storedId) {
    store.set('hardwareId', currentId);
    return true;
  }
  
  // 比较当前硬件ID和存储的ID
  return currentId === storedId;
}

// 启动Python后端
function startBackend() {
  // 确定Python可执行文件的路径
  let pythonExecutable;
  let scriptPath;
  
  if (app.isPackaged) {
    // 在打包的应用中，使用bundled的Python和脚本
    pythonExecutable = path.join(process.resourcesPath, 'backend', 'python.exe');
    scriptPath = path.join(process.resourcesPath, 'backend', 'backend.py');
  } else {
    // 在开发模式下，使用相对路径
    pythonExecutable = 'python';
    scriptPath = path.join(__dirname, 'backend', 'backend.py');
  }
  
  // 检查文件是否存在
  if (app.isPackaged && !fs.existsSync(pythonExecutable)) {
    dialog.showErrorBox('错误', '找不到Python可执行文件');
    app.quit();
    return;
  }
  
  if (!fs.existsSync(scriptPath)) {
    dialog.showErrorBox('错误', '找不到后端脚本文件');
    app.quit();
    return;
  }
  
  // 准备环境变量：加入硬件ID和过期日期
  const env = {
    ...process.env,
    HARDWARE_ID: hardwareId,
    EXPIRATION_DATE: expirationDate.toISOString(),
    TARGET_PORT: targetPort.toString(),
    DEV_MODE: isDev ? "true" : "false"
  };
  
  // 启动Python进程
  console.log(`启动后端: ${pythonExecutable} ${scriptPath}`);
  backendProcess = spawn(pythonExecutable, [scriptPath], { env });
  
  // 处理后端输出
  backendProcess.stdout.on('data', (data) => {
    console.log(`后端输出: ${data}`);
    // 可以在这里检测后端是否准备好接受连接
  });
  
  // 处理后端错误
  backendProcess.stderr.on('data', (data) => {
    console.error(`后端错误: ${data}`);
    // 可以将重要错误信息转发到渲染进程显示给用户
    if (mainWindow) {
      mainWindow.webContents.send('backend-error', data.toString());
    }
  });
  
  // 处理后端退出
  backendProcess.on('close', (code) => {
    console.log(`后端进程退出，代码: ${code}`);
    if (code !== 0) {
      dialog.showErrorBox('后端错误', `后端进程意外退出，代码: ${code}`);
    }
    backendProcess = null;
  });
}

// 创建主窗口
async function createWindow() {
  // 获取硬件ID
  hardwareId = await getHardwareId();
  
  // 验证硬件ID和过期状态
  if (!hardwareId || !verifyHardwareId(hardwareId)) {
    dialog.showErrorBox('验证失败', '此应用程序不被允许在当前硬件上运行。');
    app.quit();
    return;
  }
  
  // 检查过期状态
  appExpired = checkExpiration();
  if (appExpired) {
    dialog.showErrorBox('应用已过期', '此应用程序的授权已过期，无法继续使用。');
    app.quit();
    return;
  }
  
  // 启动后端
  startBackend();
  
  // 创建并配置主窗口
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    frame: false, // 移除窗口边框和系统控制按钮
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false
    }
  });

  // 加载主页面
  mainWindow.loadFile(path.join(__dirname, 'frontend', 'src', 'index.html'));

  // 隐藏菜单栏
  mainWindow.setMenuBarVisibility(false);
  // 完全移除菜单
  mainWindow.setMenu(null);

  // 添加开发者工具切换快捷键
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // 检测 Ctrl+Shift+I
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 在开发模式下自动打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  // 窗口关闭时清理资源
  mainWindow.on('closed', () => {
    mainWindow = null;
    
    // 关闭后端进程
    if (backendProcess) {
      // 在Windows上，需要使用tree-kill来确保进程树被终止
      try {
        const kill = require('tree-kill');
        kill(backendProcess.pid);
      } catch (e) {
        backendProcess.kill();
      }
      backendProcess = null;
    }
  });
}

// App 就绪后创建窗口
app.whenReady().then(() => {
  createWindow();
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// MacOS上点击dock图标重新创建窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

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

// 检查后端是否在运行
ipcMain.handle('check-backend-status', () => {
  return !!backendProcess;
});

// 添加获取后端端口的处理程序
ipcMain.handle('get-backend-port', () => {
  return targetPort;
});

// 应用退出前的清理
app.on('before-quit', () => {
  if (backendProcess) {
    try {
      const kill = require('tree-kill');
      kill(backendProcess.pid);
    } catch (e) {
      backendProcess.kill();
    }
  }
});