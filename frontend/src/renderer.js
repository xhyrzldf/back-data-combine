// Global Variables
let selectedFiles = [];
let templates = {};
let defaultTemplate = null;
let currentTemplate = null;
let columnMappings = {};
let currentDatabase = null;
let currentRejectedRow = null;
let currentStep = 1;
let showRecentFiles = true;
let modalStack = [];
let templateMemory = {};

// API Base URL
const API_BASE_URL = 'http://localhost:5000/api';

// DOM Elements
const elements = {
    // Screens
    homeScreen: document.getElementById('homeScreen'),
    newDatabaseScreen: document.getElementById('newDatabaseScreen'),
    databaseViewerScreen: document.getElementById('databaseViewerScreen'),

    // Home Screen
    newDatabaseBtn: document.getElementById('newDatabaseBtn'),
    openDatabaseBtn: document.getElementById('openDatabaseBtn'),
    recentFilesList: document.getElementById('recentFilesList'),

    // New Database Screen
    backToHomeBtn: document.getElementById('backToHomeBtn'),
    selectFilesBtn: document.getElementById('selectFilesBtn'),
    selectedFilesCount: document.getElementById('selectedFilesCount'),
    selectedFilesList: document.getElementById('selectedFilesList'),
    goToStep2Btn: document.getElementById('goToStep2Btn'),

    // Template Selection
    templateSelect: document.getElementById('templateSelect'),
    newTemplateBtn: document.getElementById('newTemplateBtn'),
    templateColumns: document.getElementById('templateColumns'),
    backToStep1Btn: document.getElementById('backToStep1Btn'),
    goToStep3Btn: document.getElementById('goToStep3Btn'),

    // Field Mapping
    analysisProgress: document.getElementById('analysisProgress'),
    mappingResults: document.getElementById('mappingResults'),
    backToStep2Btn: document.getElementById('backToStep2Btn'),
    goToStep4Btn: document.getElementById('goToStep4Btn'),

    // Processing
    processingProgress: document.getElementById('processingProgress'),
    processingStats: document.getElementById('processingStats'),
    goToStep5Btn: document.getElementById('goToStep5Btn'),

    // Manual Verification
    verificationStats: document.getElementById('verificationStats'),
    verificationTable: document.getElementById('verificationTable'),
    verificationTableBody: document.getElementById('verificationTableBody'),
    verificationPagination: document.getElementById('verificationPagination'),
    finishProcessBtn: document.getElementById('finishProcessBtn'),

    // Database Viewer
    backToHomeFromViewerBtn: document.getElementById('backToHomeFromViewerBtn'),
    currentDatabaseName: document.getElementById('currentDatabaseName'),
    filterContainer: document.getElementById('filterContainer'),
    addFilterBtn: document.getElementById('addFilterBtn'),
    applyFiltersBtn: document.getElementById('applyFiltersBtn'),
    sortColumn: document.getElementById('sortColumn'),
    sortDirection: document.getElementById('sortDirection'),
    applySortBtn: document.getElementById('applySortBtn'),
    exportExcelBtn: document.getElementById('exportExcelBtn'),
    dataStats: document.getElementById('dataStats'),
    dataTable: document.getElementById('dataTable'),
    dataTableHead: document.getElementById('dataTableHead'),
    dataTableBody: document.getElementById('dataTableBody'),
    dataPagination: document.getElementById('dataPagination'),

    // Template Editor Modal
    templateEditorModal: document.getElementById('templateEditorModal'),
    templateNameInput: document.getElementById('templateNameInput'),
    isDefaultTemplate: document.getElementById('isDefaultTemplate'),
    templateFieldsList: document.getElementById('templateFieldsList'),
    addFieldBtn: document.getElementById('addFieldBtn'),
    cancelTemplateBtn: document.getElementById('cancelTemplateBtn'),
    saveTemplateBtn: document.getElementById('saveTemplateBtn'),

    // Synonyms Editor Modal
    synonymsEditorModal: document.getElementById('synonymsEditorModal'),
    synonymsFieldName: document.getElementById('synonymsFieldName'),
    synonymsList: document.getElementById('synonymsList'),
    newSynonymInput: document.getElementById('newSynonymInput'),
    addSynonymBtn: document.getElementById('addSynonymBtn'),
    cancelSynonymsBtn: document.getElementById('cancelSynonymsBtn'),
    saveSynonymsBtn: document.getElementById('saveSynonymsBtn'),

    // Row Editor Modal
    rowEditorModal: document.getElementById('rowEditorModal'),
    rowSourceFile: document.getElementById('rowSourceFile'),
    rowNumber: document.getElementById('rowNumber'),
    rowEditorFields: document.getElementById('rowEditorFields'),
    deleteRowBtn: document.getElementById('deleteRowBtn'),
    cancelRowEditBtn: document.getElementById('cancelRowEditBtn'),
    saveRowBtn: document.getElementById('saveRowBtn'),

    // Settings Modal
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    showRecentFiles: document.getElementById('showRecentFiles'),
    settingsTemplatesList: document.getElementById('settingsTemplatesList'),
    manageTemplatesBtn: document.getElementById('manageTemplatesBtn'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),

    // 窗口控制按钮
    minimizeBtn: document.getElementById('minimizeBtn'),
    closeBtn: document.getElementById('closeBtn'),

    // Overlay
    overlay: document.getElementById('overlay')
};

// 初始化应用程序
async function initApp() {
    // 检查后端是否运行
    try {
        const response = await fetch(`${API_BASE_URL}/ping`);
        const data = await response.json();

        if (data.status !== 'success') {
            alert('无法连接到后端服务器。请重启应用程序。');
            return;
        }
    } catch (error) {
        alert('无法连接到后端服务器。请重启应用程序。');
        return;
    }

    // 加载模板
    await loadTemplates();

    // 加载最近文件
    await loadRecentFiles();

    // 添加事件监听器
    addEventListeners();
    
    // 初始化模板记忆功能
    loadTemplateMemory();
    initTemplateMemory();
    initTemplateMemoryUI();
}

// Load templates from backend
async function loadTemplates() {
    try {
        const response = await fetch(`${API_BASE_URL}/templates`);
        const data = await response.json();

        if (data.status === 'success') {
            templates = data.templates;
            defaultTemplate = data.default_template;

            // Update template select
            updateTemplateSelect();
        }
    } catch (error) {
        console.error('Failed to load templates:', error);
    }
}

// Load recent files from backend
async function loadRecentFiles() {
    try {
        const response = await fetch(`${API_BASE_URL}/recent-files`);
        const data = await response.json();

        if (data.status === 'success') {
            updateRecentFilesList(data.recent_files);
        }
    } catch (error) {
        console.error('Failed to load recent files:', error);
    }
}

// Update the template select dropdown
function updateTemplateSelect() {
    elements.templateSelect.innerHTML = '';

    for (const name in templates) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;

        if (name === defaultTemplate) {
            option.selected = true;
            currentTemplate = name;
        }

        elements.templateSelect.appendChild(option);
    }

    // Update template preview
    updateTemplatePreview();
}

// Update the template preview
function updateTemplatePreview() {
    elements.templateColumns.innerHTML = '';

    const template = templates[currentTemplate];

    if (!template) return;

    for (const field in template) {
        const columnEl = document.createElement('div');
        columnEl.className = 'template-column';

        const fieldNameEl = document.createElement('span');
        fieldNameEl.className = 'field-name';
        fieldNameEl.textContent = field;

        const typeEl = document.createElement('span');
        typeEl.className = 'column-type';
        typeEl.textContent = template[field].type;

        const synonymsBtn = document.createElement('span');
        synonymsBtn.className = 'column-synonyms-btn';
        synonymsBtn.innerHTML = '📝';
        synonymsBtn.title = '编辑近义词';
        synonymsBtn.onclick = () => openSynonymsEditor(field);

        columnEl.appendChild(fieldNameEl);
        columnEl.appendChild(typeEl);
        columnEl.appendChild(synonymsBtn);

        elements.templateColumns.appendChild(columnEl);
    }
}

// Update the recent files list
function updateRecentFilesList(files) {
    elements.recentFilesList.innerHTML = '';

    if (!showRecentFiles || !files || files.length === 0) {
        const emptyEl = document.createElement('li');
        emptyEl.textContent = '无最近文件';
        elements.recentFilesList.appendChild(emptyEl);
        return;
    }

    files.forEach(file => {
        const fileEl = document.createElement('li');

        const fileLink = document.createElement('a');
        fileLink.href = '#';
        fileLink.textContent = file;
        fileLink.onclick = (e) => {
            e.preventDefault();
            openDatabase(file);
        };

        fileEl.appendChild(fileLink);
        elements.recentFilesList.appendChild(fileEl);
    });
}

