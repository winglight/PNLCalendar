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
    updateStatistics,
    chartInstances
} from './stats.js';

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
    
    // 过滤符合搜索文本的 symbols
    const filteredSymbols = uniqueSymbols.filter(symbol => 
        symbol.toLowerCase().includes(searchText.toLowerCase())
    ).sort();
    
    // 生成前缀通配符选项
    const wildcardPrefixes = new Set(); // 存储实际的前缀（不带*）
    if (searchText && searchText.length >= 2) {
        // 获取所有以搜索文本开头的 symbols
        const prefixMatches = uniqueSymbols.filter(symbol => 
            symbol.toLowerCase().startsWith(searchText.toLowerCase())
        );
        
        // 按长度分组符号
        const symbolsByLength = {};
        prefixMatches.forEach(symbol => {
            const length = symbol.length;
            if (!symbolsByLength[length]) {
                symbolsByLength[length] = [];
            }
            symbolsByLength[length].push(symbol);
        });
        
        // 对于每个长度，找出共同前缀
        Object.keys(symbolsByLength).forEach(length => {
            const symbols = symbolsByLength[length];
            if (symbols.length > 1) {
                // 找出这组符号的共同前缀
                const commonPrefix = findCommonPrefix(symbols);
                if (commonPrefix.length > searchText.length) {
                    wildcardPrefixes.add(commonPrefix);
                }
            }
        });
        
        // 对于单个符号，检查是否有数字部分可以作为前缀
        prefixMatches.forEach(symbol => {
            // 查找第一个数字的位置
            const digitMatch = symbol.match(/\d/);
            if (digitMatch && digitMatch.index > searchText.length) {
                const prefix = symbol.substring(0, digitMatch.index);
                // 检查是否有多个符合此前缀的交易
                const matchCount = prefixMatches.filter(s => s.startsWith(prefix)).length;
                if (matchCount > 1) {
                    wildcardPrefixes.add(prefix);
                }
            }
        });
    }
    
    // 转换前缀为通配符选项
    const wildcardOptions = Array.from(wildcardPrefixes).map(prefix => `${prefix}*`).sort();
    
    // 合并通配符选项和普通选项
    const allOptions = [...wildcardOptions, ...filteredSymbols];
    
    // 生成下拉框 HTML
    symbolDropdown.innerHTML = allOptions.map(option => {
        const isWildcard = option.endsWith('*');
        return `
            <div class="symbol-option ${isWildcard ? 'wildcard-option' : ''}" data-symbol="${option}">
                ${option} ${isWildcard ? `<span class="wildcard-hint">(通配符)</span>` : ''}
            </div>
        `;
    }).join('');
    
    symbolDropdown.classList.add('active');
}

