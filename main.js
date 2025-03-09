// ==================== ESM兼容层（必须放在最开始）====================
// 在任何require语句之前引入ESM兼容性补丁
const Module = require('module');
const path = require('path');
const fs = require('fs');

const iconv = require('iconv-lite');

// 保存原始的require
const originalRequire = Module.prototype.require;

// 检查某个路径是否为ES模块
function isEsmModule(modulePath) {
  const esmModules = ['is-obj', 'conf', 'dot-prop', 'type-fest'];
  return esmModules.some(mod => modulePath.includes(mod));
}

// 创建兼容性实现
const isObjCompat = (value) => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

// 重写require函数
Module.prototype.require = function patched(id) {
  if (isEsmModule(id)) {
    console.log(`[ESM兼容] 拦截到ESM模块导入: ${id}`);
    
    if (id.includes('is-obj')) {
      return isObjCompat;
    }
  }
  
  // 使用原始require处理其他模块
  return originalRequire.apply(this, arguments);
};

// ==================== 自定义Store实现 ====================
class CustomStore {
  constructor(options = {}) {
    this.options = options;
    this.filename = options.name || 'config';
    this.data = {};
    
    try {
      this.appData = app ? app.getPath('userData') : 
        path.join(process.env.APPDATA || process.env.HOME, '.config');
      this.filePath = path.join(this.appData, `${this.filename}.json`);
      this.load();
    } catch (err) {
      console.error('初始化配置存储失败:', err);
    }
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        this.data = JSON.parse(data);
      }
    } catch (err) {
      console.error('加载配置失败:', err);
    }
    return this.data;
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (err) {
      console.error('保存配置失败:', err);
    }
  }

  get(key) {
    return key ? this.data[key] : this.data;
  }

  set(key, value) {
    if (typeof key === 'object') {
      Object.assign(this.data, key);
    } else {
      this.data[key] = value;
    }
    this.save();
    return this;
  }
}

// ==================== 主程序代码 ====================
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const crypto = require('crypto');
const { spawn } = require('child_process');
const os = require('os');
const si = require('systeminformation');
const isDev = process.env.NODE_ENV === 'development';

// 使用自定义Store替代electron-store
const Store = CustomStore;
const store = new Store({
  name: 'app-config',
  encryptionKey: 'your-encryption-key-here'
});

// 全局变量
let mainWindow;
let backendProcess = null;
let appExpired = false;
const targetPort = 51234;
const expirationDate = new Date('2025-07-01T00:00:00Z');
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
  // 准备环境变量：加入硬件ID和过期日期
  const env = {
    ...process.env,
    HARDWARE_ID: hardwareId,
    EXPIRATION_DATE: expirationDate.toISOString(),
    TARGET_PORT: targetPort.toString(),
    DEV_MODE: isDev ? "true" : "false"
  };
  
  // 根据应用是否打包决定使用哪个后端可执行文件
  if (app.isPackaged) {
    // 在打包的应用中，使用打包的后端可执行文件
    const backendExecutable = path.join(process.resourcesPath, 'backend_dist', 'backend_exe.exe');
    
    // 检查可执行文件是否存在
    if (!fs.existsSync(backendExecutable)) {
      dialog.showErrorBox('错误', `找不到后端可执行文件: ${backendExecutable}`);
      app.quit();
      return;
    }
    
    console.log(`启动后端可执行文件: ${backendExecutable}`);
    
    // 启动打包后的后端程序，传递开发模式参数
    backendProcess = spawn(backendExecutable, ['dev'], { env });
  } else {
    // 在开发模式下，使用Python脚本
    const pythonExecutable = 'python';
    const scriptPath = path.join(__dirname, 'backend', 'backend.py');
    
    // 检查脚本文件是否存在
    if (!fs.existsSync(scriptPath)) {
      dialog.showErrorBox('错误', `找不到后端脚本文件: ${scriptPath}`);
      app.quit();
      return;
    }
    
    console.log(`启动后端脚本: ${pythonExecutable} ${scriptPath}`);
    
    // 启动Python进程，传递开发模式参数
    backendProcess = spawn(pythonExecutable, [scriptPath, 'dev'], { env });
  }
  
  backendProcess.stdout.on('data', (data) => {
    console.log(`后端输出: ${iconv.decode(data, 'gbk')}`);
  });
  
  backendProcess.stderr.on('data', (data) => {
    console.error(`后端错误: ${iconv.decode(data, 'gbk')}`);
    
    // 将重要错误信息转发到渲染进程显示给用户
    if (mainWindow) {
      mainWindow.webContents.send('backend-error', iconv.decode(data, 'gbk'));
    }
  });
  
  // 处理后端退出
  backendProcess.on('close', (code) => {
    console.log(`后端进程退出，代码: ${code}`);
    if (code !== 0 && code !== null) {
      dialog.showErrorBox('后端错误', `后端进程意外退出，代码: ${code}`);
    }
    backendProcess = null;
  });
  
  // 处理意外错误
  backendProcess.on('error', (err) => {
    console.error(`启动后端进程时出错: ${err.message}`);
    dialog.showErrorBox('启动错误', `无法启动后端进程: ${err.message}`);
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
  if (appExpired && !isDev) {  // 在开发模式下忽略过期
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
  if (isDev) {
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