// Add event listeners
function addEventListeners() {
    // Navigation
    elements.newDatabaseBtn.addEventListener('click', () => showScreen('newDatabaseScreen'));
    elements.openDatabaseBtn.addEventListener('click', async () => {
        const file = await window.electronAPI.showOpenDialog({
            title: '选择数据库文件',
            filters: [{ name: '数据库文件', extensions: ['db', 'sqlite'] }],
            properties: ['openFile']
        });

        if (file && file !== '') {
            openDatabase(file);
        }
    });
    elements.backToHomeBtn.addEventListener('click', () => showScreen('homeScreen'));
    elements.backToHomeFromViewerBtn.addEventListener('click', () => showScreen('homeScreen'));

    // New Database Screen
    elements.selectFilesBtn.addEventListener('click', selectFiles);
    elements.goToStep2Btn.addEventListener('click', () => goToStep(2));
    elements.backToStep1Btn.addEventListener('click', () => goToStep(1));
    elements.goToStep3Btn.addEventListener('click', () => goToStep(3));
    elements.backToStep2Btn.addEventListener('click', () => goToStep(2));
    elements.goToStep4Btn.addEventListener('click', () => {
        if (hasMappingConflicts()) {
            alert('存在字段映射冲突，请确保每个目标字段只被映射一次。');
            return;
        }
        goToStep(4);
    });
    elements.goToStep5Btn.addEventListener('click', () => goToStep(5));
    elements.finishProcessBtn.addEventListener('click', finishProcessing);

    // Template Selection
    elements.templateSelect.addEventListener('change', (e) => {
        currentTemplate = e.target.value;
        updateTemplatePreview();
    });
    elements.newTemplateBtn.addEventListener('click', openTemplateEditor);

    // 窗口控制按钮事件
    elements.minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
    });
    
    elements.closeBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });

    // Template Editor
    elements.addFieldBtn.addEventListener('click', addTemplateField);
    elements.cancelTemplateBtn.addEventListener('click', closeTemplateEditor);
    elements.saveTemplateBtn.addEventListener('click', saveTemplate);

    // Synonyms Editor
    elements.addSynonymBtn.addEventListener('click', addSynonym);
    elements.cancelSynonymsBtn.addEventListener('click', closeSynonymsEditor);
    elements.saveSynonymsBtn.addEventListener('click', saveSynonyms);

    // Row Editor
    elements.deleteRowBtn.addEventListener('click', deleteRejectedRow);
    elements.cancelRowEditBtn.addEventListener('click', closeRowEditor);
    elements.saveRowBtn.addEventListener('click', saveRejectedRow);

    // Database Viewer
    elements.addFilterBtn.addEventListener('click', addFilterRow);
    elements.applyFiltersBtn.addEventListener('click', applyFilters);
    elements.exportExcelBtn.addEventListener('click', exportToExcel);

    // 监听筛选操作符变化
    elements.filterContainer.addEventListener('change', event => {
        if (event.target.classList.contains('filter-operator')) {
            const row = event.target.closest('.filter-row');
            const valueInput = row.querySelector('.filter-value');
            
            if (event.target.value === 'not_null') {
                valueInput.disabled = true;
                valueInput.placeholder = '不需要输入';
                valueInput.value = '';
            } else {
                valueInput.disabled = false;
                valueInput.placeholder = '值';
            }
        }
    });

    // Settings
    elements.settingsBtn.addEventListener('click', openSettings);
    elements.showRecentFiles.addEventListener('change', (e) => {
        showRecentFiles = e.target.checked;
        updateRecentFilesList(recentFiles);
    });
    elements.manageTemplatesBtn.addEventListener('click', openTemplateEditor);
    elements.saveSettingsBtn.addEventListener('click', saveSettings);

    // Modal close buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });
}

// Show a specific screen
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    document.getElementById(screenId).classList.add('active');

    if (screenId === 'newDatabaseScreen') {
        goToStep(1);
    }
}

// Go to a specific step in the new database workflow
function goToStep(step) {
    // Hide all step panels
    document.querySelectorAll('.step-panel').forEach(panel => {
        panel.classList.remove('active');
    });

    // Update step indicators
    document.querySelectorAll('.step').forEach(stepEl => {
        const stepNum = parseInt(stepEl.dataset.step);

        if (stepNum <= step) {
            stepEl.classList.add('active');
        } else {
            stepEl.classList.remove('active');
        }
    });

    // Show the current step panel
    document.querySelector(`.step-panel[data-step="${step}"]`).classList.add('active');

    currentStep = step;

    // Perform step-specific actions
    if (step === 3) {
        startFileAnalysis();
    } else if (step === 4) {
        startProcessing();
    } else if (step === 5) {
        loadRejectedRows();
    }
}

// Select Excel files
async function selectFiles() {
    const files = await window.electronAPI.showOpenDialog({
        title: '选择Excel文件',
        filters: [{ name: 'Excel文件', extensions: ['xls', 'xlsx'] }],
        properties: ['openFile', 'multiSelections']
    });

    if (!files || files.length === 0) return;

    // Check file count limit
    if (files.length > 20000) {
        alert('一次最多导入20,000张表格，请减少选择的文件数量');
        return;
    }

    selectedFiles = files;
    elements.selectedFilesCount.textContent = `已选择 ${selectedFiles.length} 个文件`;
    elements.goToStep2Btn.disabled = false;

    // Update file list
    updateSelectedFilesList();
}

// Update the list of selected files
function updateSelectedFilesList() {
    elements.selectedFilesList.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const fileEl = document.createElement('div');
        fileEl.className = 'selected-file-item';

        const fileNameEl = document.createElement('span');
        fileNameEl.textContent = file.split('/').pop().split('\\').pop();

        const removeBtn = document.createElement('span');
        removeBtn.className = 'file-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => removeFile(index);

        fileEl.appendChild(fileNameEl);
        fileEl.appendChild(removeBtn);

        elements.selectedFilesList.appendChild(fileEl);
    });
}

// Remove a file from the selected files list
function removeFile(index) {
    selectedFiles.splice(index, 1);
    elements.selectedFilesCount.textContent = `已选择 ${selectedFiles.length} 个文件`;
    elements.goToStep2Btn.disabled = selectedFiles.length === 0;
    updateSelectedFilesList();
}

// Open the template editor
function openTemplateEditor(isNewTemplate = true) {
    if (isNewTemplate) {
        elements.templateNameInput.value = '';
        elements.templateFieldsList.innerHTML = '';
        elements.isDefaultTemplate.checked = false;

        // Add default fields
        const defaultFields = {
            "ID": { "type": "int", "synonyms": ["序号", "ID", "id", "编号"] },
            "记账日期": { "type": "date", "synonyms": ["交易日期", "会计日期", "日期"] },
            "记账时间": { "type": "time", "synonyms": ["交易时间", "时间"] },
            "账户名": { "type": "text", "synonyms": ["户名", "客户名称", "客户账户名"] },
            "账号": { "type": "text", "synonyms": ["客户账号", "账户", "account"] },
            "开户行": { "type": "text", "synonyms": ["开户银行", "开户机构", "账户开户机构"] },
            "币种": { "type": "text", "synonyms": ["货币代号", "币种代码", "currency"] },
            "借贷": { "type": "text", "synonyms": ["借贷标志", "借贷方向", "借贷标记"] },
            "交易金额": { "type": "float", "synonyms": ["金额", "发生额", "交易额"] },
            "交易渠道": { "type": "text", "synonyms": ["渠道", "交易方式", "渠道类型编号"] },
            "网点名称": { "type": "text", "synonyms": ["网点", "营业网点", "营业机构"] },
            "附言": { "type": "text", "synonyms": ["摘要", "备注", "摘要描述"] },
            "余额": { "type": "float", "synonyms": ["账户余额", "balance", "当前余额"] },
            "对手账户名": { "type": "text", "synonyms": ["对方户名", "交易对方账户名", "对方账户名称"] },
            "对手账号": { "type": "text", "synonyms": ["对方账号", "交易对方账号", "对方账户账号"] },
            "对手开户行": { "type": "text", "synonyms": ["对方行名", "对方机构网点名称", "对方开户银行"] }
        };

        for (const field in defaultFields) {
            addTemplateField(field, defaultFields[field].type, defaultFields[field].synonyms);
        }
    } else {
        // Edit existing template
        const template = templates[currentTemplate];

        if (!template) return;

        elements.templateNameInput.value = currentTemplate;
        elements.isDefaultTemplate.checked = currentTemplate === defaultTemplate;
        elements.templateFieldsList.innerHTML = '';

        for (const field in template) {
            addTemplateField(field, template[field].type, template[field].synonyms);
        }
    }

    openModal('templateEditorModal');
}


// 计算文件签名（排序后的列名）
function calculateFileSignature(columns) {
    return columns.map(col => col.toString().trim()).sort().join('|');
}