// 辅助函数：查找一组字符串的共同前缀
function findCommonPrefix(strings) {
    if (!strings || strings.length === 0) return '';
    if (strings.length === 1) return strings[0];
    
    let prefix = strings[0];
    for (let i = 1; i < strings.length; i++) {
        // 逐字符比较，找出共同前缀
        let j = 0;
        while (j < prefix.length && j < strings[i].length && prefix[j] === strings[i][j]) {
            j++;
        }
        prefix = prefix.substring(0, j);
        if (prefix === '') break;
    }
    
    return prefix;
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

// 初始化全屏功能
function initFullscreenButtons() {
    // 获取所有全屏按钮
    const fullscreenBtns = document.querySelectorAll('.fullscreen-btn');
    const statModal = document.getElementById('statModal');
    const statModalTitle = document.getElementById('statModalTitle');
    const statModalContent = document.getElementById('statModalContent');
    const closeBtn = statModal.querySelector('.close-button');
    
    // 为每个全屏按钮添加点击事件
    fullscreenBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const cardType = this.getAttribute('data-card');
            
            // 如果是图表全屏按钮，不处理（由initChartFullscreenButtons处理）
            if (this.getAttribute('data-chart')) {
                return;
            }
            
            // 查找父元素，增加错误处理
            const card = this.closest('.stat-card');
            if (!card) {
                console.warn('未找到统计卡片元素');
                return;
            }
            
            // 查找标题元素，增加错误处理
            const titleElement = card.querySelector('.stat-header span');
            const title = titleElement ? titleElement.textContent : '统计详情';
            
            // 设置模态框标题
            statModalTitle.textContent = title;
            
            // 根据卡片类型生成内容
            let content = '';
            
            switch(cardType) {
                case 'net-pnl':
                    const pnlValue = card.querySelector('.stat-value')?.textContent || '0';
                    content = `<div class="stat-value positive" style="font-size: 36px;">${pnlValue}</div>`;
                    break;
                    
                case 'win-rate':
                case 'day-win-rate':
                    const winRateValue = card.querySelector('.stat-value')?.textContent || '0%';
                    const winCount = card.querySelector('.win')?.textContent || '0';
                    const neutralCount = card.querySelector('.neutral')?.textContent || '0';
                    const lossCount = card.querySelector('.loss')?.textContent || '0';
                    
                    content = `
                        <div class="stat-value" style="font-size: 36px;">${winRateValue}</div>
                        <div class="stat-gauge" style="height: 40px; margin: 20px 0;">
                            <div class="win" style="width: ${calculatePercent(winCount, neutralCount, lossCount)}%">${winCount}</div>
                            ${neutralCount !== '0' ? `<div class="neutral" style="width: ${calculatePercent(neutralCount, winCount, lossCount)}%">${neutralCount}</div>` : ''}
                            <div class="loss" style="width: ${calculatePercent(lossCount, winCount, neutralCount)}%">${lossCount}</div>
                        </div>
                        <div style="margin-top: 20px;">
                            <p>胜利交易: ${winCount} 笔</p>
                            ${neutralCount !== '0' ? `<p>平局交易: ${neutralCount} 笔</p>` : ''}
                            <p>亏损交易: ${lossCount} 笔</p>
                        </div>
                    `;
                    break;
                    
                case 'profit-factor':
                    const pfValue = card.querySelector('.stat-value')?.textContent || '0';
                    content = `
                        <div class="stat-value" style="font-size: 36px;">${pfValue}</div>
                        <p style="margin-top: 20px;">盈利因子是总盈利除以总亏损的比率。高于1表示盈利，值越高越好。</p>
                    `;
                    break;
                    
                case 'avg-win-loss':
                    const avgValue = card.querySelector('.stat-value')?.textContent || '0%';
                    const avgWin = card.querySelector('.win')?.textContent || '0';
                    const avgLoss = card.querySelector('.loss')?.textContent || '0';
                    
                    content = `
                        <div class="stat-value" style="font-size: 36px;">${avgValue}</div>
                        <div class="stat-gauge" style="height: 40px; margin: 20px 0;">
                            <div class="win" style="width: ${calculatePercent(avgWin, 0, avgLoss)}%">${avgWin}</div>
                            <div class="loss" style="width: ${calculatePercent(avgLoss, avgWin, 0)}%">${avgLoss}</div>
                        </div>
                        <div style="margin-top: 20px;">
                            <p>平均盈利: ${avgWin}</p>
                            <p>平均亏损: ${avgLoss}</p>
                        </div>
                    `;
                    break;
                    
                default:
                    content = '<p>无法显示此卡片的详细信息</p>';
            }
            
            // 设置模态框内容
            statModalContent.innerHTML = content;
            
            // 显示模态框
            statModal.style.display = 'flex';
        });
    });
    
    // 关闭按钮事件
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            statModal.style.display = 'none';
        });
    } else {
        console.warn('未找到关闭按钮');
    }
    
    // 点击模态框背景关闭
    statModal.addEventListener('click', function(e) {
        if (e.target === statModal) {
            statModal.style.display = 'none';
        }
    });
}

// 计算百分比
function calculatePercent(value, otherValue1, otherValue2) {
    const val = parseFloat(value) || 0;
    const other1 = parseFloat(otherValue1) || 0;
    const other2 = parseFloat(otherValue2) || 0;
    const total = val + other1 + other2;
    
    return total > 0 ? (val / total * 100) : 0;
}

