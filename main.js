import { R2Sync } from './r2-sync.js';

// Initialize R2Sync
const r2Sync = new R2Sync();

// Global state
let allTrades = [];
let filteredTrades = [];
let currentDate = new Date();
const TOTAL_ACCOUNT_VALUE = 100000;

// DOM Elements
const showDateRangeBtn = document.getElementById('showDateRangeBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const handleImportBtn = document.getElementById('handleImportForm');
const showImportModalBtn = document.getElementById('showImportModalBtn');
const configR2Btn = document.getElementById('configR2Btn');
const csvFile = document.getElementById('csvFile');

// 全局存储Chart实例
const chartInstances = {
    cumulativePnL: null,
    dailyPnL: null,
    durationPerformance: null,
    timePerformance: null,
    drawdown: null,
    weeklyWinRate: null,  
    weeklyTrades: null
};

// Initialize
async function init() {
    await loadTrades();
    setupEventListeners();
}

// Load trades from R2 or localStorage
async function loadTrades() {
    allTrades = loadTradesFromStorage();
    if (allTrades && allTrades.length > 0) {
        filteredTrades = [...allTrades];
        renderCalendar();
        updateStatistics();
    }
    
    r2Sync.loadFromR2('trades').then((trades) => {
        allTrades = trades;
        filteredTrades = [...allTrades];
        renderCalendar();
        updateStatistics();
        localStorage.setItem('trades', JSON.stringify(allTrades));
    });
}

// Save trades
async function saveTrades() {
    localStorage.setItem('trades', JSON.stringify(allTrades));
    await r2Sync.syncToR2(allTrades, 'trades');
}

// Setup Event Listeners
function setupEventListeners() {
    configR2Btn.addEventListener('click', handleConfigR2);
    showDateRangeBtn.addEventListener('click', toggleDatePicker);
    handleImportBtn.addEventListener('submit', handleImport);
    showImportModalBtn.addEventListener('click', showImportModal);
    csvFile.addEventListener('change', handleFileSelect);

    document.querySelectorAll('.preset-dates button').forEach(button => {
        button.addEventListener('click', (e) => {
            const range = e.target.dataset.range;
            setDateRange(range);
        });
    });
    document.querySelectorAll('.month-nav button').forEach(button => {
        button.addEventListener('click', (e) => {
            const direction = parseInt(e.target.dataset.direction);
            navigateMonth(direction);
        });
    });
    const viewDetailsBtn = document.getElementById('viewDetailsBtn');
    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', viewTradeDetails);
    }
    const closeDetailsBtn = document.getElementById('closeTradeModalBtn');
    if (closeDetailsBtn) {
        closeDetailsBtn.addEventListener('click', closeTradeModal);
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
    });
}

// 页面加载时立即从 localStorage 加载数据
document.addEventListener('DOMContentLoaded', () => {
    init();
});

function getSameDayTrades(cTrade, aTrades) {
    const existTrades = Object.values(aTrades);
    const sameTrades = existTrades.filter(trade => trade.Symbol === cTrade.Symbol &&
        trade.TradeDate === cTrade.TradeDate &&
        trade['Open/CloseIndicator'] === cTrade['Open/CloseIndicator']);
    if (sameTrades.length > 0) {
        return sameTrades[0];
    } else {
        return null;
    }
}

function loadTradesFromStorage() {
    const storedTrades = localStorage.getItem('trades');
    if (storedTrades) {
        const allTrades = JSON.parse(storedTrades);
        return Object.values(
            allTrades.reduce((acc, item) => {
                // 如果相同交易已存在，则合并
                const existTrade = getSameDayTrades(item, acc);
                if (existTrade) {
                    if (acc[existTrade.TransactionID]["Open/CloseIndicator"] === "C") {
                        acc[existTrade.TransactionID].FifoPnlRealized = parseFloat(acc[existTrade.TransactionID].FifoPnlRealized) + parseFloat(item.FifoPnlRealized);
                    }
                    acc[existTrade.TransactionID].Quantity += item.Quantity;
                } else {
                    // 如果相同交易不存在，则初始化
                    acc[item.TransactionID] = { ...item };
                }
                return acc;
            }, {})
        );
    }
}

function clearData() {
    if (confirm('Are you sure you want to clear all trade data?')) {
        localStorage.removeItem('trades');
        trades = [];
        renderCalendar();
        updateStatistics();
    }
}


function handleFileSelect(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const text = e.target.result;
        const newTrades = parseCSV(text);
        mergeTrades(newTrades);
        allTrades = loadTradesFromStorage();
        renderCalendar();
        updateStatistics();
    };

    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.split('\n');
    const headers = lines[0].split(',');
    const result = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = lines[i].split(',');
        const trade = {};
        headers.forEach((header, index) => {
            trade[header.trim().replace(/"/g, '')] = values[index]?.trim().replace(/"/g, '') || '';
        });

        // 转换纽约时间到北京时间
        // if (trade.DateTime) {
        //     const beijingDateTime = convertNYtoBeijing(trade.DateTime);
        //     trade.TradeDate = beijingDateTime.toISOString().split('T')[0];
        // }

        result.push(trade);
    }

    return result;
}

function getTradeOpenTime(cTrade, aTrades) {
    const openTime = aTrades.filter(trade => trade.Symbol === cTrade.Symbol &&
        trade.DateTime < cTrade.DateTime &&
        trade['Open/CloseIndicator'] === 'O').reduce((max, item) => (item.DateTime > max ? item.DateTime : max), "");
    return openTime;
}