// 更新startFileAnalysis函数，检查已有映射
async function startFileAnalysisWithMemory() {
    const originalStartFileAnalysis = startFileAnalysis;
    
    startFileAnalysis = async function() {
        elements.analysisProgress.style.display = 'block';
        elements.mappingResults.innerHTML = '';
        elements.goToStep4Btn.disabled = true;
        
        // 重置列映射
        columnMappings = {};
        
        // 跟踪文件签名，判断是否找到匹配
        const fileSignatures = {};
        let foundExistingMapping = false;
        
        // 逐个分析文件
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const fileName = file.split('/').pop().split('\\').pop();
            
            // 更新进度
            const progress = ((i + 1) / selectedFiles.length) * 100;
            const progressFill = elements.analysisProgress.querySelector('.progress-fill');
            const progressText = elements.analysisProgress.querySelector('.progress-text');
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `正在分析文件 ${i+1}/${selectedFiles.length}: ${fileName}`;
            
            try {
                const response = await fetch(`${API_BASE_URL}/analyze-file`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file_path: file,
                        template_name: currentTemplate
                    })
                });
                
                const data = await response.json();
                
                if (data.status === 'success') {
                    // 计算文件签名
                    const signature = calculateFileSignature(data.columns.map(c => c.original_name));
                    fileSignatures[fileName] = signature;
                    
                    // 检查是否有此签名的存储映射
                    if (templateMemory[currentTemplate] && 
                        templateMemory[currentTemplate][signature]) {
                        foundExistingMapping = true;
                    }
                    
                    // 显示映射UI
                    displayFileMapping(data, i);
                } else {
                    console.error(`分析文件失败 ${fileName}: ${data.message}`);
                }
            } catch (error) {
                console.error(`分析文件失败 ${fileName}:`, error);
            }
        }
        
        // 如果找到已有映射，提示用户
        if (foundExistingMapping) {
            setTimeout(async () => {
                const useExisting = await showDynamicConfirm(
                    '检测到相同字段的Excel文件已经导入过。是否应用之前的字段映射设置？\n\n选择"确定"将覆盖默认的智能匹配结果。', 
                    '应用已有映射'
                );
                
                if (useExisting) {
                    // 应用存储的映射
                    applyStoredMappings(fileSignatures);
                }
            }, 500);
        }
        
        // 更新映射警告
        updateMappingWarnings();
        elements.goToStep4Btn.disabled = false;
    };
    
    // 调用更新后的函数
    return startFileAnalysis();
}

// 应用存储的映射到当前文件
function applyStoredMappings(fileSignatures) {
    for (const fileName in fileSignatures) {
        const signature = fileSignatures[fileName];
        
        if (templateMemory[currentTemplate] && 
            templateMemory[currentTemplate][signature]) {
            
            const storedMapping = templateMemory[currentTemplate][signature];
            
            // 初始化此文件的列映射
            if (!columnMappings[fileName]) {
                columnMappings[fileName] = {};
            }
            
            // 应用存储的映射
            for (const originalCol in storedMapping) {
                columnMappings[fileName][originalCol] = storedMapping[originalCol];
            }
            
            // 更新UI以反映这些映射
            const fileEls = document.querySelectorAll('.mapping-file');
            
            fileEls.forEach(fileEl => {
                const headerEl = fileEl.querySelector('.mapping-file-header h4');
                if (headerEl && headerEl.textContent.includes(fileName)) {
                    const selects = fileEl.querySelectorAll('.mapping-select');
                    
                    selects.forEach(select => {
                        const columnEl = select.closest('.mapping-column');
                        const nameEl = columnEl.querySelector('.column-name');
                        
                        if (nameEl) {
                            const originalColName = nameEl.textContent;
                            
                            if (storedMapping[originalColName]) {
                                select.value = storedMapping[originalColName];
                                
                                // 触发change事件更新视觉效果和内部状态
                                const event = new Event('change');
                                select.dispatchEvent(event);
                            }
                        }
                    });
                }
            });
        }
    }
    
    // 更新冲突警告
    updateMappingWarnings();
}

// 存储当前映射
function storeCurrentMappings() {
    // 确保templateMemory有当前模板的条目
    if (!templateMemory[currentTemplate]) {
        templateMemory[currentTemplate] = {};
    }
    
    // 对每个文件，按签名存储其映射
    for (const fileName in columnMappings) {
        // 获取该文件的映射结果元素
        const fileEls = document.querySelectorAll('.mapping-file');
        
        for (const fileEl of fileEls) {
            const headerEl = fileEl.querySelector('.mapping-file-header h4');
            if (headerEl && headerEl.textContent.includes(fileName)) {
                const columns = fileEl.querySelectorAll('.mapping-column');
                
                // 获取所有列名创建签名
                const columnNames = [];
                columns.forEach(col => {
                    const nameEl = col.querySelector('.column-name');
                    if (nameEl) {
                        columnNames.push(nameEl.textContent);
                    }
                });
                
                // 计算签名
                const signature = calculateFileSignature(columnNames);
                
                // 存储映射
                templateMemory[currentTemplate][signature] = {...columnMappings[fileName]};
                break;
            }
        }
    }
    
    // 保存到本地存储以持久化
    localStorage.setItem('templateMemory', JSON.stringify(templateMemory));
    
    console.log('存储模板映射:', templateMemory);
}

// 启动时从存储加载模板记忆
function loadTemplateMemory() {
    try {
        const stored = localStorage.getItem('templateMemory');
        if (stored) {
            templateMemory = JSON.parse(stored);
            console.log('加载模板记忆:', templateMemory);
        }
    } catch (e) {
        console.error('加载模板记忆失败:', e);
    }
}

function updateDisplayFileMappingWithConflictResolution() {
    // 保存原始函数
    const originalDisplayFileMapping = displayFileMapping;
    
    // 重写displayFileMapping函数以处理冲突
    displayFileMapping = function(data, fileIndex) {
        // 在显示前解决映射冲突
        data.columns = detectAndResolveMappingConflicts(data.columns);
        
        // 调用原始函数显示映射
        originalDisplayFileMapping(data, fileIndex);
    };
}


// 添加模板记忆系统的钩子
function initTemplateMemory() {
    // 加载存储的映射
    loadTemplateMemory();
    
    // 重写startFileAnalysis
    startFileAnalysisWithMemory();
    
    // 重写displayFileMapping
    updateDisplayFileMappingWithConflictResolution();
    updateDisplayFileMappingWithMemory();
    
    // 添加钩子，在处理成功完成时存储映射
    const originalFinishProcessing = finishProcessing;
    finishProcessing = function() {
        // 存储当前映射
        storeCurrentMappings();
        
        // 调用原始函数
        originalFinishProcessing();
    };
}

