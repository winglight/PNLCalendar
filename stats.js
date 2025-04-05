// stats.js - 处理统计数据和图表相关功能
import { allTrades, filteredTrades, TOTAL_ACCOUNT_VALUE, formatPnL } from './data.js';

// 全局存储Chart实例
export const chartInstances = {
    cumulativePnL: null,
    dailyPnL: null,
    durationPerformance: null,
    timePerformance: null,
    drawdown: null,
    weeklyWinRate: null,  
    weeklyTrades: null
};

// 获取每日统计数据
export function getDailyStats(date) {
    const dateStr = date.toISOString().split('T')[0];

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

// 获取每周统计数据
export function getWeeklyStats(startDate, endDate) {
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

// 获取每月统计数据
export function getMonthlyStats(year, month) {
    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, month + 1, 0));
    return getWeeklyStats(startDate, endDate);
}

// 计算统计数据
export function calculateStats() {
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
            avgLoss: avgLoss,
            winning: avgWin.toFixed(2),
            losing: avgLoss.toFixed(2)
        },
        dailyCumulativePnL: dailyCumulativePnL,
        dailyPnL: dailyPnL
    };
}

// 计算高级统计数据
export function calculateAdvancedStats() {
    const basicStats = calculateStats();

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

    // 计算每支股票的统计数据
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

    // 转换为数组并排序
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
        drawdown: drawdown,
        stockStats: {
            topProfitable: sortedByProfit.slice(0, 3),
            topLosses: sortedByLoss.slice(0, 3)
        },
        weeklyData: weeklyData.sort((a, b) => a.week.localeCompare(b.week))
    };
}

// 计算回撤
function calculateDrawdown(dailyPnL) {
    let peak = 0;
    let currentDrawdown = 0;
    let maxDrawdown = 0;
    let drawdownStart = null;
    let drawdownEnd = null;
    let maxDrawdownStart = null;
    let maxDrawdownEnd = null;
    let equity = 0;
    
    const drawdownData = [];
    
    dailyPnL.forEach((day, index) => {
        equity += day.value;
        
        if (equity > peak) {
            peak = equity;
            // 如果有正在进行的回撤，则结束它
            if (drawdownStart !== null) {
                drawdownEnd = index - 1;
                drawdownStart = null;
            }
        } else {
            currentDrawdown = peak - equity;
            
            // 如果这是新的回撤开始
            if (drawdownStart === null) {
                drawdownStart = index;
            }
            
            // 如果这是最大回撤
            if (currentDrawdown > maxDrawdown) {
                maxDrawdown = currentDrawdown;
                maxDrawdownStart = drawdownStart;
                maxDrawdownEnd = index;
            }
        }
        
        // 记录每日回撤数据
        drawdownData.push({
            date: day.date,
            equity: equity,
            drawdown: peak > 0 ? (peak - equity) : 0
        });
    });
    
    return {
        maxDrawdown: maxDrawdown,
        maxDrawdownPercent: peak > 0 ? (maxDrawdown / peak) * 100 : 0,
        maxDrawdownPeriod: maxDrawdownStart !== null ? {
            start: dailyPnL[maxDrawdownStart]?.date,
            end: dailyPnL[maxDrawdownEnd]?.date
        } : null,
        drawdownData: drawdownData
    };
}

