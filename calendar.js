// calendar.js - 处理日历和交易详情相关功能
import { allTrades, filteredTrades, TOTAL_ACCOUNT_VALUE, formatPnL, calculateDuration } from './data.js';
import { getDailyStats, getMonthlyStats, getWeeklyStats } from './stats.js';

// 当前日期
export let currentDate = new Date();

// 渲染日历
export function renderCalendar() {
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

    // 检测是否为移动设备
    const isMobile = window.innerWidth <= 767;
    
    // 添加表头 - 移动设备时不显示周日和Weekly
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Weekly'];
    days.forEach((day, index) => {
        // 在移动设备上跳过周六日和Weekly列
        if (isMobile && (index === 0 || index === 6 || index === 7)) return;
        
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = day;
        calendar.appendChild(header);
    });

    // 添加日期
    let currentWeekPnL = 0;
    let currentWeekDays = 0;
    let weekStartDate = new Date(firstDay);

    // 填充月初空白
    let i = isMobile?1:0;
    for (i; i < firstDay.getDay(); i++) {
        calendar.appendChild(document.createElement('div'));
    }

    // 填充日期
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(Date.UTC(year, month, day));
        const dayOfWeek = date.getDay();
        
        // 在移动设备上跳过周六日
        if (isMobile && (dayOfWeek === 0 || dayOfWeek === 6)) continue;
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.setAttribute('data-date', date.toISOString().split('T')[0]);

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
            dayDiv.addEventListener('click', () => showTradeDetails(date));
            
            currentWeekPnL += stats.pnl;
            currentWeekDays++;
        } else {
            dayDiv.textContent = day;
        }

        calendar.appendChild(dayDiv);

        // 处理周末或月末
        if ((!isMobile) && (date.getDay() === 6 || day === lastDay.getDate())) {
            const weekSummary = document.createElement('div');
            weekSummary.className = 'week-summary';
            
            if (currentWeekDays > 0) {
                // 添加正负数的CSS类
                const pnlClass = currentWeekPnL >= 0 ? 'positive' : 'negative';
                weekSummary.innerHTML = `
                    <div class="${pnlClass}">${formatPnL(currentWeekPnL)}</div>
                    <div>${currentWeekDays} days</div>
                `;
            }
            
            // 如果是月末，填充到周六的空白单元格
            if (day === lastDay.getDate()) {
                const lastDayOfWeek = date.getDay();
                // 如果不是周六(6)，则需要填充
                if (lastDayOfWeek < 6) {
                    // 计算需要填充的天数（从当前日期到周六）
                    const fillCount = 6 - lastDayOfWeek;
                    // 填充空白单元格
                    for (let i = 0; i < fillCount; i++) {
                        const emptyDiv = document.createElement('div');
                        calendar.appendChild(emptyDiv);
                    }
                }
            }
            calendar.appendChild(weekSummary);
            
            // 重置周数据
            currentWeekPnL = 0;
            currentWeekDays = 0;
            weekStartDate = new Date(date);
            weekStartDate.setDate(date.getDate() + 1);
        }
    }
    
}

// 月份导航
export function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

// 显示交易详情
export function showTradeDetails(date) {
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
    document.getElementById('modalNetPnL').innerHTML = `Net P&L ${formatPnL(totalPnL)}`;
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

    // 添加点击外部关闭功能
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeTradeModal();
        }
    });
}

// 关闭交易详情弹窗
export function closeTradeModal() {
    const modal = document.getElementById('tradeModal');
    if (modal) {
        modal.style.display = 'none';
        // 重置但不移除模态框内容
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
            
            // 重新绑定按钮事件监听器
            const viewDetailsBtn = document.getElementById('viewDetailsBtn');
            if (viewDetailsBtn) {
                viewDetailsBtn.addEventListener('click', viewTradeDetails);
            }
            
            const closeTradeModalBtn = document.getElementById('closeTradeModalBtn');
            if (closeTradeModalBtn) {
                closeTradeModalBtn.addEventListener('click', closeTradeModal);
            }
        }
    }
}

// 查看详细交易信息
export function viewTradeDetails() {
    const dateStr = document.getElementById('modalDate').textContent;
    const localDate = new Date(dateStr);
    const date = new Date(Date.UTC(
        localDate.getFullYear(),
        localDate.getMonth(),
        localDate.getDate()
    ));
    const today = date.toISOString().split('T')[0]
    const modalContent = document.querySelector('.trade-modal-content');
    
    // 获取选定日期的详细交易
    const detailedTrades = allTrades.filter(trade => 
        trade.TradeDate === today &&
        trade['Open/CloseIndicator'] === 'C'
    ).sort((a, b) => {
        const timeA = new Date(a.DateTime).getTime();
        const timeB = new Date(b.DateTime).getTime();
        return timeA - timeB;
    });

    // 创建详细视图
    const detailedView = `
        <div class="modal-header">
            <h2>${dateStr} - Detailed Trades</h2>
            <button class="close-button" id="closeDetailModalBtn">&times;</button>
        </div>
        <div class="trades-details">
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Symbol</th>
                        <th>Side</th>
                        <th>Qty</th>
                        <th>Entry</th>
                        <th>Exit</th>
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
                                <td>${new Date(trade.DateTime).toLocaleTimeString()}</td>
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
            <button class="cancel-button" id="closeDetailBtn">Close</button>
        </div>
    `;

    modalContent.innerHTML = detailedView;
    
    // 添加关闭按钮事件监听
    document.getElementById('closeDetailModalBtn').addEventListener('click', closeTradeModal);
    document.getElementById('closeDetailBtn').addEventListener('click', closeTradeModal);
}

// 显示日期选择器
// 切换日期选择器显示/隐藏
export function toggleDatePicker() {
    const datePicker = document.getElementById('dateRangePicker');
    datePicker.classList.toggle('active');
    
    // 添加点击外部关闭功能
    if (datePicker.classList.contains('active')) {
        // 使用setTimeout确保当前点击事件不会立即触发关闭
        setTimeout(() => {
            const closeOnClickOutside = (e) => {
                if (!datePicker.contains(e.target) && e.target.id !== 'showDateRangeBtn') {
                    datePicker.classList.remove('active');
                    document.removeEventListener('click', closeOnClickOutside);
                }
            };
            document.addEventListener('click', closeOnClickOutside);
        }, 0);
    }
}

// 更新日历中的交易数据
export function updateCalendarWithTrades() {
    allTrades.forEach(trade => {
        // 根据交易数据更新日历显示
        if (trade.TradeDate) {
            const dayElement = document.querySelector(`[data-date="${trade.TradeDate}"]`);
            if (dayElement) {
                // 更新日历单元格的数据
                updateDayCell(dayElement, trade);
            }
        }
    });
    
    // 重新渲染日历
    renderCalendar();
}

// 更新日历单元格
function updateDayCell(cell, trade) {
    // 这里可以根据交易数据更新单元格的显示
    // 例如添加交易信息、更改背景色等
    const date = cell.getAttribute('data-date');
    const stats = getDailyStats(new Date(date));
    
    if (stats) {
        cell.className = 'calendar-day' + (stats.pnl >= 0 ? ' trading-day' : ' negative');
        cell.innerHTML = `
            ${new Date(date).getDate()}
            <div class="trade-info">
                ${formatPnL(stats.pnl)}<br>
                ${stats.trades} symbols<br>
                ${stats.pnlPercentage.toFixed(1)}%<br>
                ${stats.winRate.toFixed(1)}% WR
            </div>
        `;
    }
}