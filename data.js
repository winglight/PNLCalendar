// data.js - 处理交易数据相关功能
import { R2Sync } from './r2-sync.js';

// 初始化 R2Sync
export const r2Sync = new R2Sync();

// 全局状态
export let allTrades = [];
export let filteredTrades = [];
export const TOTAL_ACCOUNT_VALUE = 100000;

// 从本地存储加载交易数据
export function loadTradesFromStorage() {
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
    return [];
}

// 从R2或本地存储加载交易数据
export async function loadTrades() {
    allTrades = loadTradesFromStorage();
    if (allTrades && allTrades.length > 0) {
        filteredTrades = [...allTrades];
        return true;
    }
    
    const trades = await r2Sync.loadFromR2('trades');
    if (trades && trades.length > 0) {
        allTrades = trades;
        filteredTrades = [...allTrades];
        localStorage.setItem('trades', JSON.stringify(allTrades));
        return true;
    }
    
    return false;
}

// 保存交易数据
export async function saveTrades() {
    localStorage.setItem('trades', JSON.stringify(allTrades));
    await r2Sync.syncToR2(allTrades, 'trades');
}

// 清除数据
export function clearData() {
    if (confirm('Are you sure you want to clear all trade data?')) {
        localStorage.removeItem('trades');
        allTrades = [];
        filteredTrades = [];
        return true;
    }
    return false;
}

// 处理文件选择
export function handleFileSelect(event) {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = function (e) {
        const text = e.target.result;
        const newTrades = parseCSV(text);
        mergeTrades(newTrades);
        allTrades = loadTradesFromStorage();
        filteredTrades = [...allTrades];
        return true;
    };

    reader.readAsText(file);
}

// 解析CSV文件
export function parseCSV(text) {
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

        result.push(trade);
    }

    return result;
}

// 获取相同日期的交易
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

// 获取交易开仓时间
function getTradeOpenTime(cTrade, aTrades) {
    const openTime = aTrades.filter(trade => trade.Symbol === cTrade.Symbol &&
        trade.DateTime < cTrade.DateTime &&
        trade['Open/CloseIndicator'] === 'O').reduce((max, item) => (item.DateTime > max ? item.DateTime : max), "");
    return openTime;
}

// 合并交易数据
export function mergeTrades(newTrades) {
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

// 处理交易数据
export function processTradeData(csvData) {
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
    return true;
}

// 设置日期范围
export function setDateRange(range) {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (range) {
        case 'today':
            start = today;
            end = today;
            break;
        case 'thisWeek':
            start = new Date(today);
            start.setDate(today.getDate() - today.getDay());
            end = new Date(today);
            end.setDate(start.getDate() + 6);
            break;
        case 'thisMonth':
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case 'lastMonth':
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'thisYear':
            start = new Date(today.getFullYear(), 0, 1);
            end = new Date(today.getFullYear(), 11, 31);
            break;
        case 'lastYear':
            start = new Date(today.getFullYear() - 1, 0, 1);
            end = new Date(today.getFullYear() - 1, 11, 31);
            break;
        case 'all':
            // 设置一个很早的开始日期和今天作为结束日期
            start = new Date(2000, 0, 1);
            end = today;
            break;
    }

    document.getElementById('startDate').value = start.toISOString().split('T')[0];
    document.getElementById('endDate').value = end.toISOString().split('T')[0];
    
    filterTradesByDateRange(start, end);
}

// 根据日期范围过滤交易
export function filterTradesByDateRange(startDate, endDate) {
    if (!startDate || !endDate) return;
    
    // 确保日期是UTC日期对象
    const start = new Date(Date.UTC(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate()
    ));
    
    const end = new Date(Date.UTC(
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate(),
        23, 59, 59
    ));
    
    filteredTrades = allTrades.filter(trade => {
        const tradeDate = new Date(trade.TradeDate);
        return tradeDate >= start && tradeDate <= end;
    });
    
    return filteredTrades;
}

// 计算交易持续时间
export function calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return '--';
    
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

// 格式化盈亏显示
export function formatPnL(pnl) {
    const prefix = pnl >= 0 ? '+' : '';
    const className = pnl >= 0 ? 'profit' : 'fail';
    return `<span class="${className}">${prefix}$${parseFloat(pnl).toFixed(2)}</span>`;
}