// 初始化图表全屏功能
function initChartFullscreenButtons() {
    // 获取所有图表全屏按钮
    const chartFullscreenBtns = document.querySelectorAll('.fullscreen-btn[data-chart]');
    const chartModal = document.getElementById('chartModal');
    const chartModalTitle = document.getElementById('chartModalTitle');
    const chartModalContent = document.getElementById('chartModalContent');
    const closeBtn = chartModal.querySelector('.close-button');
    
    // 为每个全屏按钮添加点击事件
    chartFullscreenBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const chartId = this.getAttribute('data-chart');
            // 修复这里的错误，确保能找到标题元素
            let chartTitle = '';
            const headerElement = this.closest('.chart-header');
            if (headerElement) {
                const titleElement = headerElement.querySelector('h3');
                if (titleElement) {
                    chartTitle = titleElement.textContent;
                }
            }
            
            // 设置模态框标题
            chartModalTitle.textContent = chartTitle || '图表详情';
            
            // 根据图表类型生成内容
            let content = '';
            
            if (chartId === 'stockStats') {
                // 股票统计表格
                const stockStatsContainer = this.closest('.stock-stats-container');
                if (stockStatsContainer) {
                    const clonedContainer = stockStatsContainer.cloneNode(true);
                    const header = clonedContainer.querySelector('.chart-header');
                    if (header) header.remove(); // 移除标题部分
                    content = `<div class="stock-stats-container" style="height: auto;">${clonedContainer.innerHTML}</div>`;
                } else {
                    content = '<div>无法加载股票统计数据</div>';
                }
            } else {
                // 创建新的canvas元素
                content = `
                    <div class="chart-wrapper" style="width: 100%; height: 65vh;">
                        <canvas id="${chartId}_fullscreen" style="width: 100%; height: 100%;"></canvas>
                    </div>
                `;
            }
            
            // 设置模态框内容
            chartModalContent.innerHTML = content;
            
            // 显示模态框
            chartModal.style.display = 'flex';
            
            // 如果是图表，复制原图表数据到全屏图表
            if (chartId !== 'stockStats' && chartInstances && chartInstances[chartId]) {
                const originalChart = chartInstances[chartId];
                if (originalChart) {
                    try {
                        // 获取原图表的配置
                        const config = originalChart.config;
                        
                        // 调整全屏图表的配置
                        if (config.options) {
                            // 确保图表响应式
                            config.options.responsive = true;
                            config.options.maintainAspectRatio = false;
                            
                            // 增大字体大小
                            if (config.options.plugins && config.options.plugins.title) {
                                config.options.plugins.title.font = {
                                    size: 18
                                };
                            }
                            
                            // 增大刻度字体
                            if (config.options.scales) {
                                Object.keys(config.options.scales).forEach(axis => {
                                    if (config.options.scales[axis].ticks) {
                                        config.options.scales[axis].ticks.font = {
                                            size: 14
                                        };
                                    }
                                });
                            }
                            
                            // 显示图例
                            if (config.options.plugins && config.options.plugins.legend) {
                                config.options.plugins.legend.display = true;
                            }
                        }
                        
                        // 创建全屏图表
                        const canvasElement = document.getElementById(`${chartId}_fullscreen`);
                        if (canvasElement) {
                            // 确保Canvas元素有正确的尺寸
                            canvasElement.style.width = '100%';
                            canvasElement.style.height = '100%';
                            
                            // 延迟一帧再渲染图表，确保DOM已更新
                            setTimeout(() => {
                                const ctx = canvasElement.getContext('2d');
                                chartInstances[`${chartId}_fullscreen`] = new Chart(ctx, config);
                            }, 50);
                        }
                    } catch (error) {
                        console.error('创建全屏图表时出错:', error);
                        chartModalContent.innerHTML = '<div>加载图表时出错</div>';
                    }
                }
            }
        });
    });
    
    // 关闭按钮事件
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            chartModal.style.display = 'none';
        });
    }
    
    // 点击模态框背景关闭
    chartModal.addEventListener('click', function(e) {
        if (e.target === chartModal) {
            chartModal.style.display = 'none';
        }
    });
}

// 在页面加载完成后初始化图表全屏按钮
document.addEventListener('DOMContentLoaded', function() {
    // 初始化全屏按钮
    initFullscreenButtons();
    
    // 初始化图表全屏按钮
    initChartFullscreenButtons();
});