function mergeTrades(newTrades) {
    const tradeMap = new Map();

    // 先加载现有交易
    allTrades.forEach(trade => {
        tradeMap.set(trade.TransactionID, trade);
    });

    // 合并新交易
    newTrades.forEach(trade => {
        if (trade['Open/CloseIndicator'] === 'C') {
            const openTime = getTradeOpenTime(trade, newTrades);
            trade.OpenDateTime = openTime;
        }
        tradeMap.set(trade.TransactionID, trade);
    });

    allTrades = Array.from(tradeMap.values());
    localStorage.setItem('trades', JSON.stringify(allTrades));

    saveTrades();
}

function getDailyStats(date) {
    //console.log(date)
    const dateStr = date.toISOString().split('T')[0];
    //console.log(dateStr)

    // 只统计已关闭的交易
    const dayTrades = allTrades.filter(trade =>
        trade.TradeDate === dateStr &&
        trade['Open/CloseIndicator'] === 'C'
    );

    if (dayTrades.length === 0) return null;

    // 按股票合并交易数量
    const symbolTrades = new Map();
    dayTrades.forEach(trade => {
        if (!symbolTrades.has(trade.Symbol)) {
            symbolTrades.set(trade.Symbol, {
                quantity: 0,
                pnl: 0
            });
        }
        const stats = symbolTrades.get(trade.Symbol);
        stats.quantity += Math.abs(parseFloat(trade.Quantity) || 0);
        stats.pnl += parseFloat(trade.FifoPnlRealized) || 0;
    });

    const totalPnL = Array.from(symbolTrades.values()).reduce((sum, stat) => sum + stat.pnl, 0);
    const totalTrades = symbolTrades.size;
    const pnlPercentage = (totalPnL / TOTAL_ACCOUNT_VALUE) * 100;

    const winningTrades = dayTrades.filter(trade => parseFloat(trade.FifoPnlRealized) > 0).length;
    const winRate = (winningTrades / dayTrades.length) * 100;

    return {
        pnl: totalPnL,
        trades: totalTrades,
        winRate: winRate,
        pnlPercentage: pnlPercentage,
        symbols: Array.from(symbolTrades.entries())
    };
}

function getWeeklyStats(startDate, endDate) {
    let totalPnL = 0;
    let tradingDays = 0;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const stats = getDailyStats(d);
        if (stats) {
            totalPnL += stats.pnl;
            tradingDays++;
        }
    }

    return {
        pnL: totalPnL,
        days: tradingDays
    };
}

function getMonthlyStats(year, month) {
    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, month + 1, 0));
    return getWeeklyStats(startDate, endDate);
}

function formatPnL(pnl) {
    const prefix = pnl >= 0 ? '+' : '';
    const className = pnl >= 0 ? 'profit' : 'fail';
    return `<span class="${className}">${prefix}$${pnl.toFixed(2)}</span>`;
}

// 添加打开交易详情弹窗的函数
function showTradeDetails(date) {
    const modal = document.getElementById('tradeModal');
    const dateStr = date.toISOString().split('T')[0];

    // 获取当日已关闭的交易
    const dayTrades = allTrades.filter(trade =>
        trade.TradeDate === dateStr &&
        trade['Open/CloseIndicator'] === 'C'
    );

    // 按股票合并交易记录
    const consolidatedTrades = new Map();

    dayTrades.forEach(trade => {
        const symbol = trade.Symbol;
        const side = trade['Buy/Sell'].toLowerCase() === 'sell' ? 'LONG' : 'SHORT';

        if (!consolidatedTrades.has(symbol)) {
            consolidatedTrades.set(symbol, {
                Symbol: symbol,
                Side: side,
                DateTime: trade.DateTime, // 使用第一笔交易的时间
                FifoPnlRealized: 0,
                Quantity: 0,
                trades: [],
                TradeTimes: new Map()
            });
        }

        const consolidated = consolidatedTrades.get(symbol);
        consolidated.FifoPnlRealized += parseFloat(trade.FifoPnlRealized) || 0;
        consolidated.Quantity += Math.abs(parseFloat(trade.Quantity) || 0);
        consolidated.trades.push(trade);

        // Count trades by DateTime
        const tradeTime = trade.DateTime;
        consolidated.TradeTimes.set(tradeTime, (consolidated.TradeTimes.get(tradeTime) || 0) + 1);
    });

    consolidatedTrades.forEach(consolidated => {
        // Convert TradeTimes Map to total count of unique times
        consolidated.TradeTimes = consolidated.TradeTimes.size;
    });

    // 设置模态框标题和统计信息
    document.getElementById('modalDate').textContent = date.toLocaleDateString();

    // 计算统计数据
    const consolidatedArray = Array.from(consolidatedTrades.values());
    const totalPnL = consolidatedArray.reduce((sum, trade) => sum + trade.FifoPnlRealized, 0);
    const winners = consolidatedArray.filter(trade => trade.FifoPnlRealized > 0).length;
    const winrate = consolidatedArray.length ? (winners / consolidatedArray.length * 100).toFixed(2) : '0.00';

    // 更新统计信息显示
    document.getElementById('modalNetPnL').textContent = `Net P&L ${formatPnL(totalPnL)}`;
    document.getElementById('modalTotalTrades').textContent = consolidatedArray.length;
    document.getElementById('modalWinners').textContent = winners;
    document.getElementById('modalLosers').textContent = consolidatedArray.length - winners;
    document.getElementById('modalWinrate').textContent = `${winrate}%`;

    // 填充交易表格
    const tableBody = document.getElementById('tradesTableBody');
    tableBody.innerHTML = '';

    consolidatedArray.forEach(trade => {
        const row = document.createElement('tr');
        const pnl = trade.FifoPnlRealized;
        const roi = ((pnl / TOTAL_ACCOUNT_VALUE) * 100).toFixed(2);

        row.innerHTML = `
                    <td>${trade.DateTime}</td>
                    <td>${trade.Symbol}</td>
                    <td>${trade.Side}</td>
                    <td>${trade.Symbol}</td>
                    <td class="${pnl >= 0 ? 'profit' : 'fail'}">${formatPnL(pnl)}</td>
                    <td class="${pnl >= 0 ? 'profit' : 'fail'}">${roi}%</td>
                    <td>${trade.TradeTimes}</td>
                    <td>--</td>
                `;

        tableBody.appendChild(row);
    });

    modal.style.display = 'block';
}