async function showDynamicConfirm(message, title = "确认操作") {
    return new Promise((resolve) => {
        // 创建一个唯一ID
        const modalId = 'confirm_' + Date.now();
        
        // 创建模态窗口元素
        const modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'modal';
        
        // 设置模态窗口内容
        modalEl.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="close-modal">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body" style="text-align: center; padding: 24px;">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn secondary cancel-btn">取消</button>
                    <button class="btn primary ok-btn">确定</button>
                </div>
            </div>
        `;
        
        // 添加到文档
        document.body.appendChild(modalEl);
        
        // 打开模态窗口
        openModal(modalId);
        
        // 添加按钮事件
        const closeHandler = () => {
            closeModal(modalId);
            setTimeout(() => {
                document.body.removeChild(modalEl);
            }, 300);
            resolve(false);
        };
        
        const okHandler = () => {
            closeModal(modalId);
            setTimeout(() => {
                document.body.removeChild(modalEl);
            }, 300);
            resolve(true);
        };
        
        // 绑定事件
        modalEl.querySelector('.close-modal').addEventListener('click', closeHandler);
        modalEl.querySelector('.cancel-btn').addEventListener('click', closeHandler);
        modalEl.querySelector('.ok-btn').addEventListener('click', okHandler);
    });
}


// Add a field to the template editor
function addTemplateField(field = '', type = 'text', synonyms = []) {
    const fieldEl = document.createElement('div');
    fieldEl.className = 'template-field';

    const fieldNameInput = document.createElement('input');
    fieldNameInput.type = 'text';
    fieldNameInput.className = 'field-name';
    fieldNameInput.placeholder = '字段名称';
    fieldNameInput.value = field;

    const fieldTypeSelect = document.createElement('select');
    fieldTypeSelect.className = 'field-type';

    const types = ['text', 'int', 'float', 'date', 'time'];
    types.forEach(t => {
        const option = document.createElement('option');
        option.value = t;
        option.textContent = t;
        if (t === type) option.selected = true;
        fieldTypeSelect.appendChild(option);
    });

    const synonymsBtn = document.createElement('button');
    synonymsBtn.className = 'btn small';
    synonymsBtn.textContent = '近义词';
    synonymsBtn.onclick = () => {
        const fieldName = fieldNameInput.value.trim();
        if (!fieldName) {
            alert('请先填写字段名称');
            return;
        }
        openSynonymsEditorForTemplate(fieldName, synonyms);
    };

    const removeBtn = document.createElement('span');
    removeBtn.className = 'field-remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => fieldEl.remove();

    fieldEl.appendChild(fieldNameInput);
    fieldEl.appendChild(fieldTypeSelect);
    fieldEl.appendChild(synonymsBtn);
    fieldEl.appendChild(removeBtn);

    elements.templateFieldsList.appendChild(fieldEl);

    // Store synonyms in data attribute
    fieldEl.dataset.synonyms = JSON.stringify(synonyms);
}

// Open the synonyms editor for a template field
function openSynonymsEditorForTemplate(fieldName, synonyms) {
    elements.synonymsFieldName.textContent = `字段 "${fieldName}" 的近义词`;

    updateSynonymsList(synonyms);

    // Store current field element
    elements.synonymsEditorModal.dataset.fieldName = fieldName;

    openModal('synonymsEditorModal');
}

// Open the synonyms editor for an existing template field
function openSynonymsEditor(fieldName) {
    const template = templates[currentTemplate];

    if (!template || !template[fieldName]) return;

    elements.synonymsFieldName.textContent = `字段 "${fieldName}" 的近义词`;

    updateSynonymsList(template[fieldName].synonyms);

    // Store current field and template
    elements.synonymsEditorModal.dataset.fieldName = fieldName;
    elements.synonymsEditorModal.dataset.templateName = currentTemplate;

    openModal('synonymsEditorModal');
}

// Update the synonyms list in the editor
function updateSynonymsList(synonyms) {
    elements.synonymsList.innerHTML = '';

    synonyms.forEach((synonym, index) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'synonym-tag';

        const textEl = document.createElement('span');
        textEl.textContent = synonym;

        const removeEl = document.createElement('span');
        removeEl.className = 'synonym-remove';
        removeEl.innerHTML = '&times;';
        removeEl.onclick = () => {
            synonyms.splice(index, 1);
            updateSynonymsList(synonyms);
        };

        tagEl.appendChild(textEl);
        tagEl.appendChild(removeEl);

        elements.synonymsList.appendChild(tagEl);
    });

    // Store synonyms in data attribute
    elements.synonymsList.dataset.synonyms = JSON.stringify(synonyms);
}

// 更新模板映射的UI显示
function updateTemplateMappingsUI() {
    const mappingsContainer = document.getElementById('templateMappingsList');
    if (!mappingsContainer) return;
    
    mappingsContainer.innerHTML = '';
    
    // 获取当前模板记忆
    const currentTemplateMemory = templateMemory[currentTemplate] || {};
    
    if (Object.keys(currentTemplateMemory).length === 0) {
        mappingsContainer.innerHTML = '<p>该模板还没有记住任何Excel表格的字段映射。</p>';
        return;
    }
    
    // 为每个映射创建一个卡片
    Object.keys(currentTemplateMemory).forEach((signature, index) => {
        const mappingEl = document.createElement('div');
        mappingEl.className = 'template-mapping-card';
        
        // 从签名中提取列名
        const columnNames = signature.split('|');
        
        // 创建带序号的标题
        const headerEl = document.createElement('h5');
        headerEl.innerHTML = `
            <span>映射配置 #${index + 1} (${columnNames.length} 个字段)</span>
            <span class="mapping-remove-btn" data-signature="${signature}">&times;</span>
        `;
        
        // 创建映射表格
        const tableEl = document.createElement('table');
        tableEl.className = 'mapping-table';
        
        // 表格标题
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>Excel字段名</th>
            <th>映射到模板字段</th>
        `;
        thead.appendChild(headerRow);
        tableEl.appendChild(thead);
        
        // 表格主体
        const tbody = document.createElement('tbody');
        const mapping = currentTemplateMemory[signature];
        
        Object.keys(mapping).forEach(originalCol => {
            if (mapping[originalCol]) { // 只显示已映射的字段
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${originalCol}</td>
                    <td>${mapping[originalCol] || '<未映射>'}</td>
                `;
                tbody.appendChild(row);
            }
        });
        
        tableEl.appendChild(tbody);
        
        // 添加元素到容器
        mappingEl.appendChild(headerEl);
        mappingEl.appendChild(tableEl);
        mappingsContainer.appendChild(mappingEl);
    });
    
    // 为删除按钮添加事件监听器
    mappingsContainer.querySelectorAll('.mapping-remove-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const signature = this.dataset.signature;
            const confirmDelete = await showDynamicConfirm('确定要删除这个字段映射配置吗？', '删除映射配置');
            if (confirmDelete) {
                delete templateMemory[currentTemplate][signature];
                localStorage.setItem('templateMemory', JSON.stringify(templateMemory));
                updateTemplateMappingsUI();
            }
        });
    });
}

// 重写openTemplateEditor函数以显示映射
function updateOpenTemplateEditor() {
    const originalOpenTemplateEditor = openTemplateEditor;
    
    openTemplateEditor = function(isNewTemplate = true) {
        // 调用原始函数
        originalOpenTemplateEditor(isNewTemplate);
        
        // 更新模板映射显示
        updateTemplateMappingsUI();
    };
}

// 初始化UI增强
function initTemplateMemoryUI() {
    updateOpenTemplateEditor();
}

// Add a synonym to the list
function addSynonym() {
    const newSynonym = elements.newSynonymInput.value.trim();

    if (!newSynonym) return;

    let synonyms = [];
    try {
        synonyms = JSON.parse(elements.synonymsList.dataset.synonyms || '[]');
    } catch (error) {
        synonyms = [];
    }

    if (!synonyms.includes(newSynonym)) {
        synonyms.push(newSynonym);
        updateSynonymsList(synonyms);
    }

    elements.newSynonymInput.value = '';
}

// Save synonyms
function saveSynonyms() {
    const fieldName = elements.synonymsEditorModal.dataset.fieldName;
    const templateName = elements.synonymsEditorModal.dataset.templateName;

    let synonyms = [];
    try {
        synonyms = JSON.parse(elements.synonymsList.dataset.synonyms || '[]');
    } catch (error) {
        synonyms = [];
    }

    if (templateName) {
        // Update existing template
        updateSynonymsInTemplate(templateName, fieldName, synonyms);
    } else {
        // Update template being created in editor
        const fieldElements = elements.templateFieldsList.querySelectorAll('.template-field');

        fieldElements.forEach(fieldEl => {
            const name = fieldEl.querySelector('.field-name').value.trim();

            if (name === fieldName) {
                fieldEl.dataset.synonyms = JSON.stringify(synonyms);
            }
        });
    }

    closeSynonymsEditor();
}

// Update synonyms in an existing template
async function updateSynonymsInTemplate(templateName, fieldName, synonyms) {
    try {
        const response = await fetch(`${API_BASE_URL}/update-synonyms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_name: templateName,
                field_name: fieldName,
                synonyms: synonyms
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Update local templates
            templates[templateName][fieldName].synonyms = synonyms;
            updateTemplatePreview();
        } else {
            alert(`Failed to update synonyms: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to update synonyms:', error);
        alert('Failed to update synonyms. Please try again.');
    }
}

// Save the template
async function saveTemplate() {
    const name = elements.templateNameInput.value.trim();

    if (!name) {
        alert('请输入模板名称');
        return;
    }

    const template = {};
    const fieldElements = elements.templateFieldsList.querySelectorAll('.template-field');

    fieldElements.forEach(fieldEl => {
        const fieldName = fieldEl.querySelector('.field-name').value.trim();
        const fieldType = fieldEl.querySelector('.field-type').value;

        if (!fieldName) return;

        let synonyms = [];
        try {
            synonyms = JSON.parse(fieldEl.dataset.synonyms || '[]');
        } catch (error) {
            synonyms = [];
        }

        template[fieldName] = {
            type: fieldType,
            synonyms: synonyms
        };
    });

    if (Object.keys(template).length === 0) {
        alert('请至少添加一个字段');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                template: template,
                is_default: elements.isDefaultTemplate.checked
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Update local templates
            templates[name] = template;

            if (elements.isDefaultTemplate.checked) {
                defaultTemplate = name;
            }

            updateTemplateSelect();
            closeTemplateEditor();
        } else {
            alert(`Failed to save template: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to save template:', error);
        alert('Failed to save template. Please try again.');
    }
}

// Start file analysis
async function startFileAnalysis() {
    if (selectedFiles.length === 0) return;

    elements.analysisProgress.style.display = 'block';
    elements.mappingResults.innerHTML = '';
    elements.goToStep4Btn.disabled = true;

    // Progress bar animation
    const progressFill = elements.analysisProgress.querySelector('.progress-fill');
    const progressText = elements.analysisProgress.querySelector('.progress-text');

    // Reset column mappings
    columnMappings = {};

    // Analyze files one by one
    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileName = file.split('/').pop().split('\\').pop();

        // Update progress
        const progress = ((i + 1) / selectedFiles.length) * 100;
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `正在分析文件 ${i+1}/${selectedFiles.length}: ${fileName}`;

        try {
            const response = await fetch(`${API_BASE_URL}/analyze-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_path: file,
                    template_name: currentTemplate
                })
            });

            const data = await response.json();

            if (data.status === 'success') {
                displayFileMapping(data, i);
            } else {
                console.error(`Failed to analyze file ${fileName}: ${data.message}`);
            }
        } catch (error) {
            console.error(`Failed to analyze file ${fileName}:`, error);
        }
    }

    // 更新映射警告状态
    updateMappingWarnings();

    elements.goToStep4Btn.disabled = false;
}

// Display file mapping results
function displayFileMapping(data, fileIndex) {
    const fileName = data.file_name;
    const columns = data.columns;

    const fileEl = document.createElement('div');
    fileEl.className = 'mapping-file';

    const headerEl = document.createElement('div');
    headerEl.className = 'mapping-file-header';

    const titleEl = document.createElement('h4');
    titleEl.textContent = `文件 ${fileIndex+1}: ${fileName}`;

    headerEl.appendChild(titleEl);
    fileEl.appendChild(headerEl);

    const columnsEl = document.createElement('div');
    columnsEl.className = 'mapping-columns';

    columns.forEach(column => {
        const columnEl = document.createElement('div');
        columnEl.className = 'mapping-column';

        const nameEl = document.createElement('div');
        nameEl.className = 'column-name';
        nameEl.textContent = column.original_name;

        const typeEl = document.createElement('div');
        typeEl.className = 'column-type';
        typeEl.textContent = `类型: ${column.detected_type}`;

        const mappingEl = document.createElement('div');
        mappingEl.className = 'column-mapping';

        const selectEl = document.createElement('select');
        selectEl.className = 'mapping-select';

        // Add "不映射" option
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '不映射';
        selectEl.appendChild(noneOption);

        // Add template fields as options
        const template = templates[currentTemplate];
        for (const field in template) {
            const option = document.createElement('option');
            option.value = field;
            option.textContent = field;

            if (column.mapped_to === field) {
                option.selected = true;
            }

            selectEl.appendChild(option);
        }

        // Add confidence indicator if mapped
        let confidenceEl = null;
        if (column.mapped_to) {
            confidenceEl = document.createElement('span');
            confidenceEl.className = `mapping-confidence ${getConfidenceClass(column.similarity)}`;
            confidenceEl.textContent = `${Math.round(column.similarity * 100)}%`;
        }

        // Handle change event
        selectEl.addEventListener('change', (e) => {
            const selectedField = e.target.value;

            // Update column mappings
            if (!columnMappings[fileName]) {
                columnMappings[fileName] = {};
            }

            columnMappings[fileName][column.original_name] = selectedField;

            // 更新冲突警告状态
            updateMappingWarnings();
        });

        // Initialize column mappings
        if (!columnMappings[fileName]) {
            columnMappings[fileName] = {};
        }
        columnMappings[fileName][column.original_name] = column.mapped_to || '';

        mappingEl.appendChild(selectEl);
        if (confidenceEl) mappingEl.appendChild(confidenceEl);

        // 添加警告图标容器（初始隐藏）
        const warningEl = document.createElement('span');
        warningEl.className = 'mapping-warning';
        warningEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 9V14M12 17.5V18M12 3L4 5V11.5C4 15.6459 7.11566 20.0848 12 22C16.8843 20.0848 20 15.6459 20 11.5V5L12 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        warningEl.style.display = 'none'; // 默认隐藏

        // 添加提示文本容器
        const tooltipEl = document.createElement('span');
        tooltipEl.className = 'warning-tooltip';
        warningEl.appendChild(tooltipEl);

        mappingEl.appendChild(warningEl);

        // 保存字段名和警告元素的引用，便于后续更新
        selectEl.dataset.fileName = fileName;
        selectEl.dataset.columnName = column.original_name;
        selectEl.warningEl = warningEl;
        selectEl.tooltipEl = tooltipEl;

        // Add sample values
        const samplesEl = document.createElement('div');
        samplesEl.className = 'sample-values';
        samplesEl.textContent = '样本: ';

        column.sample_values.forEach((value, index) => {
            const valueEl = document.createElement('span');
            valueEl.className = 'sample-value';
            valueEl.textContent = value;

            if (index < column.sample_values.length - 1) {
                valueEl.textContent += ', ';
            }

            samplesEl.appendChild(valueEl);
        });

        columnEl.appendChild(nameEl);
        columnEl.appendChild(typeEl);
        columnEl.appendChild(mappingEl);
        columnEl.appendChild(samplesEl);

        columnsEl.appendChild(columnEl);
    });

    fileEl.appendChild(columnsEl);
    elements.mappingResults.appendChild(fileEl);

    // 在所有文件加载完成后更新
    if (fileIndex === selectedFiles.length - 1) {
        // 延迟一下确保DOM更新完成
        setTimeout(() => {
            updateMappingWarnings();
        }, 100);
    }
}

// 更新所有映射冲突警告
function updateMappingWarnings() {
    const conflicts = detectMappingConflicts();
    
    // 获取所有映射选择元素
    const mappingSelects = document.querySelectorAll('.mapping-select');
    
    // 首先隐藏所有警告
    mappingSelects.forEach(select => {
        if (select.warningEl) {
            select.warningEl.style.display = 'none';
        }
    });
    
    // 显示有冲突的警告
    mappingSelects.forEach(select => {
        const fileName = select.dataset.fileName;
        const columnName = select.dataset.columnName;
        const targetField = select.value;
        
        if (!fileName || !columnName || !targetField) return;
        
        if (conflicts[fileName] && conflicts[fileName][targetField]) {
            const conflictingColumns = conflicts[fileName][targetField];
            
            // 如果当前列在冲突列表中，则显示警告
            if (conflictingColumns.includes(columnName)) {
                if (select.warningEl) {
                    select.warningEl.style.display = 'inline-flex';
                    select.tooltipEl.textContent = `字段 "${targetField}" 已被多个列映射: ${conflictingColumns.join(', ')}`;
                }
            }
        }
    });
    
    // 更新"开始处理"按钮状态
    elements.goToStep4Btn.disabled = hasMappingConflicts();
}

// Get confidence class based on similarity score
function getConfidenceClass(similarity) {
    if (similarity >= 0.8) return 'confidence-high';
    if (similarity >= 0.6) return 'confidence-medium';
    return 'confidence-low';
}

// 增加超时和重试机制的API请求函数
async function fetchWithRetry(url, options, maxRetries = 3, timeout = 60000) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // 添加请求超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            options.signal = controller.signal;
            
            const response = await fetch(url, options);
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            lastError = error;
            
            if (error.name === 'AbortError') {
                console.error(`请求超时 (尝试 ${attempt + 1}/${maxRetries})`);
            } else {
                console.error(`请求失败: ${error.message} (尝试 ${attempt + 1}/${maxRetries})`);
            }
            
            if (attempt < maxRetries - 1) {
                // 指数退避重试
                const delay = 1000 * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
}

// 修改 startProcessing 函数
async function startProcessing() {
    elements.processingProgress.style.display = 'block';
    elements.processingStats.innerHTML = '';
    elements.goToStep5Btn.disabled = true;

    // Progress bar animation
    const progressFill = elements.processingProgress.querySelector('.progress-fill');
    const progressText = elements.processingProgress.querySelector('.progress-text');

    // Select output database file
    const dbFile = await window.electronAPI.showSaveDialog({
        title: '保存数据库文件',
        defaultPath: `Flow_Database_${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 16)}.db`,
        filters: [{ name: '数据库文件', extensions: ['db'] }]
    });

    if (!dbFile) {
        goToStep(3);
        return;
    }

    // Prepare mappings for all files
    const mappings = {};
    for (const fileName in columnMappings) {
        for (const file of selectedFiles) {
            if (file.endsWith(fileName)) {
                mappings[file] = columnMappings[fileName];
                break;
            }
        }
    }

    try {
        // Start progress animation
        progressFill.style.width = '0%';
        progressText.textContent = '正在处理数据...';

        // 使用带重试的请求
        const data = await fetchWithRetry(
            `${API_BASE_URL}/process-files`, 
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file_paths: selectedFiles,
                    db_path: dbFile,
                    column_mappings: mappings
                })
            },
            3,  // 最大重试次数
            180000  // 超时时间增加到3分钟
        );

        if (data.status === 'success') {
            // Update progress to 100%
            progressFill.style.width = '100%';
            progressText.textContent = '处理完成!';

            // Display stats
            displayProcessingStats(data);

            // Store current database
            currentDatabase = dbFile;

            // 保存映射
            storeCurrentMappings();

            // Enable next step
            elements.goToStep5Btn.disabled = false;
        } else {
            progressText.textContent = `处理失败: ${data.message}`;
            console.error('Failed to process files:', data.message);
            
            // 显示错误信息
            const errorEl = document.createElement('div');
            errorEl.className = 'error-message';
            errorEl.textContent = `处理失败: ${data.message}`;
            if (data.details) {
                const detailsEl = document.createElement('pre');
                detailsEl.textContent = data.details;
                detailsEl.style.maxHeight = '200px';
                detailsEl.style.overflow = 'auto';
                errorEl.appendChild(detailsEl);
            }
            elements.processingStats.appendChild(errorEl);
        }
    } catch (error) {
        progressText.textContent = '处理失败!';
        console.error('Failed to process files:', error);
        
        // 显示错误信息，包含"Broken pipe"提示
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.innerHTML = `
            <p>处理失败: ${error.message}</p>
            <p>可能原因:</p>
            <ul>
                <li>文件太大或格式不兼容</li>
                <li>后端处理服务连接中断</li>
                <li>处理超时</li>
            </ul>
            <p>建议:</p>
            <ul>
                <li>尝试处理更小的文件或拆分大文件</li>
                <li>重启应用后再试</li>
                <li>检查Excel文件格式是否正确</li>
            </ul>
        `;
        elements.processingStats.appendChild(errorEl);
    }
}

// Display processing statistics
function displayProcessingStats(data) {
    const statsEl = document.createElement('div');

    const totalProcessedEl = document.createElement('div');
    totalProcessedEl.className = 'stats-item';
    totalProcessedEl.innerHTML = `<strong>总处理行数:</strong> <span>${data.total_processed}</span>`;

    const totalRejectedEl = document.createElement('div');
    totalRejectedEl.className = 'stats-item';
    totalRejectedEl.innerHTML = `<strong>需手动校对行数:</strong> <span>${data.total_rejected}</span>`;

    statsEl.appendChild(totalProcessedEl);
    statsEl.appendChild(totalRejectedEl);

    // Add file stats
    if (data.file_stats && data.file_stats.length > 0) {
        const fileStatsEl = document.createElement('div');
        fileStatsEl.className = 'file-stats';

        data.file_stats.forEach(stat => {
            const fileStatEl = document.createElement('div');
            fileStatEl.className = 'file-stat-item';

            if (stat.error) {
                fileStatEl.innerHTML = `<span>${stat.file_name}</span> <span class="error-message">${stat.error}</span>`;
            } else {
                fileStatEl.innerHTML = `<span>${stat.file_name}</span> <span>处理: ${stat.processed_rows} / 总行数: ${stat.total_rows} / 需校对: ${stat.rejected_rows}</span>`;
            }

            fileStatsEl.appendChild(fileStatEl);
        });

        statsEl.appendChild(fileStatsEl);
    }

    elements.processingStats.appendChild(statsEl);
}


//loadRejectedRows函数
async function loadRejectedRows(page = 1) {
    if (!currentDatabase) return;

    // 首先检查rejected_rows表中的行数，添加调试信息
    console.log(`正在加载拒绝行，数据库: ${currentDatabase}, 页码: ${page}`);

    try {
        const response = await fetch(`${API_BASE_URL}/rejected-rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                db_path: currentDatabase,
                page: page,
                page_size: 20
            })
        });

        const data = await response.json();
        console.log('拒绝行查询结果:', data);

        if (data.status === 'success') {
            // 显示明确的拒绝行数量信息
            elements.verificationStats.innerHTML = `
                <div class="stats-item">
                    <strong>总需校对行数:</strong> <span>${data.total_count}</span>
                </div>
            `;

            // 如果没有拒绝行，显示一条消息
            if (data.total_count === 0) {
                elements.verificationTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align: center; padding: 20px;">
                            没有需要校对的行。如果您认为这不正确，请检查后端日志，可能有处理错误。
                        </td>
                    </tr>
                `;
                return;
            }

            // 显示行
            elements.verificationTableBody.innerHTML = '';

            data.results.forEach(row => {
                const rowEl = document.createElement('tr');

                const fileCell = document.createElement('td');
                fileCell.textContent = row.source_file;

                const rowNumberCell = document.createElement('td');
                rowNumberCell.textContent = row.row_number;

                const dataCell = document.createElement('td');
                // 改进raw_data处理，尝试显示更有用的信息
                try {
                    if (typeof row.raw_data === 'string') {
                        try {
                            // 尝试解析JSON字符串
                            const parsedData = JSON.parse(row.raw_data);
                            dataCell.textContent = JSON.stringify(parsedData, null, 2).substring(0, 150) + '...';
                        } catch (e) {
                            // 如果解析失败，直接显示字符串
                            dataCell.textContent = row.raw_data.substring(0, 150) + '...';
                        }
                    } else if (row.raw_data) {
                        dataCell.textContent = JSON.stringify(row.raw_data).substring(0, 150) + '...';
                    } else {
                        dataCell.textContent = '无数据';
                    }
                } catch (e) {
                    dataCell.textContent = `[数据显示错误: ${e.message}]`;
                }

                // 添加失败原因列
                const reasonCell = document.createElement('td');
                reasonCell.textContent = row.reason || '未知原因';
                reasonCell.style.color = 'var(--error-color)';

                const actionsCell = document.createElement('td');
                actionsCell.className = 'verification-actions';

                const editBtn = document.createElement('button');
                editBtn.className = 'btn small';
                editBtn.textContent = '编辑';
                editBtn.onclick = () => openRowEditor(row);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn small danger';
                deleteBtn.textContent = '删除';
                deleteBtn.onclick = () => deleteRejectedRowDirect(row.id);

                actionsCell.appendChild(editBtn);
                actionsCell.appendChild(deleteBtn);

                rowEl.appendChild(fileCell);
                rowEl.appendChild(rowNumberCell);
                rowEl.appendChild(dataCell);
                rowEl.appendChild(reasonCell); // 添加失败原因列
                rowEl.appendChild(actionsCell);

                elements.verificationTableBody.appendChild(rowEl);
            });

            // 创建分页
            createPagination(data.total_count, data.page, data.page_size, elements.verificationPagination, loadRejectedRows);
        } else {
            console.error('加载被拒绝行失败:', data.message);
            elements.verificationTableBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 20px; color: var(--error-color);">
                        加载被拒绝行失败: ${data.message}
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('加载被拒绝行失败:', error);
        elements.verificationTableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 20px; color: var(--error-color);">
                    加载被拒绝行失败: ${error.message}
                </td>
            </tr>
        `;
    }
}

// Open row editor for a rejected row
function openRowEditor(row) {
    currentRejectedRow = row;

    elements.rowSourceFile.textContent = row.source_file;
    elements.rowNumber.textContent = row.row_number;

    // Generate fields based on template
    elements.rowEditorFields.innerHTML = '';

    const template = templates[currentTemplate];
    const rawData = typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data;

    for (const field in template) {
        const fieldEl = document.createElement('div');
        fieldEl.className = 'row-editor-field';

        const labelEl = document.createElement('label');
        labelEl.textContent = field;

        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.name = field;

        // Try to find matching value in raw data
        let bestMatch = '';
        let bestSimilarity = 0;

        for (const key in rawData) {
            const similarity = stringSimilarity(key, field);

            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestMatch = rawData[key];
            }
        }

        if (bestSimilarity > 0.6 && bestMatch) {
            inputEl.value = bestMatch;
        }

        fieldEl.appendChild(labelEl);
        fieldEl.appendChild(inputEl);

        elements.rowEditorFields.appendChild(fieldEl);
    }

    openModal('rowEditorModal');
}

// Calculate string similarity
function stringSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;

    const matrix = Array(len1 + 1).fill().map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    const maxLen = Math.max(len1, len2);
    if (maxLen === 0) return 1.0;

    return 1.0 - matrix[len1][len2] / maxLen;
}

// Save a manually fixed rejected row
async function saveRejectedRow() {
    if (!currentRejectedRow) return;

    const fixedData = {};

    // Get all field values
    elements.rowEditorFields.querySelectorAll('input').forEach(input => {
        fixedData[input.name] = input.value;
    });

    // Add metadata
    fixedData.source_file = currentRejectedRow.source_file;
    fixedData.row_number = currentRejectedRow.row_number;

    try {
        const response = await fetch(`${API_BASE_URL}/process-rejected-row`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                db_path: currentDatabase,
                row_id: currentRejectedRow.id,
                fixed_data: fixedData,
                action: 'save'
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            closeRowEditor();
            loadRejectedRows();
        } else {
            alert(`Failed to save row: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to save row:', error);
        alert('Failed to save row. Please try again.');
    }
}

// Delete a rejected row
async function deleteRejectedRow() {
    if (!currentRejectedRow) return;

    if (confirm('确定要删除这一行吗？此操作不可撤销。')) {
        await deleteRejectedRowDirect(currentRejectedRow.id);
        closeRowEditor();
    }
}

// Delete a rejected row directly
async function deleteRejectedRow() {
    if (!currentRejectedRow) return;

    const confirmDelete = await showDynamicConfirm('确定要删除这一行吗？此操作不可撤销。', '删除确认');
    if (confirmDelete) {
        await deleteRejectedRowDirect(currentRejectedRow.id);
        closeRowEditor();
    }
}

// Create pagination controls
function createPagination(totalCount, currentPage, pageSize, container, callback) {
    container.innerHTML = '';

    const totalPages = Math.ceil(totalCount / pageSize);

    if (totalPages <= 1) return;

    // Previous button
    const prevBtn = document.createElement('span');
    prevBtn.className = `page-btn ${currentPage === 1 ? 'disabled' : ''}`;
    prevBtn.textContent = '<<';
    if (currentPage > 1) {
        prevBtn.onclick = () => callback(currentPage - 1);
    }
    container.appendChild(prevBtn);

    // Page buttons
    const maxButtons = 5;
    const startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    const endPage = Math.min(totalPages, startPage + maxButtons - 1);

    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('span');
        pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.onclick = () => callback(i);
        container.appendChild(pageBtn);
    }

    // Next button
    const nextBtn = document.createElement('span');
    nextBtn.className = `page-btn ${currentPage === totalPages ? 'disabled' : ''}`;
    nextBtn.textContent = '>>';
    if (currentPage < totalPages) {
        nextBtn.onclick = () => callback(currentPage + 1);
    }
    container.appendChild(nextBtn);
}

// 修改 finishProcessing 函数
async function finishProcessing() {
    // 检查是否还有未处理的行
    if (document.querySelectorAll('#verificationTableBody tr').length > 0) {
        const continueAnyway = await showDynamicConfirm('仍有未处理的行，确定要完成处理吗？未处理的行将不会导入到数据库中。', '完成处理确认');
        if (!continueAnyway) {
            return;
        }
    }
    
    // 存储当前映射
    storeCurrentMappings();
    
    // 打开数据库查看器
    openDatabase(currentDatabase);
    
    // 在返回首页前重新加载最近文件列表
    loadRecentFiles().then(() => {
        console.log("最近文件列表已刷新");
    });
}

// Open a database file in the viewer
async function openDatabase(dbPath) {
    currentDatabase = dbPath;

    // Display database name
    elements.currentDatabaseName.textContent = dbPath.split('/').pop().split('\\').pop();

    // Load database stats
    await loadDatabaseStats();

    // Initialize database viewer
    await initDatabaseViewer();

    // Show database viewer screen
    showScreen('databaseViewerScreen');
}

// Load database statistics
async function loadDatabaseStats() {
    if (!currentDatabase) return;

    try {
        const response = await fetch(`${API_BASE_URL}/database-stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                db_path: currentDatabase
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            elements.dataStats.innerHTML = `
                <div class="stats-item">
                    <strong>总行数:</strong> <span>${data.total_rows}</span>
                </div>
                <div class="stats-item">
                    <strong>需校对行数:</strong> <span>${data.rejected_rows}</span>
                </div>
                <div class="stats-item">
                    <strong>来源文件数:</strong> <span>${data.unique_files}</span>
                </div>
                <div class="stats-item">
                    <strong>日期范围:</strong> <span>${data.date_range[0]} - ${data.date_range[1]}</span>
                </div>
            `;
        } else {
            console.error('Failed to load database stats:', data.message);
        }
    } catch (error) {
        console.error('Failed to load database stats:', error);
    }
}

// Initialize database viewer
async function initDatabaseViewer() {
    if (!currentDatabase) return;

    // Load first page of data
    await loadData();

    // Initialize filter and sort controls
    initFilterControls();
    initSortControls();
}

// Load data from database
async function loadData(page = 1, filters = [], sortBy = null, sortDirection = 'asc') {
    if (!currentDatabase) return;

    try {
        const response = await fetch(`${API_BASE_URL}/query-database`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                db_path: currentDatabase,
                filters: filters,
                sort_by: sortBy,
                sort_direction: sortDirection,
                page: page,
                page_size: 50
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Render table
            renderDataTable(data.results, data.total_count, data.page, data.page_size);
        } else {
            console.error('Failed to load data:', data.message);
        }
    } catch (error) {
        console.error('Failed to load data:', error);
    }
}

// 修改 renderDataTable 函数，使表头点击直接应用排序
function renderDataTable(data, totalCount, currentPage, pageSize) {
    if (!data || data.length === 0) {
        elements.dataTableHead.innerHTML = '<tr><th>无数据</th></tr>';
        elements.dataTableBody.innerHTML = '<tr><td>没有找到数据</td></tr>';
        elements.dataPagination.innerHTML = '';
        return;
    }

    // 获取列类型信息（这部分可能需要根据你的数据结构调整）
    const columnTypes = {};
    for (const column in data[0]) {
        // 尝试根据值判断列类型
        let value = data[0][column];
        if (typeof value === 'number') {
            columnTypes[column] = 'number';
        } else if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
            columnTypes[column] = 'date';
        } else {
            columnTypes[column] = 'text';
        }
    }

    // 渲染表头
    elements.dataTableHead.innerHTML = '';
    const headerRow = document.createElement('tr');

    // 获取当前排序信息
    const currentSortColumn = elements.sortColumn.value;
    const currentSortDirection = elements.sortDirection.value;

    for (const column in data[0]) {
        const th = document.createElement('th');
        th.textContent = column;
        
        // 添加排序指示器
        if (column === currentSortColumn) {
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator';
            indicator.textContent = currentSortDirection === 'asc' ? ' ↑' : ' ↓';
            th.appendChild(indicator);
        }
        
        // 点击表头直接应用排序
        th.onclick = () => {
            // 如果已经按这列排序，则切换方向
            if (column === currentSortColumn) {
                elements.sortDirection.value = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                elements.sortColumn.value = column;
                elements.sortDirection.value = 'asc';
            }
            
            // 应用排序
            applySort();
        };
        
        headerRow.appendChild(th);
    }

    elements.dataTableHead.appendChild(headerRow);

    // 渲染表格内容
    elements.dataTableBody.innerHTML = '';

    data.forEach(row => {
        const tr = document.createElement('tr');

        for (const column in row) {
            const td = document.createElement('td');
            
            // 根据列类型添加适当的类和格式化
            if (columnTypes[column] === 'number') {
                td.className = 'number-cell';
                td.textContent = row[column] !== null ? formatNumber(row[column]) : '';
            } else if (columnTypes[column] === 'date') {
                td.className = 'date-cell';
                td.textContent = row[column] !== null ? formatDate(row[column]) : '';
            } else {
                td.className = 'text-cell';
                td.textContent = row[column] !== null ? row[column] : '';
            }
            
            tr.appendChild(td);
        }

        elements.dataTableBody.appendChild(tr);
    });

    // 创建分页
    createPagination(totalCount, currentPage, pageSize, elements.dataPagination, page => {
        loadData(page, getFilters(), elements.sortColumn.value, elements.sortDirection.value);
    });
}

// 添加格式化函数
function formatNumber(num) {
    // 根据需要格式化数字
    if (typeof num === 'number') {
        return num.toLocaleString();
    }
    return num;
}

function formatDate(date) {
    // 格式化日期
    if (date instanceof Date) {
        return date.toLocaleDateString();
    } else if (typeof date === 'string') {
        try {
            const d = new Date(date);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString();
            }
        } catch (e) {}
    }
    return date;
}

