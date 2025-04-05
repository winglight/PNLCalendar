import { 
    allTrades,
    loadTrades, 
    saveTrades, 
    clearData, 
    handleFileSelect, 
    r2Sync, 
    setDateRange, 
    filterTradesByDateRange,
    filterTradesBySymbol,
    processTradeData,
    mergeTrades
} from './data.js';
import { 
    renderCalendar, 
    navigateMonth, 
    showTradeDetails, 
    closeTradeModal, 
    viewTradeDetails, 
    toggleDatePicker, 
    currentDate 
} from './calendar.js';
import { 
    updateStatistics 
} from './stats.js';
import { R2Sync } from './r2-sync.js';

// DOM Elements
let showDateRangeBtn, clearDataBtn, handleImportBtn, showImportModalBtn, configR2Btn, csvFile;

// Initialize
async function init() {
    // 初始化DOM元素引用
    initDOMElements();
    await loadTrades();
    setupEventListeners();
    renderCalendar();
    updateStatistics();
}

// 初始化DOM元素引用
function initDOMElements() {
    showDateRangeBtn = document.getElementById('showDateRangeBtn');
    clearDataBtn = document.getElementById('clearDataBtn');
    handleImportBtn = document.getElementById('handleImportForm');
    showImportModalBtn = document.getElementById('showImportModalBtn');
    configR2Btn = document.getElementById('configR2Btn');
    csvFile = document.getElementById('csvFile');
}

// Setup Event Listeners
function setupEventListeners() {
    // 添加安全检查，确保DOM元素存在
    if (configR2Btn) configR2Btn.addEventListener('click', handleConfigR2);
    if (showDateRangeBtn) showDateRangeBtn.addEventListener('click', toggleDatePicker);
    if (handleImportBtn) handleImportBtn.addEventListener('submit', handleImport);
    if (showImportModalBtn) showImportModalBtn.addEventListener('click', showImportModal);
    if (csvFile) csvFile.addEventListener('change', handleFileSelect);
    if (clearDataBtn) clearDataBtn.addEventListener('click', () => {
        if (clearData()) {
            renderCalendar();
            updateStatistics();
        }
    });

    // 为IB导入表单添加事件监听器
    const ibImportForm = document.querySelector('#importModal form');
    if (ibImportForm) {
        ibImportForm.addEventListener('submit', handleIBImport);
    }

    // 为所有预设日期按钮添加事件监听器
    document.querySelectorAll('.preset-dates button').forEach(button => {
        button.addEventListener('click', (e) => {
            const range = e.target.dataset.range;
            setDateRange(range);
            renderCalendar();
            updateStatistics();
        });
    });
    
    // 为月份导航按钮添加事件监听器
    document.querySelectorAll('.month-navigation button').forEach(button => {
        button.addEventListener('click', (e) => {
            const direction = parseInt(e.target.dataset.direction);
            navigateMonth(direction);
        });
    });
    
    // 为查看详情按钮添加事件监听器
    const viewDetailsBtn = document.getElementById('viewDetailsBtn');
    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', viewTradeDetails);
    }
    
    // 为关闭详情按钮添加事件监听器
    const closeDetailsBtn = document.getElementById('closeTradeModalBtn');
    if (closeDetailsBtn) {
        closeDetailsBtn.addEventListener('click', closeTradeModal);
    }
    
    // 日期范围过滤器
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const applyDateRangeBtn = document.getElementById('applyDateRange');
    
    if (applyDateRangeBtn && startDateInput && endDateInput) {
        applyDateRangeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡，防止触发外部点击事件
            const startDate = new Date(startDateInput.value);
            const endDate = new Date(endDateInput.value);
            filterTradesByDateRange(startDate, endDate);
            renderCalendar();
            updateStatistics();
            toggleDatePicker(); // 隐藏日期选择器
        });
    }

    const symbolFilter = document.getElementById('symbolFilter');
    const symbolDropdown = document.getElementById('symbolDropdown');
    const symbolDropdownBtn = document.getElementById('symbolDropdownBtn');
    
    // Handle input changes
    symbolFilter.addEventListener('input', (e) => {
        const searchText = e.target.value.toLowerCase();
        showSymbolDropdown(searchText);
    });

    // Handle dropdown item selection
    symbolDropdown.addEventListener('click', (e) => {
        const option = e.target.closest('.symbol-option');
        if (option) {
            const symbol = option.dataset.symbol;
            filterBySymbol(symbol);
        }
    });
    
    // Handle dropdown button click
    symbolDropdownBtn.addEventListener('click', () => {
        showSymbolDropdown();
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.symbol-filter-container')) {
            symbolDropdown.classList.remove('active');
        }
    });
}