// 关闭弹窗
// Modify closeTradeModal function
function closeTradeModal() {
    const modal = document.getElementById('tradeModal');
    if (modal) {
        modal.style.display = 'none';
        // Reset but don't remove modal content
        const modalContent = modal.querySelector('.trade-modal-content');
        if (modalContent) {
            modalContent.innerHTML = `
                <div class="modal-header">
                    <h2 id="modalDate"></h2>
                    <h2 id="modalNetPnL"></h2>
                </div>
                <div class="trade-stats">
                    <div>
                        <span>Total Trades: </span><span id="modalTotalTrades"></span>
                        <span>Winners: </span><span id="modalWinners"></span>
                        <span>Winrate: </span><span id="modalWinrate"></span>
                    </div>
                    <div>
                        <span>Losers: </span><span id="modalLosers"></span>
                        <span>Volume: </span><span id="modalVolume"></span>
                        <span>Profit Factor: </span><span id="modalProfitFactor"></span>
                    </div>
                </div>
                <table class="trades-table">
                    <thead>
                        <tr>
                            <th>Open Time</th>
                            <th>Ticker</th>
                            <th>Side</th>
                            <th>Instrument</th>
                            <th>Net P&L</th>
                            <th>Net ROI</th>
                            <th>Trade Times</th>
                            <th>Playbook</th>
                        </tr>
                    </thead>
                    <tbody id="tradesTableBody">
                    </tbody>
                </table>
                <div class="button-group">
                    <button class="cancel-button" id="closeTradeModalBtn">Cancel</button>
                    <button class="details-button" id="viewDetailsBtn">View Details</button>
                </div>
            `;
            
            // Reattach event listeners
            const closeBtn = modalContent.querySelector('#closeTradeModalBtn');
            const viewDetailsBtn = modalContent.querySelector('#viewDetailsBtn');
            
            if (closeBtn) {
                closeBtn.addEventListener('click', closeTradeModal);
            }
            if (viewDetailsBtn) {
                viewDetailsBtn.addEventListener('click', viewTradeDetails);
            }
        }
    }
}