// Initialize filter controls
function initFilterControls() {
    // Clear existing filters
    elements.filterContainer.innerHTML = '';

    // Add first filter row
    addFilterRow();

    // Add event listener for apply filters button
    elements.applyFiltersBtn.onclick = applyFilters;
}

// Add a filter row
function addFilterRow() {
    const filterRow = document.createElement('div');
    filterRow.className = 'filter-row';

    const columnSelect = document.createElement('select');
    columnSelect.className = 'filter-column';

    // Add template fields as options
    const template = templates[currentTemplate];
    for (const field in template) {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        columnSelect.appendChild(option);
    }

    const operatorSelect = document.createElement('select');
    operatorSelect.className = 'filter-operator';

    const operators = [
        { value: '=', text: '=' },
        { value: '<', text: '＜' },
        { value: '>', text: '＞' },
        { value: '<=', text: '≤' },
        { value: '>=', text: '≥' },
        { value: '<>', text: '≠' },
        { value: 'contains', text: '包含' },
        { value: 'startswith', text: '开头是' },
        { value: 'endswith', text: '结尾是' },
        { value: 'not_null', text: '不为空' }
    ];

    operators.forEach(op => {
        const option = document.createElement('option');
        option.value = op.value;
        option.textContent = op.text;
        operatorSelect.appendChild(option);
    });

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'filter-value';
    valueInput.placeholder = '值';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn small remove-filter';
    removeBtn.textContent = '删除';
    removeBtn.onclick = () => {
        if (elements.filterContainer.children.length > 1) {
            filterRow.remove();
        }
    };

    filterRow.appendChild(columnSelect);
    filterRow.appendChild(operatorSelect);
    filterRow.appendChild(valueInput);
    filterRow.appendChild(removeBtn);

    elements.filterContainer.appendChild(filterRow);
}