// 获取周数
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// 更新统计信息
export function updateStatistics() {
    const stats = calculateAdvancedStats();

    // 更新统计卡片 - 添加安全检查
    const tradeCountEl = document.querySelector('.stat-header .trade-count');
    if (tradeCountEl) tradeCountEl.textContent = stats.tradeCount;
    
    const netPnLEl = document.querySelector('.stat-card .stat-value');
    if (netPnLEl) netPnLEl.textContent = `$${stats.netPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    // 修改胜率统计卡片，使条形图宽度与实际数值成比例
    const winRateEl = document.querySelector('#win-rate .stat-value');
    if (winRateEl) winRateEl.textContent = `${stats.winRate.percentage.toFixed(2)}%`;
    
    const winEl = document.querySelector('#win-rate .win');
    if (winEl) {
        winEl.textContent = stats.winRate.winning;
        // 计算胜率比例
        const totalTrades = stats.winRate.winning + stats.winRate.neutral + stats.winRate.losing;
        const winPercent = totalTrades > 0 ? (stats.winRate.winning / totalTrades * 100) : 0;
        winEl.style.width = `${winPercent}%`;
    }
    
    const neutralEl = document.querySelector('#win-rate .neutral');
    if (neutralEl) {
        neutralEl.textContent = stats.winRate.neutral;
        // 计算平局比例
        const totalTrades = stats.winRate.winning + stats.winRate.neutral + stats.winRate.losing;
        const neutralPercent = totalTrades > 0 ? (stats.winRate.neutral / totalTrades * 100) : 0;
        neutralEl.style.width = `${neutralPercent}%`;
    }
    
    const lossEl = document.querySelector('#win-rate .loss');
    if (lossEl) {
        lossEl.textContent = stats.winRate.losing;
        // 计算亏损比例
        const totalTrades = stats.winRate.winning + stats.winRate.neutral + stats.winRate.losing;
        const lossPercent = totalTrades > 0 ? (stats.winRate.losing / totalTrades * 100) : 0;
        lossEl.style.width = `${lossPercent}%`;
    }

    const profitFactorEl = document.querySelector('#profit-factor .stat-value');
    if (profitFactorEl) profitFactorEl.textContent = stats.profitFactor.toFixed(2);

    // 修改日胜率统计卡片，使条形图宽度与实际数值成比例
    const dayWinRateEl = document.querySelector('#day-win-rate .stat-value');
    if (dayWinRateEl) dayWinRateEl.textContent = `${stats.dayWinRate.percentage.toFixed(2)}%`;
    
    const dayWinEl = document.querySelector('#day-win-rate .win');
    if (dayWinEl) {
        dayWinEl.textContent = stats.dayWinRate.winning;
        // 计算日胜率比例
        const totalDays = stats.dayWinRate.winning + stats.dayWinRate.neutral + stats.dayWinRate.losing;
        const dayWinPercent = totalDays > 0 ? (stats.dayWinRate.winning / totalDays * 100) : 0;
        dayWinEl.style.width = `${dayWinPercent}%`;
    }
    
    const dayNeutralEl = document.querySelector('#day-win-rate .neutral');
    if (dayNeutralEl) {
        dayNeutralEl.textContent = stats.dayWinRate.neutral;
        // 计算日平局比例
        const totalDays = stats.dayWinRate.winning + stats.dayWinRate.neutral + stats.dayWinRate.losing;
        const dayNeutralPercent = totalDays > 0 ? (stats.dayWinRate.neutral / totalDays * 100) : 0;
        dayNeutralEl.style.width = `${dayNeutralPercent}%`;
    }
    
    const dayLossEl = document.querySelector('#day-win-rate .loss');
    if (dayLossEl) {
        dayLossEl.textContent = stats.dayWinRate.losing;
        // 计算日亏损比例
        const totalDays = stats.dayWinRate.winning + stats.dayWinRate.neutral + stats.dayWinRate.losing;
        const dayLossPercent = totalDays > 0 ? (stats.dayWinRate.losing / totalDays * 100) : 0;
        dayLossEl.style.width = `${dayLossPercent}%`;
    }

    // 修改平均盈亏统计卡片，使条形图宽度与实际数值成比例
    const avgWinLossEl = document.querySelector('#avg-win-loss .stat-value');
    if (avgWinLossEl) avgWinLossEl.textContent = `${stats.avgTrade.avgRate.toFixed(2)}%`;
    
    const avgWinEl = document.querySelector('#avg-win-loss .win');
    if (avgWinEl) {
        avgWinEl.textContent = stats.avgTrade.winning;
        // 计算平均盈利比例
        const totalAvg = parseFloat(stats.avgTrade.winning) + parseFloat(stats.avgTrade.losing);
        const avgWinPercent = totalAvg > 0 ? (parseFloat(stats.avgTrade.winning) / totalAvg * 100) : 0;
        avgWinEl.style.width = `${avgWinPercent}%`;
    }
    
    const avgLossEl = document.querySelector('#avg-win-loss .loss');
    if (avgLossEl) {
        avgLossEl.textContent = stats.avgTrade.losing;
        // 计算平均亏损比例
        const totalAvg = parseFloat(stats.avgTrade.winning) + parseFloat(stats.avgTrade.losing);
        const avgLossPercent = totalAvg > 0 ? (parseFloat(stats.avgTrade.losing) / totalAvg * 100) : 0;
        avgLossEl.style.width = `${avgLossPercent}%`;
    }

    // 更新图表
    updateCharts(stats);
    updateAdvancedCharts(stats);
}

// 销毁已存在的Chart实例
export function destroyCharts() {
    Object.values(chartInstances).forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
}

// 更新基础图表
export function updateCharts(stats) {
    // 在创建新图表前销毁已存在的图表
    destroyCharts();

    // 累计盈亏图表
    const cumulativePnLChart = document.getElementById('cumulativePnLChart');
    if (cumulativePnLChart) {
        chartInstances.cumulativePnL = new Chart(
            cumulativePnLChart.getContext('2d'),
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
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45,
                                autoSkip: true,
                                maxTicksLimit: 10
                            }
                        }
                    }
                }
            }
        );
    }

    // 每日盈亏图表
    const dailyPnLChart = document.getElementById('dailyPnLChart');
    if (dailyPnLChart) {
        chartInstances.dailyPnL = new Chart(
            dailyPnLChart.getContext('2d'),
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
}

// 更新高级图表
export function updateAdvancedCharts(stats) {
    // 添加isMobile变量定义
    const isMobile = window.innerWidth <= 767;
    
    // 通用图表配置
    const commonChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: isMobile ? 'bottom' : 'top',
                labels: {
                    boxWidth: isMobile ? 10 : 40,
                    font: {
                        size: isMobile ? 10 : 12
                    }
                }
            }
        },
        layout: {
            padding: {
                left: 5,
                right: 5,
                top: 10,
                bottom: 10
            }
        }
    };
    
    // 持续时间性能图表
    const durationPerformanceChart = document.getElementById('durationPerformanceChart');
    if (durationPerformanceChart) {
        chartInstances.durationPerformance = new Chart(
            durationPerformanceChart.getContext('2d'),
            {
                type: 'bar',
                data: {
                    labels: stats.durationPerformance.labels,
                    datasets: [
                        {
                            label: 'Average P&L',
                            data: stats.durationPerformance.avgPnL,
                            backgroundColor: stats.durationPerformance.avgPnL.map(val => val >= 0 ? '#2ecc71' : '#e74c3c'),
                            yAxisID: 'y'
                        },
                        {
                            label: 'Win Rate %',
                            data: stats.durationPerformance.winRate,
                            type: 'line',
                            borderColor: '#3498db',
                            backgroundColor: 'rgba(52, 152, 219, 0.1)',
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Average P&L ($)'
                            },
                            ticks: {
                                callback: value => '$' + value.toLocaleString()
                            }
                        },
                        y1: {
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Win Rate (%)'
                            },
                            min: 0,
                            max: 100,
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            }
        );
    }

    // 交易时间性能图表
    const timePerformanceChart = document.getElementById('timePerformanceChart');
    if (timePerformanceChart) {
        chartInstances.timePerformance = new Chart(
            timePerformanceChart.getContext('2d'),
            {
                type: 'bar',
                data: {
                    labels: stats.timePerformance.labels,
                    datasets: [
                        {
                            label: 'Average P&L',
                            data: stats.timePerformance.avgPnL,
                            backgroundColor: stats.timePerformance.avgPnL.map(val => val >= 0 ? '#2ecc71' : '#e74c3c'),
                            yAxisID: 'y'
                        },
                        {
                            label: 'Win Rate %',
                            data: stats.timePerformance.winRate,
                            type: 'line',
                            borderColor: '#3498db',
                            backgroundColor: 'rgba(52, 152, 219, 0.1)',
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Average P&L ($)'
                            },
                            ticks: {
                                callback: value => '$' + value.toLocaleString()
                            }
                        },
                        y1: {
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Win Rate (%)'
                            },
                            min: 0,
                            max: 100,
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            }
        );
    }

    // 回撤图表
    if (stats.drawdown && stats.drawdown.drawdownData.length > 0) {
        const drawdownChart = document.getElementById('drawdownChart');
        if (drawdownChart) {
            chartInstances.drawdown = new Chart(
                drawdownChart.getContext('2d'),
                {
                    type: 'line',
                    data: {
                        labels: stats.drawdown.drawdownData.map(d => d.date),
                        datasets: [
                            {
                                label: 'Drawdown',
                                data: stats.drawdown.drawdownData.map(d => d.drawdown),
                                fill: true,
                                borderColor: '#e74c3c',
                                backgroundColor: 'rgba(231, 76, 60, 0.1)',
                                yAxisID: 'y'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                position: 'left',
                                title: {
                                    display: true,
                                    text: 'Drawdown ($)'
                                },
                                ticks: {
                                    callback: value => value + '$'
                                }
                            }
                        }
                    }
                }
            );
        }
    }

    // Update stock lists
    const formatMoney = (num) => `$${num.toFixed(2)}`;
    
    const topProfitList = document.getElementById('topProfitableStocks');
    topProfitList.innerHTML = stats.stockStats.topProfitable.map(stock => `
        <tr>
            <td class="symbol">${stock.symbol}</td>
            <td class="profit">${formatMoney(stock.totalProfit)}</td>
            <td class="loss">${formatMoney(stock.totalLoss)}</td>
            <td>${stock.tradeCount}</td>
        </tr>
    `).join('');
    
    const topLossList = document.getElementById('topLossStocks');
    topLossList.innerHTML = stats.stockStats.topLosses.map(stock => `
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

    // 股票列表表格响应式调整
    if (isMobile) {
        const stockTables = document.querySelectorAll('.stock-stats-table');
        stockTables.forEach(table => {
            table.style.fontSize = '0.8em';
            table.style.width = '100%';
        });
    }
}