// 查看详情按钮的处理函数
function viewTradeDetails() {
    const dateStr = document.getElementById('modalDate').textContent;
    const localDate = new Date(dateStr);
    const date = new Date(Date.UTC(
        localDate.getFullYear(),
        localDate.getMonth(),
        localDate.getDate()
    ));
    const today = date.toISOString().split('T')[0]
    const modalContent = document.querySelector('.trade-modal-content');
    
    // Get detailed trades for the selected date
    const detailedTrades = allTrades.filter(trade => 
        trade.TradeDate === today &&
        trade['Open/CloseIndicator'] === 'C'
    ).sort((a, b) => {
        const timeA = new Date(a.DateTime).getTime();
        const timeB = new Date(b.DateTime).getTime();
        return timeA - timeB;
    });

    // Create detailed view
    const detailedView = `
        <div class="modal-header">
            <h2>${dateStr} - Detailed Trades</h2>
            <button onclick="closeTradeModal()" class="close-button">&times;</button>
        </div>
        <div class="trades-details">
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Symbol</th>
                        <th>Side</th>
                        <th>Quantity</th>
                        <th>Entry Price</th>
                        <th>Exit Price</th>
                        <th>Duration</th>
                        <th>P&L</th>
                        <th>ROI%</th>
                    </tr>
                </thead>
                <tbody>
                    ${detailedTrades.map(trade => {
                        const pnl = parseFloat(trade.FifoPnlRealized);
                        const roi = ((pnl / TOTAL_ACCOUNT_VALUE) * 100).toFixed(2);
                        const duration = calculateDuration(trade.OpenDateTime, trade.DateTime);
                        return `
                            <tr>
                                <td>${new Date(trade.DateTime).toLocaleString()}</td>
                                <td class="symbol">${trade.Symbol}</td>
                                <td>${trade['Buy/Sell']}</td>
                                <td>${Math.abs(trade.Quantity)}</td>
                                <td>${trade.TradePrice}</td>
                                <td>${trade.ClosePrice}</td>
                                <td>${duration}</td>
                                <td class="${pnl >= 0 ? 'profit' : 'fail'}">${formatPnL(pnl)}</td>
                                <td class="${pnl >= 0 ? 'profit' : 'fail'}">${roi}%</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <div class="button-group">
            <button class="cancel-button" onclick="closeTradeModal()">Close</button>
        </div>
    `;

    modalContent.innerHTML = detailedView;
}

// Helper function to calculate trade duration
function calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMinutes = Math.floor((end - start) / (1000 * 60));
    
    if (diffMinutes < 60) {
        return `${diffMinutes}m`;
    } else {
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        return `${hours}h ${minutes}m`;
    }
}

// 新增日期范围处理函数
function setDateRange(range) {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (range) {
        case 'today':
            break;
        case 'thisWeek':
            start = new Date(today.setDate(today.getDate() - today.getDay()));
            break;
        case 'thisMonth':
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case 'last30Days':
            start = new Date(today.setDate(today.getDate() - 30));
            break;
        case 'lastMonth':
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'thisQuarter':
            const quarter = Math.floor(today.getMonth() / 3);
            start = new Date(today.getFullYear(), quarter * 3, 1);
            end = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
            break;
        case 'ytd':
            start = new Date(today.getFullYear(), 0, 1);
            break;
    }

    document.getElementById('startDate').value = start.toISOString().split('T')[0];
    document.getElementById('endDate').value = end.toISOString().split('T')[0];
    toggleDatePicker();

    filteredTrades = allTrades.filter(trade =>
        trade.TradeDate > start.toISOString().split('T')[0] &&
        trade.TradeDate <= end.toISOString().split('T')[0]
    );

    updateCalendarWithTrades();
}

// IB数据导入处理
// 修改导入处理函数
async function handleImport(event) {
    event.preventDefault();
    const token = document.getElementById('flexToken').value;
    const queryId = document.getElementById('reportId').value;

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
                } else {
                    alert(`Fetch csv failed: ${csvData}`);
                }


            } else {
                console.error("Failed to fetch the initial response:", response.statusText);
            }

        } else {
            const errorMessage = xmlDoc.querySelector('ErrorMessage')?.textContent;
            throw new Error(errorMessage || 'Import failed');
        }
    } catch (error) {
        alert(`Import failed: ${error.message}`);
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

// 处理CSV数据的函数
function processTradeData(csvData) {
    // 解析CSV数据
    const rows = csvData.split('\n');
    const headers = rows[0].split(',');
    const newTrades = [];

    for (let i = 1; i < rows.length; i++) {
        if (!rows[i].trim()) continue;

        const values = rows[i].split(',');
        const trade = {};

        headers.forEach((header, index) => {
            trade[header.replace(/['"]+/g, '').trim()] = values[index]?.replace(/['"]+/g, '').trim();
        });

        newTrades.push(trade);
    }

    mergeTrades(newTrades);

    // 更新日历数据
    updateCalendarWithTrades();

    // 关闭导入弹窗
    document.getElementById('importModal').style.display = 'none';
}

// 更新日历数据的函数
function updateCalendarWithTrades() {
    allTrades.forEach(trade => {
        // 根据交易数据更新日历显示
        if (trade.TradeDate) {
            // console.log(trade.TradeDate);
            const tradeDate = new Date(trade.TradeDate);
            // console.log(tradeDate);
            const dayElement = document.querySelector(`[data-date="${trade.TradeDate}"]`);
            // console.log(dayElement);

            if (dayElement) {
                // 更新日历单元格的数据
                updateDayCell(dayElement, trade);
            }
        }

    });

    // 重新渲染日历
    renderCalendar();

    updateStatistics();
}

// 更新单个日历单元格的函数
function updateDayCell(dayElement, trade) {
    const pnl = parseFloat(trade.NetPnL || 0);
    const currentPnl = parseFloat(dayElement.dataset.pnl || 0);

    dayElement.dataset.pnl = currentPnl + pnl;
    dayElement.dataset.trades = (parseInt(dayElement.dataset.trades || 0) + 1).toString();

    // 更新显示
    updateDayCellDisplay(dayElement);
}

// 更新日历单元格显示的函数
function updateDayCellDisplay(dayElement) {
    const pnl = parseFloat(dayElement.dataset.pnl);
    const trades = parseInt(dayElement.dataset.trades);

    dayElement.querySelector('.day-pnl').textContent = formatPnL(pnl);
    dayElement.querySelector('.day-trades').textContent = `${trades} trade${trades !== 1 ? 's' : ''}`;

    // 更新颜色
    dayElement.classList.toggle('positive', pnl > 0);
    dayElement.classList.toggle('negative', pnl < 0);
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));

    document.getElementById('currentMonth').textContent = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' });

    const monthlyStats = getMonthlyStats(year, month);
    document.getElementById('monthlyPnL').innerHTML = formatPnL(monthlyStats.pnL);
    document.getElementById('tradingDays').textContent = `${monthlyStats.days} days`;

    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';

    // Add headers
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Weekly'];
    days.forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = day;
        calendar.appendChild(header);
    });

    // Add days
    let currentWeekPnL = 0;
    let currentWeekDays = 0;
    let weekStartDate = new Date(firstDay);

    for (let i = 0; i < firstDay.getDay(); i++) {
        calendar.appendChild(document.createElement('div'));
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(Date.UTC(year, month, day));
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';

        const stats = getDailyStats(date);
        if (stats) {
            dayDiv.className += stats.pnl >= 0 ? ' trading-day' : ' negative';
            dayDiv.innerHTML = `
                        ${day}
                        <div class="trade-info">
                            ${formatPnL(stats.pnl)}<br>
                            ${stats.trades} symbols<br>
                            ${stats.pnlPercentage.toFixed(1)}%<br>
                            ${stats.winRate.toFixed(1)}% WR
                        </div>
                    `;
            currentWeekPnL += stats.pnl;
            currentWeekDays++;
        } else {
            dayDiv.textContent = day;
        }
        // 在创建日期单元格时添加点击事件
        dayDiv.addEventListener('click', () => {
            showTradeDetails(date);
        });

        calendar.appendChild(dayDiv);

        if (date.getDay() === 6 || day === lastDay.getDate()) {
            const blocksNum = 6 - date.getDay();
            for (let i = 0; i < blocksNum; i++) {
                const nullDiv = document.createElement('div');
                nullDiv.className = 'calendar-day';
                calendar.appendChild(nullDiv);
            }
            const weekDiv = document.createElement('div');
            weekDiv.className = 'week-summary';
            weekDiv.innerHTML = `
                        Week ${Math.ceil(day / 7)}<br>
                        ${formatPnL(currentWeekPnL)}<br>
                        ${currentWeekDays} days
                    `;
            calendar.appendChild(weekDiv);
            currentWeekPnL = 0;
            currentWeekDays = 0;
        }
    }

}

function navigateMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar();
}

// 当点击模态框外部时关闭模态框
window.onclick = function (event) {
    const modal = document.getElementById('tradeModal');
    if (event.target === modal) {
        closeTradeModal();
    }
}

// 切换日期选择器显示/隐藏
function toggleDatePicker() {
    const picker = document.getElementById('dateRangePicker');
    picker.classList.toggle('active');
}

// 显示导入模态框
function showImportModal() {
    const modal = document.getElementById('importModal');
    modal.style.display = 'block';
}

// 点击外部关闭日期选择器
document.addEventListener('click', function (event) {
    const picker = document.getElementById('dateRangePicker');
    const datePickerContainer = document.querySelector('.date-picker-container');

    if (!datePickerContainer.contains(event.target)) {
        picker.classList.remove('active');
    }
});

// render charts
function calculateStats() {
    // 只统计已关闭的交易
    const dayTrades = filteredTrades.filter(trade =>
        trade['Open/CloseIndicator'] === 'C'
    );
    // 1. Net P&L 计算
    const netPnL = dayTrades.reduce((sum, trade) => sum + parseFloat(trade.FifoPnlRealized), 0);

    // 2. Trade Win % 计算
    const winningTrades = dayTrades.filter(trade => parseFloat(trade.FifoPnlRealized) > 0);
    const losingTrades = dayTrades.filter(trade => parseFloat(trade.FifoPnlRealized) < 0);
    const neutralTrades = dayTrades.filter(trade => parseFloat(trade.FifoPnlRealized) === 0);

    const winRate = (winningTrades.length / dayTrades.length) * 100;

    // 3. Profit Factor 计算
    const totalProfits = winningTrades.reduce((sum, trade) => sum + parseFloat(trade.FifoPnlRealized), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, trade) => sum + parseFloat(trade.FifoPnlRealized), 0));
    const profitFactor = totalLosses === 0 ? totalProfits : totalProfits / totalLosses;

    // 4. Day Win % 计算
    const tradingDays = new Map();
    dayTrades.forEach(trade => {
        const date = new Date(trade.OrderTime).toDateString();
        if (!tradingDays.has(date)) {
            tradingDays.set(date, { pnL: 0 });
        }
        tradingDays.get(date).pnL += parseFloat(trade.FifoPnlRealized);
    });

    const winningDays = Array.from(tradingDays.values()).filter(day => day.pnL > 0).length;
    const losingDays = Array.from(tradingDays.values()).filter(day => day.pnL < 0).length;
    const neutralDays = Array.from(tradingDays.values()).filter(day => day.pnL === 0).length;

    const dayWinRate = (winningDays / tradingDays.size) * 100;

    // 5. Average Win/Loss Trade 计算
    const avgWin = winningTrades.length > 0
        ? totalProfits / winningTrades.length
        : 0;
    const avgLoss = losingTrades.length > 0
        ? totalLosses / losingTrades.length
        : 0;
    const avgRate = (avgWin / avgLoss) * 100;

    // 6. 生成每日累计P&L数据
    const dailyCumulativePnL = [];
    let cumulative = 0;
    Array.from(tradingDays.entries())
        .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB))
        .forEach(([date, data]) => {
            cumulative += data.pnL;
            dailyCumulativePnL.push({
                date: date,
                value: cumulative
            });
        });

    // 7. 生成每日P&L数据
    const dailyPnL = Array.from(tradingDays.entries())
        .sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB))
        .map(([date, data]) => ({
            date: date,
            value: data.pnL
        }));

    return {
        netPnL: netPnL,
        tradeCount: dayTrades.length,
        winRate: {
            percentage: winRate,
            winning: winningTrades.length,
            neutral: neutralTrades.length,
            losing: losingTrades.length
        },
        profitFactor: profitFactor,
        dayWinRate: {
            percentage: dayWinRate,
            winning: winningDays,
            neutral: neutralDays,
            losing: losingDays
        },
        avgTrade: {
            avgRate: avgRate,
            avgWin: avgWin,
            avgLoss: avgLoss
        },
        dailyCumulativePnL: dailyCumulativePnL,
        dailyPnL: dailyPnL
    };
}

function updateStatistics() {
    const stats = calculateAdvancedStats();

    // 更新统计卡片
    document.querySelector('.stat-header .trade-count').textContent = stats.tradeCount;
    document.querySelector('.stat-card .stat-value').textContent = `$${stats.netPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    document.querySelector('#win-rate .stat-value').textContent = `${stats.winRate.percentage.toFixed(2)}%`;
    document.querySelector('#win-rate .win').textContent = stats.winRate.winning;
    document.querySelector('#win-rate .neutral').textContent = stats.winRate.neutral;
    document.querySelector('#win-rate .loss').textContent = stats.winRate.losing;

    document.querySelector('#profit-factor .stat-value').textContent = stats.profitFactor.toFixed(2);

    document.querySelector('#day-win-rate .stat-value').textContent = `${stats.dayWinRate.percentage.toFixed(2)}%`;
    document.querySelector('#day-win-rate .win').textContent = stats.dayWinRate.winning;
    document.querySelector('#day-win-rate .neutral').textContent = stats.dayWinRate.neutral;
    document.querySelector('#day-win-rate .loss').textContent = stats.dayWinRate.losing;

    document.querySelector('#avg-win-loss .stat-value').textContent = `${stats.avgTrade.avgRate.toFixed(2)}%`;
    document.querySelector('#avg-win-loss .win').textContent = stats.avgTrade.winning;
    document.querySelector('#avg-win-loss .loss').textContent = stats.avgTrade.losing;

    // 更新图表
    updateCharts(stats);

    updateAdvancedCharts(stats);
}

// 销毁已存在的Chart实例
function destroyCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
}