// Get current filters
function getFilters() {
    const filters = [];

    elements.filterContainer.querySelectorAll('.filter-row').forEach(row => {
        const column = row.querySelector('.filter-column').value;
        const operator = row.querySelector('.filter-operator').value;
        const value = row.querySelector('.filter-value').value.trim();

        // 对于"不为空"操作符，不需要检查value是否有值
        if (operator === 'not_null' || value) {
            filters.push({
                column: column,
                operator: operator,
                value: value
            });
        }
    });

    return filters;
}

// Apply filters
function applyFilters() {
    const filters = getFilters();
    const sortBy = elements.sortColumn.value;
    const sortDirection = elements.sortDirection.value;

    loadData(1, filters, sortBy, sortDirection);
}

// Initialize sort controls
function initSortControls() {
    // 清除现有选项
    elements.sortColumn.innerHTML = '';

    // 添加模板字段作为选项
    const template = templates[currentTemplate];
    for (const field in template) {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        elements.sortColumn.appendChild(option);
    }
}

// 应用排序（现在从表头点击直接调用）
function applySort() {
    const filters = getFilters();
    const sortBy = elements.sortColumn.value;
    const sortDirection = elements.sortDirection.value;

    loadData(1, filters, sortBy, sortDirection);
}

// 从列头直接应用排序
function applySortDirect(column) {
    // 更新排序控件
    if (elements.sortColumn.value === column) {
        // 切换方向
        elements.sortDirection.value = elements.sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        elements.sortColumn.value = column;
        elements.sortDirection.value = 'asc';
    }

    applySort();
}

