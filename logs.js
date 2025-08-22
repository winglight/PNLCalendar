// logs.js - 日志管理功能
import { r2Sync } from './data.js';

// 日志数据结构
export let allLogs = [];

// 日志数据模式
export const LOG_TEMPLATE = {
    id: '', // 唯一标识符
    date: '', // 日期 YYYY-MM-DD
    type: 'daily', // 'daily' 或 'weekly'
    quickReview: {
        tradesCount: 0, // 交易笔数
        overallFeeling: 3 // 1-5分制
    },
    factRecord: '', // 记录事实
    learningPoints: '', // 提炼学习点
    improvementDirection: '', // 优化方向
    selfAffirmation: '', // 自我肯定
    associatedTrades: [], // 关联的交易ID列表
    
    // 每周复盘专用字段
    weeklyData: {
        totalTrades: 0, // 总交易笔数（自动计算）
        pnlResult: 0, // 盈亏结果（自动计算）
        maxWin: 0, // 最大单笔盈利（自动计算）
        maxLoss: 0, // 最大单笔亏损（自动计算）
        winRate: 0, // 胜率（自动计算）
        followsDailyLimit: true // 是否遵守"每日最多3笔交易"规则（自动计算）
    },
    successExperiences: {
        plannedTrades: '', // 哪些交易符合计划，带来了预期结果？
        emotionalStability: '' // 哪些行为让我情绪稳定？
    },
    mistakeSummary: {
        violatedPlans: [], // 哪些交易违背了计划？（多选）
        emotionalFactors: [] // 哪些情绪（贪婪/恐惧/犹豫）影响了操作？（多选）
    },
    nextWeekOptimization: {
        goodHabitToKeep: '', // 我下周要保持的1个好习惯
        mistakeToAvoid: '', // 我下周要避免的1个错误
        specificActions: '' // 具体执行动作
    },
    weeklyAffirmation: '', // 本周最值得肯定的一件事
    
    createdAt: '', // 创建时间戳
    updatedAt: '' // 更新时间戳
};

// 从本地存储加载日志数据
export function loadLogsFromStorage() {
    const storedLogs = localStorage.getItem('logs');
    if (storedLogs) {
        try {
            return JSON.parse(storedLogs);
        } catch (error) {
            console.error('Failed to parse logs from localStorage:', error);
            return [];
        }
    }
    return [];
}

// 保存日志数据到本地存储
export function saveLogsToStorage() {
    try {
        localStorage.setItem('logs', JSON.stringify(allLogs));
    } catch (error) {
        console.error('Failed to save logs to localStorage:', error);
    }
}

// 从R2或本地存储加载日志数据
export async function loadLogs() {
    allLogs = loadLogsFromStorage();

    // 异步从 R2 加载，使用 requestIdleCallback 避免阻塞其他请求
    const fetchLogs = async () => {
        try {
            const logs = await r2Sync.loadFromR2('logs');
            if (logs && logs.length > 0) {
                allLogs = logs;
                saveLogsToStorage();
            }
        } catch (error) {
            console.error('Failed to load logs from R2:', error);
        }
    };

    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(fetchLogs);
    } else {
        setTimeout(fetchLogs, 100);
    }

    return allLogs;
}

// 保存日志数据到R2和本地存储
export async function saveLogs() {
    try {
        saveLogsToStorage();
        await r2Sync.syncToR2(allLogs, 'logs');
    } catch (error) {
        console.error('Failed to save logs:', error);
    }
}

// 创建或更新日志
export function createOrUpdateLog(logData) {
    const now = new Date().toISOString();
    
    if (logData.id) {
        // 更新现有日志
        const index = allLogs.findIndex(log => log.id === logData.id);
        if (index !== -1) {
            allLogs[index] = {
                ...allLogs[index],
                ...logData,
                updatedAt: now
            };
        }
    } else {
        // 创建新日志
        const newLog = {
            ...LOG_TEMPLATE,
            ...logData,
            id: generateLogId(logData.date, logData.type),
            createdAt: now,
            updatedAt: now
        };
        allLogs.push(newLog);
    }
    
    saveLogs();
    return logData.id || generateLogId(logData.date, logData.type);
}

// 获取指定日期的日志
export function getLogByDate(date, type = 'daily') {
    return allLogs.find(log => log.date === date && log.type === type);
}

// 获取指定日期范围内的日志
export function getLogsByDateRange(startDate, endDate) {
    return allLogs.filter(log => {
        return log.date >= startDate && log.date <= endDate;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
}

// 获取所有日志（按日期倒序）
export function getAllLogs() {
    return allLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// 删除日志
export function deleteLog(logId) {
    const index = allLogs.findIndex(log => log.id === logId);
    if (index !== -1) {
        allLogs.splice(index, 1);
        saveLogs();
        return true;
    }
    return false;
}

// 生成日志ID
function generateLogId(date, type) {
    return `${type}_${date}_${Date.now()}`;
}

// 清空所有日志数据
export function clearLogs() {
    allLogs = [];
    localStorage.removeItem('logs');
}

// 获取指定周的日志（周复盘）
export function getWeeklyLog(weekStartDate) {
    const weekEnd = new Date(weekStartDate);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    return allLogs.find(log => 
        log.type === 'weekly' && 
        log.date >= weekStartDate.toISOString().split('T')[0] &&
        log.date <= weekEnd.toISOString().split('T')[0]
    );
}

// 关联交易到日志
export function associateTradeToLog(logId, tradeId) {
    const log = allLogs.find(l => l.id === logId);
    if (log && !log.associatedTrades.includes(tradeId)) {
        log.associatedTrades.push(tradeId);
        saveLogs();
    }
}

// 取消关联交易
export function disassociateTradeFromLog(logId, tradeId) {
    const log = allLogs.find(l => l.id === logId);
    if (log) {
        const index = log.associatedTrades.indexOf(tradeId);
        if (index !== -1) {
            log.associatedTrades.splice(index, 1);
            saveLogs();
        }
    }
}

// 批量关联当日交易到日志
export function associateDailyTradesToLog(date, trades) {
    const log = getLogByDate(date, 'daily');
    if (log && trades && trades.length > 0) {
        trades.forEach(trade => {
            if (trade.TransactionID && !log.associatedTrades.includes(trade.TransactionID)) {
                log.associatedTrades.push(trade.TransactionID);
            }
        });
        saveLogs();
    }
}

// 获取日志的预览文本（前三行）
export function getLogPreviewText(log) {
    const texts = [
        log.factRecord,
        log.learningPoints,
        log.improvementDirection,
        log.selfAffirmation
    ].filter(text => text && text.trim());
    
    return texts.slice(0, 3).join(' ').substring(0, 100) + (texts.join(' ').length > 100 ? '...' : '');
}