function updateCharts(stats) {
    // 在创建新图表前销毁已存在的图表
    destroyCharts();

    // 累计盈亏图表
    chartInstances.cumulativeChart = new Chart(
        document.getElementById('cumulativePnLChart').getContext('2d'),
        {
            type: 'line',
            data: {
                labels: stats.dailyCumulativePnL.map(d => d.date),
                datasets: [{
                    label: 'Cumulative P&L',
                    data: stats.dailyCumulativePnL.map(d => d.value),
                    fill: true,
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => '$' + value.toLocaleString()
                        }
                    }
                }
            }
        }
    );

    // 每日盈亏图表
    chartInstances.dailyChart = new Chart(
        document.getElementById('dailyPnLChart').getContext('2d'),
        {
            type: 'bar',
            data: {
                labels: stats.dailyPnL.map(d => d.date),
                datasets: [{
                    label: 'Daily P&L',
                    data: stats.dailyPnL.map(d => d.value),
                    backgroundColor: function (context) {
                        const value = context.raw;
                        return value >= 0 ? '#2ecc71' : '#e74c3c';
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: value => '$' + value.toLocaleString()
                        }
                    }
                }
            }
        }
    );
}

function calculateAdvancedStats(trades) {
    const basicStats = calculateStats(filteredTrades);

    // 计算交易持续时间性能
    const durationPerformance = filteredTrades.filter(trade => trade['Open/CloseIndicator'] === 'C').reduce((acc, trade) => {
        // 计算交易持续时间（分钟）
        const duration = (new Date(trade.DateTime) - new Date(trade.OpenDateTime)) / (1000 * 60);

        // 创建持续时间区间
        let durationRange;
        if (duration <= 5) durationRange = '0-5m';
        else if (duration <= 15) durationRange = '5-15m';
        else if (duration <= 30) durationRange = '15-30m';
        else if (duration <= 60) durationRange = '30-60m';
        else if (duration <= 120) durationRange = '1-2h';
        else if (duration <= 240) durationRange = '2-4h';
        else durationRange = '4h+';

        // 初始化区间数据
        if (!acc[durationRange]) {
            acc[durationRange] = {
                totalPnL: 0,
                count: 0,
                winners: 0,
                losers: 0
            };
        }

        // 更新区间统计
        acc[durationRange].totalPnL += parseFloat(trade.FifoPnlRealized);
        acc[durationRange].count += 1;
        if (parseFloat(trade.FifoPnlRealized) > 0) acc[durationRange].winners += 1;
        if (parseFloat(trade.FifoPnlRealized) < 0) acc[durationRange].losers += 1;

        return acc;
    }, {});

    // 转换为图表数据格式
    const durationPerformanceData = {
        labels: ['0-5m', '5-15m', '15-30m', '30-60m', '1-2h', '2-4h', '4h+'],
        avgPnL: [],
        winRate: []
    };

    durationPerformanceData.labels.forEach(label => {
        const data = durationPerformance[label] || { totalPnL: 0, count: 0, winners: 0, losers: 0 };
        const avgPnL = data.count > 0 ? data.totalPnL / data.count : 0;
        const winRate = data.count > 0 ? (data.winners / data.count) * 100 : 0;

        durationPerformanceData.avgPnL.push(avgPnL);
        durationPerformanceData.winRate.push(winRate);
    });

    // 计算交易时间性能
    const timePerformance = filteredTrades.reduce((acc, trade) => {
        const hour = new Date(trade.DateTime).getHours();

        if (!acc[hour]) {
            acc[hour] = {
                totalPnL: 0,
                count: 0,
                winners: 0,
                losers: 0
            };
        }

        acc[hour].totalPnL += parseFloat(trade.FifoPnlRealized);
        acc[hour].count += 1;
        if (parseFloat(trade.FifoPnlRealized) > 0) acc[hour].winners += 1;
        if (parseFloat(trade.FifoPnlRealized) < 0) acc[hour].losers += 1;

        return acc;
    }, {});

    // 确保所有小时都有数据，并按照时间顺序排列
    const timePerformanceData = {
        labels: Array.from({ length: 24 }, (_, i) => {
            const hour = i.toString().padStart(2, '0');
            return `${hour}:00`;
        }),
        avgPnL: [],
        winRate: []
    };

    timePerformanceData.labels.forEach((_, i) => {
        const data = timePerformance[i] || { totalPnL: 0, count: 0, winners: 0, losers: 0 };
        const avgPnL = data.count > 0 ? data.totalPnL / data.count : 0;
        const winRate = data.count > 0 ? (data.winners / data.count) * 100 : 0;

        timePerformanceData.avgPnL.push(avgPnL);
        timePerformanceData.winRate.push(winRate);
    });

    // 计算回撤
    const drawdown = calculateDrawdown(basicStats.dailyPnL);

    // Calculate per-stock statistics
    const stockStats = {};
    filteredTrades.filter(trade => trade['Open/CloseIndicator'] === 'C').forEach(trade => {
        if (!stockStats[trade.Symbol]) {
            stockStats[trade.Symbol] = {
                symbol: trade.Symbol,
                totalProfit: 0,
                totalLoss: 0,
                tradeCount: 0
            };
        }
        
        const profit = parseFloat(trade.FifoPnlRealized);
        stockStats[trade.Symbol].tradeCount++;
        if (profit >= 0) {
            stockStats[trade.Symbol].totalProfit += profit;
        } else {
            stockStats[trade.Symbol].totalLoss += Math.abs(profit);
        }
    });

    // Convert to array and sort
    const stockList = Object.values(stockStats);
    const sortedByProfit = [...stockList].sort((a, b) => b.totalProfit - a.totalProfit);
    const sortedByLoss = [...stockList].sort((a, b) => b.totalLoss - a.totalLoss);

    // 添加周统计计算
    const weeklyStats = filteredTrades.reduce((acc, trade) => {
        const date = new Date(trade.TradeDate);
        const weekKey = `${date.getFullYear()}-W${getWeekNumber(date)}`;
        
        if (!acc[weekKey]) {
            acc[weekKey] = {
                winCount: 0,
                totalTrades: 0,
                totalPnL: 0,
                tradeAmount: 0
            };
        }
        
        if (trade['Open/CloseIndicator'] === 'C') {
            const pnl = parseFloat(trade.FifoPnlRealized);
            acc[weekKey].totalPnL += pnl;
            acc[weekKey].win = pnl >= 0 ? (acc[weekKey].win || 0) + 1 : (acc[weekKey].win || 0);
            acc[weekKey].winProfit = pnl >= 0 ? (acc[weekKey].winProfit || 0) + pnl : (acc[weekKey].winProfit || 0);
            acc[weekKey].loss = pnl < 0 ? (acc[weekKey].loss || 0) + 1 : (acc[weekKey].loss || 0);
            acc[weekKey].lossAmount = pnl < 0 ? (acc[weekKey].lossAmount || 0) + Math.abs(pnl) : (acc[weekKey].lossAmount || 0);
            acc[weekKey].totalTrades++;
            acc[weekKey].tradeAmount += Math.abs(parseFloat(trade.CostBasis));
            if (pnl > 0) acc[weekKey].winCount++;
        }
        
        return acc;
    }, {});

    // 转换为图表数据格式
    const weeklyData = Object.entries(weeklyStats).map(([week, data]) => ({
        week,
        winRate: (data.winCount / data.totalTrades) * 100,
        tradeCount: data.totalTrades,
        avgWinLoss: (data.winProfit / (data.win || 1)) / ((data.lossAmount / (data.loss || 1)) || 1) * 100,
        winProfit: data.winProfit || 0,
        lossAmount: data.lossAmount || 0,
        tradeAmount: data.tradeAmount
    }));

    return {
        ...basicStats,
        durationPerformance: durationPerformanceData,
        timePerformance: timePerformanceData,
        drawdown,
        topProfitableStocks: sortedByProfit.slice(0, 3),
        topLossStocks: sortedByLoss.slice(0, 3),
        weeklyData: weeklyData.sort((a, b) => a.week.localeCompare(b.week))
    };
}