// Export to Excel
async function exportToExcel() {
    if (!currentDatabase) return;

    // Select output Excel file
    const excelFile = await window.electronAPI.showSaveDialog({
        title: '导出到Excel',
        defaultPath: `Export_${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 16)}.xlsx`,
        filters: [{ name: 'Excel文件', extensions: ['xlsx'] }]
    });

    if (!excelFile) return;

    try {
        const filters = getFilters();
        const sortBy = elements.sortColumn.value;
        const sortDirection = elements.sortDirection.value;

        const response = await fetch(`${API_BASE_URL}/export-excel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                db_path: currentDatabase,
                export_path: excelFile,
                filters: filters,
                sort_by: sortBy,
                sort_direction: sortDirection
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            alert(`导出成功！已导出到 ${data.export_files.length} 个文件。`);
        } else {
            alert(`导出失败: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to export to Excel:', error);
        alert('导出失败。请重试。');
    }
}

// 检测映射冲突并返回冲突信息
function detectMappingConflicts() {
    const conflicts = {};
    
    // 遍历所有文件的映射
    for (const fileName in columnMappings) {
        const fileMapping = columnMappings[fileName];
        
        // 创建一个反向映射来检测冲突
        const reverseMapping = {};
        
        for (const originalCol in fileMapping) {
            const targetCol = fileMapping[originalCol];
            
            // 跳过未映射的列
            if (!targetCol) continue;
            
            // 如果目标列已经被其他列映射，则记录冲突
            if (reverseMapping[targetCol]) {
                if (!conflicts[fileName]) {
                    conflicts[fileName] = {};
                }
                
                if (!conflicts[fileName][targetCol]) {
                    conflicts[fileName][targetCol] = [reverseMapping[targetCol]];
                }
                
                conflicts[fileName][targetCol].push(originalCol);
            } else {
                reverseMapping[targetCol] = originalCol;
            }
        }
    }
    
    return conflicts;
}

// 检查是否存在映射冲突
function hasMappingConflicts() {
    const conflicts = detectMappingConflicts();
    return Object.keys(conflicts).length > 0;
}

// 检测并解决映射冲突，选择最高匹配度的映射
function detectAndResolveMappingConflicts(columns) {
    // 创建一个映射来跟踪每个目标字段的所有映射
    const targetFieldMap = {};
    
    // 第一步：收集每个目标字段的所有映射
    columns.forEach(column => {
        if (column.mapped_to) {
            if (!targetFieldMap[column.mapped_to]) {
                targetFieldMap[column.mapped_to] = [];
            }
            
            targetFieldMap[column.mapped_to].push({
                original_name: column.original_name,
                similarity: column.similarity
            });
        }
    });
    
    // 处理冲突并为每个目标字段选择最佳匹配
    for (const targetField in targetFieldMap) {
        const mappings = targetFieldMap[targetField];
        
        // 如果多个列映射到同一个目标，解决冲突
        if (mappings.length > 1) {
            // 按相似度分数排序（最高的在前）
            mappings.sort((a, b) => b.similarity - a.similarity);
            
            // 排序后的第一个是最佳匹配
            const bestMapping = mappings[0];
            
            // 对于除最佳匹配外的所有列，清除映射
            columns.forEach(column => {
                if (column.mapped_to === targetField && 
                    column.original_name !== bestMapping.original_name) {
                    
                    // 清除非最佳匹配的映射
                    column.mapped_to = null;
                    column.conflict_resolved = true;
                    column.conflict_info = `映射冲突，已选择最佳匹配: ${bestMapping.original_name} (${(bestMapping.similarity * 100).toFixed(0)}% 匹配度)`;
                }
            });
        }
    }
    
    return columns;
}

// 更新displayFileMapping函数以使用冲突解决
function updateDisplayFileMappingWithMemory() {
    // 保存原始函数
    const originalDisplayFileMapping = displayFileMapping;
    
    // 重写 displayFileMapping 函数
    displayFileMapping = function(data, fileIndex) {
        // 检查是否已选择应用记忆模板
        if (window.applyingStoredMappings) {
            // 如果正在应用记忆模板，清除智能匹配结果
            data.columns.forEach(column => {
                column.mapped_to = null;  // 清除默认映射
                column.similarity = 0;    // 重置相似度
            });
        } else {
            // 否则，应用冲突解决
            data.columns = detectAndResolveMappingConflicts(data.columns);
        }
        
        // 调用原始实现
        originalDisplayFileMapping(data, fileIndex);
    };
}

// 修改 applyStoredMappings 函数
function applyStoredMappings(fileSignatures) {
    // 设置标志，指示正在应用存储的映射
    window.applyingStoredMappings = true;
    
    for (const fileName in fileSignatures) {
        const signature = fileSignatures[fileName];
        
        if (templateMemory[currentTemplate] && 
            templateMemory[currentTemplate][signature]) {
            
            const storedMapping = templateMemory[currentTemplate][signature];
            
            // 初始化此文件的列映射
            if (!columnMappings[fileName]) {
                columnMappings[fileName] = {};
            } else {
                // 清除现有映射
                for (const key in columnMappings[fileName]) {
                    columnMappings[fileName][key] = '';
                }
            }
            
            // 应用存储的映射
            for (const originalCol in storedMapping) {
                if (storedMapping[originalCol]) { // 只应用非空映射
                    columnMappings[fileName][originalCol] = storedMapping[originalCol];
                }
            }
            
            // 更新UI以反映这些映射
            const fileEls = document.querySelectorAll('.mapping-file');
            
            fileEls.forEach(fileEl => {
                const headerEl = fileEl.querySelector('.mapping-file-header h4');
                if (headerEl && headerEl.textContent.includes(fileName)) {
                    // 清除所有现有选择
                    const selects = fileEl.querySelectorAll('.mapping-select');
                    selects.forEach(select => {
                        select.value = ''; // 重置为"不映射"
                    });
                    
                    // 然后应用存储的映射
                    selects.forEach(select => {
                        const columnEl = select.closest('.mapping-column');
                        const nameEl = columnEl.querySelector('.column-name');
                        
                        if (nameEl) {
                            const originalColName = nameEl.textContent;
                            
                            if (storedMapping[originalColName]) {
                                select.value = storedMapping[originalColName];
                                
                                // 触发change事件更新视觉效果和内部状态
                                const event = new Event('change');
                                select.dispatchEvent(event);
                            }
                        }
                    });
                }
            });
        }
    }
    
    // 重置标志
    window.applyingStoredMappings = false;
    
    // 更新冲突警告
    updateMappingWarnings();
}
// Open settings modal
function openSettings() {
    // Update showRecentFiles checkbox
    elements.showRecentFiles.checked = showRecentFiles;

    // Update templates list
    updateSettingsTemplatesList();

    openModal('settingsModal');
}

// Update templates list in settings
function updateSettingsTemplatesList() {
    elements.settingsTemplatesList.innerHTML = '';

    for (const name in templates) {
        const templateEl = document.createElement('div');
        templateEl.className = 'template-item';

        const nameEl = document.createElement('span');
        nameEl.textContent = name;

        if (name === defaultTemplate) {
            const defaultBadge = document.createElement('span');
            defaultBadge.className = 'badge default-badge';
            defaultBadge.textContent = '默认';
            nameEl.appendChild(defaultBadge);
        }

        const actionsEl = document.createElement('div');
        actionsEl.className = 'template-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn small';
        editBtn.textContent = '编辑';
        editBtn.onclick = () => {
            currentTemplate = name;
            openTemplateEditor(false);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn small danger';
        deleteBtn.textContent = '删除';
        deleteBtn.onclick = () => deleteTemplate(name);

        actionsEl.appendChild(editBtn);
        if (Object.keys(templates).length > 1) {
            actionsEl.appendChild(deleteBtn);
        }

        templateEl.appendChild(nameEl);
        templateEl.appendChild(actionsEl);

        elements.settingsTemplatesList.appendChild(templateEl);
    }
}

// Delete a template
async function deleteTemplate(name) {
    if (name === defaultTemplate) {
        alert('不能删除默认模板');
        return;
    }

    const confirmDelete = await showDynamicConfirm(`确定要删除模板 "${name}" 吗？此操作不可撤销。`, '删除模板');
    if (!confirmDelete) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/templates/${name}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Update local templates
            delete templates[name];

            // Update templates list
            updateSettingsTemplatesList();

            // Update template select
            updateTemplateSelect();
        } else {
            alert(`Failed to delete template: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to delete template:', error);
        alert('Failed to delete template. Please try again.');
    }
}

// Save settings
function saveSettings() {
    showRecentFiles = elements.showRecentFiles.checked;
    closeModal('settingsModal');
}

// Open a modal
// 打开模态窗口
function openModal(modalId) {
    const modalElement = document.getElementById(modalId);
    
    // 如果已经有激活的模态窗口，调整其z-index使其在新窗口下面
    if (modalStack.length > 0) {
        const currentActiveModal = document.getElementById(modalStack[modalStack.length - 1]);
        // 保持其活跃状态，但确保其在较低的z-index
        currentActiveModal.style.zIndex = "100";
    }
    
    // 将新模态窗口添加到堆栈并激活它
    modalStack.push(modalId);
    modalElement.classList.add('active');
    modalElement.style.zIndex = "102"; // 高于其他模态窗口
    
    // 始终确保当任何模态窗口打开时overlay是可见的
    elements.overlay.classList.add('active');
}

// 关闭特定模态窗口
function closeModal(modalId) {
    const modalElement = document.getElementById(modalId);
    modalElement.classList.remove('active');
    
    // 从堆栈中移除此模态窗口
    const index = modalStack.indexOf(modalId);
    if (index > -1) {
        modalStack.splice(index, 1);
    }
    
    // 如果堆栈中仍有模态窗口，使顶部的那个激活
    if (modalStack.length > 0) {
        const topModal = document.getElementById(modalStack[modalStack.length - 1]);
        topModal.style.zIndex = "102"; // 确保它在顶部
    } else {
        // 没有模态窗口了，隐藏overlay
        elements.overlay.classList.remove('active');
    }
}

// 关闭所有模态窗口
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
    modalStack = []; // 清空模态窗口堆栈
    elements.overlay.classList.remove('active');
}

// Close template editor
function closeTemplateEditor() {
    closeModal('templateEditorModal');
}

// Close synonyms editor
function closeSynonymsEditor() {
    closeModal('synonymsEditorModal');
}

// Close row editor
function closeRowEditor() {
    currentRejectedRow = null;
    closeModal('rowEditorModal');
}

// Initialize the application
window.addEventListener('DOMContentLoaded', initApp);