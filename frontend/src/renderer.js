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

    // Overlay
    overlay: document.getElementById('overlay')
};

// Initialize the application
async function initApp() {
    // Check if backend is running
    try {
        const response = await fetch(`${API_BASE_URL}/ping`);
        const data = await response.json();

        if (data.status !== 'success') {
            alert('Failed to connect to backend server. Please restart the application.');
            return;
        }
    } catch (error) {
        alert('Failed to connect to backend server. Please restart the application.');
        return;
    }

    // Load templates
    await loadTemplates();

    // Load recent files
    await loadRecentFiles();

    // Add event listeners
    addEventListeners();
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
    elements.goToStep4Btn.addEventListener('click', () => goToStep(4));
    elements.goToStep5Btn.addEventListener('click', () => goToStep(5));
    elements.finishProcessBtn.addEventListener('click', finishProcessing);

    // Template Selection
    elements.templateSelect.addEventListener('change', (e) => {
        currentTemplate = e.target.value;
        updateTemplatePreview();
    });
    elements.newTemplateBtn.addEventListener('click', openTemplateEditor);

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
    elements.applySortBtn.addEventListener('click', applySort);
    elements.exportExcelBtn.addEventListener('click', exportToExcel);

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
        });

        // Initialize column mappings
        if (!columnMappings[fileName]) {
            columnMappings[fileName] = {};
        }
        columnMappings[fileName][column.original_name] = column.mapped_to || '';

        mappingEl.appendChild(selectEl);
        if (confidenceEl) mappingEl.appendChild(confidenceEl);

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
}

// Get confidence class based on similarity score
function getConfidenceClass(similarity) {
    if (similarity >= 0.8) return 'confidence-high';
    if (similarity >= 0.6) return 'confidence-medium';
    return 'confidence-low';
}

// Start processing files
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

        const response = await fetch(`${API_BASE_URL}/process-files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_paths: selectedFiles,
                db_path: dbFile,
                column_mappings: mappings
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Update progress to 100%
            progressFill.style.width = '100%';
            progressText.textContent = '处理完成!';

            // Display stats
            displayProcessingStats(data);

            // Store current database
            currentDatabase = dbFile;

            // Enable next step
            elements.goToStep5Btn.disabled = false;
        } else {
            progressText.textContent = `处理失败: ${data.message}`;
            console.error('Failed to process files:', data.message);
        }
    } catch (error) {
        progressText.textContent = '处理失败!';
        console.error('Failed to process files:', error);
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

// Load rejected rows for manual verification
async function loadRejectedRows(page = 1) {
    if (!currentDatabase) return;

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

        if (data.status === 'success') {
            // Display stats
            elements.verificationStats.innerHTML = `
                <div class="stats-item">
                    <strong>总需校对行数:</strong> <span>${data.total_count}</span>
                </div>
            `;

            // Display rows
            elements.verificationTableBody.innerHTML = '';

            data.results.forEach(row => {
                const rowEl = document.createElement('tr');

                const fileCell = document.createElement('td');
                fileCell.textContent = row.source_file;

                const rowNumberCell = document.createElement('td');
                rowNumberCell.textContent = row.row_number;

                const dataCell = document.createElement('td');
                dataCell.textContent = row.raw_data ? JSON.stringify(row.raw_data).substring(0, 100) + '...' : '';

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
                rowEl.appendChild(actionsCell);

                elements.verificationTableBody.appendChild(rowEl);
            });

            // Create pagination
            createPagination(data.total_count, data.page, data.page_size, elements.verificationPagination, loadRejectedRows);
        } else {
            console.error('Failed to load rejected rows:', data.message);
        }
    } catch (error) {
        console.error('Failed to load rejected rows:', error);
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
async function deleteRejectedRowDirect(rowId) {
    try {
        const response = await fetch(`${API_BASE_URL}/process-rejected-row`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                db_path: currentDatabase,
                row_id: rowId,
                action: 'delete'
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            loadRejectedRows();
        } else {
            alert(`Failed to delete row: ${data.message}`);
        }
    } catch (error) {
        console.error('Failed to delete row:', error);
        alert('Failed to delete row. Please try again.');
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

// Finish processing and go to database viewer
function finishProcessing() {
    openDatabase(currentDatabase);
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

// Render data table
function renderDataTable(data, totalCount, currentPage, pageSize) {
    if (!data || data.length === 0) {
        elements.dataTableHead.innerHTML = '<tr><th>无数据</th></tr>';
        elements.dataTableBody.innerHTML = '<tr><td>没有找到数据</td></tr>';
        elements.dataPagination.innerHTML = '';
        return;
    }

    // Get columns from first row
    const columns = Object.keys(data[0]);

    // Render table header
    elements.dataTableHead.innerHTML = '';
    const headerRow = document.createElement('tr');

    columns.forEach(column => {
        const th = document.createElement('th');
        th.textContent = column;
        th.onclick = () => applySortDirect(column);
        headerRow.appendChild(th);
    });

    elements.dataTableHead.appendChild(headerRow);

    // Render table body
    elements.dataTableBody.innerHTML = '';

    data.forEach(row => {
        const tr = document.createElement('tr');

        columns.forEach(column => {
            const td = document.createElement('td');
            td.textContent = row[column] !== null ? row[column] : '';
            tr.appendChild(td);
        });

        elements.dataTableBody.appendChild(tr);
    });

    // Create pagination
    createPagination(totalCount, currentPage, pageSize, elements.dataPagination, page => {
        loadData(page, getFilters(), elements.sortColumn.value, elements.sortDirection.value);
    });
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
        { value: 'endswith', text: '结尾是' }
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

        if (value) {
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
    // Clear existing options
    elements.sortColumn.innerHTML = '';

    // Add template fields as options
    const template = templates[currentTemplate];
    for (const field in template) {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        elements.sortColumn.appendChild(option);
    }
}

// Apply sort directly from column header
function applySortDirect(column) {
    // Update sort controls
    if (elements.sortColumn.value === column) {
        // Toggle direction
        elements.sortDirection.value = elements.sortDirection.value === 'asc' ? 'desc' : 'asc';
    } else {
        elements.sortColumn.value = column;
        elements.sortDirection.value = 'asc';
    }

    applySort();
}

// Apply sort
function applySort() {
    const filters = getFilters();
    const sortBy = elements.sortColumn.value;
    const sortDirection = elements.sortDirection.value;

    loadData(1, filters, sortBy, sortDirection);
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
            closeModal('settingsModal');
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

    if (!confirm(`确定要删除模板 "${name}" 吗？此操作不可撤销。`)) {
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
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    elements.overlay.classList.add('active');
}

// Close a specific modal
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    elements.overlay.classList.remove('active');
}

// Close all modals
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
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