// 辅助函数：获取周数
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

function calculateDrawdown(dailyPnL) {
    let peak = -Infinity;
    let drawdown = [];

    dailyPnL.forEach((data, index) => {
        if (data.value > peak) {
            peak = data.value;
        }
        const currentDrawdown = data.value - peak;
        drawdown.push({
            date: data.date,
            value: currentDrawdown
        });
    });

    return drawdown;
}

function updateAdvancedCharts(stats) {
    // 交易持续时间性能图表
    chartInstances.durationPerformance = new Chart(
        document.getElementById('durationPerformanceChart').getContext('2d'),
        {
            type: 'bar',
            data: {
                labels: stats.durationPerformance.labels,
                datasets: [
                    {
                        label: 'Average P&L',
                        data: stats.durationPerformance.avgPnL,
                        yAxisID: 'y1',
                        type: 'bar',
                        backgroundColor: 'rgba(46, 204, 113, 0.6)',
                        borderColor: '#2ecc71',
                        borderWidth: 1
                    },
                    {
                        label: 'Win Rate',
                        data: stats.durationPerformance.winRate,
                        yAxisID: 'y2',
                        type: 'line',
                        borderColor: '#3498db',
                        borderWidth: 2,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y1: {
                        position: 'left',
                        beginAtZero: true,
                        ticks: {
                            callback: value => '$' + value.toLocaleString()
                        }
                    },
                    y2: {
                        position: 'right',
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: value => value + '%'
                        }
                    }
                }
            }
        }
    );

    // 交易时间性能图表
    chartInstances.timePerformance = new Chart(
        document.getElementById('timePerformanceChart').getContext('2d'),
        {
            type: 'bar',
            data: {
                labels: stats.timePerformance.labels,
                datasets: [
                    {
                        label: 'Average P&L',
                        data: stats.timePerformance.avgPnL,
                        yAxisID: 'y1',
                        type: 'bar',
                        backgroundColor: 'rgba(46, 204, 113, 0.6)',
                        borderColor: '#2ecc71',
                        borderWidth: 1
                    },
                    {
                        label: 'Win Rate',
                        data: stats.timePerformance.winRate,
                        yAxisID: 'y2',
                        type: 'line',
                        borderColor: '#3498db',
                        borderWidth: 2,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y1: {
                        position: 'left',
                        beginAtZero: true,
                        ticks: {
                            callback: value => '$' + value.toLocaleString()
                        }
                    },
                    y2: {
                        position: 'right',
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: value => value + '%'
                        }
                    }
                }
            }
        }
    );

    // 回撤图表
    chartInstances.drawdown = new Chart(
        document.getElementById('drawdownChart').getContext('2d'),
        {
            type: 'line',
            data: {
                labels: stats.drawdown.map(d => d.date),
                datasets: [{
                    label: 'Drawdown',
                    data: stats.drawdown.map(d => -d.value),
                    fill: true,
                    borderColor: '#8e44ad',
                    backgroundColor: 'rgba(142, 68, 173, 0.2)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        reverse: false,
                        ticks: {
                            callback: value => '$' + (value).toLocaleString()
                        }
                    }
                },
                plugins: {
                    annotation: {
                        annotations: {
                            zero: {
                                type: 'line',
                                yMin: 0,
                                yMax: 0,
                                borderColor: '#95a5a6',
                                borderWidth: 1,
                                borderDash: [5, 5]
                            }
                        }
                    }
                }
            }
        }
    );

    // Update stock lists
    const formatMoney = (num) => `$${num.toFixed(2)}`;
    
    const topProfitList = document.getElementById('topProfitableStocks');
    topProfitList.innerHTML = stats.topProfitableStocks.map(stock => `
        <tr>
            <td class="symbol">${stock.symbol}</td>
            <td class="profit">${formatMoney(stock.totalProfit)}</td>
            <td class="loss">${formatMoney(stock.totalLoss)}</td>
            <td>${stock.tradeCount}</td>
        </tr>
    `).join('');
    
    const topLossList = document.getElementById('topLossStocks');
    topLossList.innerHTML = stats.topLossStocks.map(stock => `
        <tr>
            <td class="symbol">${stock.symbol}</td>
            <td class="profit">${formatMoney(stock.totalProfit)}</td>
            <td class="loss">${formatMoney(stock.totalLoss)}</td>
            <td>${stock.tradeCount}</td>
        </tr>
    `).join('');

    // 周度胜率和交易次数图表
    chartInstances.weeklyWinRate = new Chart(
        document.getElementById('weeklyStatsChart').getContext('2d'),
        {
            type: 'bar',
            data: {
                labels: stats.weeklyData.map(d => d.week),
                datasets: [
                    {
                        label: 'Trade Count',
                        data: stats.weeklyData.map(d => d.tradeCount),
                        type: 'bar',
                        backgroundColor: 'rgba(46, 204, 113, 0.6)',
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Win Rate %',
                        data: stats.weeklyData.map(d => d.winRate),
                        type: 'line',
                        borderColor: '#3498db',
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y1: {
                        position: 'left',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Trade Count'
                        }
                    },
                    y2: {
                        position: 'right',
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Win Rate %'
                        },
                        ticks: {
                            callback: value => value + '%'
                        }
                    }
                }
            }
        }
    );

    // 周度平均盈亏和交易金额图表
    chartInstances.weeklyTrades = new Chart(
        document.getElementById('weeklyTradeAnalysisChart').getContext('2d'),
        {
            type: 'bar',
            data: {
                labels: stats.weeklyData.map(d => d.week),
                datasets: [
                    {
                        label: 'Win Profit',
                        data: stats.weeklyData.map(d => d.winProfit),
                        type: 'bar',
                        backgroundColor: 'rgba(46, 204, 113, 0.6)',
                        stack: 'amount'
                    },
                    {
                        label: 'Loss Amount',
                        data: stats.weeklyData.map(d => d.lossAmount),
                        type: 'bar',
                        backgroundColor: 'rgba(231, 76, 60, 0.6)',
                        stack: 'amount'
                    },
                    {
                        label: 'Avg Win/Loss',
                        data: stats.weeklyData.map(d => d.avgWinLoss),
                        type: 'line',
                        borderColor: '#f1c40f',
                        borderWidth: 2,
                        fill: false,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y1: {
                        position: 'left',
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Amount ($)'
                        },
                        ticks: {
                            callback: value => '$' + value.toFixed(2)
                        }
                    },
                    y2: {
                        position: 'right',
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Avg Win/Loss (%)'
                        },
                        ticks: {
                            callback: value => value.toFixed(2) + '%'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': $' + context.raw.toFixed(2);
                            }
                        }
                    }
                }
            }
        }
    );
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
    
    filteredTrades = symbol ? 
        allTrades.filter(trade => trade.Symbol === symbol) : 
        [...allTrades];
        
    renderCalendar();
    updateStatistics();
}