// Handle R2 Config
function handleConfigR2() {
    r2Sync.createConfigDialog(() => {
        loadTrades();
        renderCalendar();
        updateStatistics();
    });
}

// 处理导入
function handleImport(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const csvData = formData.get('csvData');
    
    if (csvData) {
        processTradeData(csvData);
        renderCalendar();
        updateStatistics();
        closeImportModal();
    }
}

// 显示导入模态框
function showImportModal() {
    const modal = document.getElementById('importModal');
    if (modal) {
        modal.style.display = 'block';
        // 添加点击外部关闭功能
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}

// 关闭导入模态框
function closeImportModal() {
    const modal = document.getElementById('importModal');
    if (modal) modal.style.display = 'none';
}

// 页面加载时立即从 localStorage 加载数据
document.addEventListener('DOMContentLoaded', () => {
    init();
});

// 处理IB导入
async function handleIBImport(event) {
    event.preventDefault(); // 阻止表单默认提交行为
    const token = document.getElementById('flexToken').value;
    const queryId = document.getElementById('reportId').value;

    // 显示加载状态
    const connectButton = event.submitter;
    if (connectButton) {
        const originalText = connectButton.textContent;
        connectButton.textContent = '正在连接...';
        connectButton.disabled = true;
    }

    try {
        // 第一步：获取 reference code
        const response = await fetchWithProxy(
            `https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=${token}&q=${queryId}&v=3`
        );

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        const status = xmlDoc.querySelector('Status')?.textContent;

        if (status === 'Success') {
            const referenceCode = xmlDoc.querySelector('ReferenceCode')?.textContent;

            // 第二步：使用 reference code 获取报告
            // 注意这里 token 和 reference code 的顺序
            const reportResponse = await fetchWithProxy(
                `https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement?t=${token}&q=${referenceCode}&v=3`
            );

            if (reportResponse.ok) {
                const csvData = await reportResponse.text();

                if (csvData.startsWith('"ClientAccountID"')) {
                    processTradeData(csvData);
                    renderCalendar();
                    updateStatistics();
                    closeImportModal();
                } else {
                    alert(`获取CSV失败: ${csvData}`);
                }
            } else {
                console.error("获取报告失败:", reportResponse.statusText);
                alert("获取报告失败，请检查您的Token和ReportID");
            }
        } else {
            const errorMessage = xmlDoc.querySelector('ErrorMessage')?.textContent;
            throw new Error(errorMessage || '导入失败');
        }
    } catch (error) {
        alert(`导入失败: ${error.message}`);
    } finally {
        // 恢复按钮状态
        if (connectButton) {
            connectButton.textContent = 'Connect';
            connectButton.disabled = false;
        }
    }
}

// 添加代理函数处理CORS
async function fetchWithProxy(url) {
    const proxyUrl = 'https://ib.broyustudio.com';

    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, text/csv, */*'
            },
            body: JSON.stringify({
                url: url,
                method: 'GET'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Proxy request failed: ${response.status} - ${errorText}`);
        }

        console.log("fetch response: " + response);
        return response;
    } catch (error) {
        console.error('Proxy request error:', error);
        throw new Error(`Failed to fetch through proxy: ${error.message}`);
    }
}

function showSymbolDropdown(searchText = '') {
    const symbolDropdown = document.getElementById('symbolDropdown');
    const uniqueSymbols = [...new Set(allTrades.map(trade => trade.Symbol))];
    
    const filteredSymbols = uniqueSymbols.filter(symbol => 
        symbol.toLowerCase().includes(searchText.toLowerCase())
    ).sort();
    
    symbolDropdown.innerHTML = filteredSymbols.map(symbol => `
        <div class="symbol-option" data-symbol="${symbol}">${symbol}</div>
    `).join('');
    
    symbolDropdown.classList.add('active');
}

function filterBySymbol(symbol) {
    document.getElementById('symbolFilter').value = symbol;
    document.getElementById('symbolDropdown').classList.remove('active');
    
    filterTradesBySymbol(symbol);
        
    renderCalendar();
    updateStatistics();
}

// 导出模块
export {
    init,
    handleConfigR2,
    handleImport,
    showImportModal,
    closeImportModal,
    handleIBImport
};
