import { localeControlsHTML, bindLocaleControls, t, messageHTML, setMessage, setAttributeMessage, translatePage, dateHTML, setDateMessage, escapeHTML } from './i18n.js?v=20261002-i18n2';
// calendar.js - 处理日历和交易详情相关功能
import { allTrades, filteredTrades, TOTAL_ACCOUNT_VALUE, formatPnL, calculateDuration } from './data.js?v=20261002-i18n2';
import { getDailyStats, getMonthlyStats, getWeeklyStats } from './stats.js?v=20261002-i18n2';
import { addLogButtonToCalendarDay, displayLogInTradeModal, openLogModal } from './log-ui.js?v=20261002-i18n2';

// 当前日期
export let currentDate = new Date();

// 保存交易弹窗的原始内容，用于详情视图切换后恢复
let originalTradeModalContent = '';

// 渲染日历
let selectedDate = '';

// Render all dates. Weekend hiding is CSS-only and never filters trades or logs.
export function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    setDateMessage(document.getElementById('currentMonth'), `${year}-${String(month + 1).padStart(2, '0')}-01`, { year: 'numeric', month: 'long' });
    const monthlyStats = getMonthlyStats(year, month);
    document.getElementById('monthlyPnL').innerHTML = formatPnL(monthlyStats.pnL);
    setMessage(document.getElementById('tradingDays'), '{count} 个交易日', { count: monthlyStats.days });
    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六', '周汇总'];
    days.forEach((day, index) => {
        const header = document.createElement('div');
        header.className = `calendar-header${index === 0 || index === 6 ? ' weekend' : ''}${index === 7 ? ' week-heading' : ''}`;
        setMessage(header, day);
        calendar.appendChild(header);
    });
    const gridStart = new Date(firstDay);
    gridStart.setUTCDate(1 - firstDay.getUTCDay());
    const gridEnd = new Date(lastDay);
    gridEnd.setUTCDate(lastDay.getUTCDate() + 6 - lastDay.getUTCDay());
    let weekPnL = 0;
    let weekDays = 0;
    const monthDates = [];
    for (let date = new Date(gridStart); date <= gridEnd; date.setUTCDate(date.getUTCDate() + 1)) {
        const weekday = date.getUTCDay();
        const inMonth = date.getUTCMonth() === month;
        const dayDiv = document.createElement('div');
        dayDiv.className = `${inMonth ? 'calendar-day' : 'calendar-empty'}${weekday === 0 || weekday === 6 ? ' weekend' : ''}`;
        if (inMonth) {
            const dateStr = date.toISOString().slice(0, 10);
            monthDates.push(dateStr);
            dayDiv.dataset.date = dateStr;
            const stats = getDailyStats(date);
            dayDiv.innerHTML = `<span class="day-number">${date.getUTCDate()}</span>`;
            if (stats) {
                dayDiv.classList.add(stats.pnl >= 0 ? 'trading-day' : 'negative');
                dayDiv.insertAdjacentHTML('beforeend', `<div class="trade-info">${formatPnL(stats.pnl)}<span class="trade-count-label">${messageHTML('{count} 个代码', { count: stats.trades })}</span><span class="day-secondary">${messageHTML('{roi}% 基准收益 · {winRate}% 胜率', { roi: stats.pnlPercentage.toFixed(1), winRate: stats.winRate.toFixed(0) })}</span></div>`);
                weekPnL += stats.pnl;
                weekDays++;
            }
            dayDiv.tabIndex = 0;
            dayDiv.setAttribute('role', 'button');
            setAttributeMessage(dayDiv, 'aria-label', stats ? '{date}，已实现盈亏 {pnl}，查看当日快览' : '{date}，无平仓交易，查看当日快览', { date: dateStr, pnl: stats?.pnl.toFixed(2) });
            const select = () => selectCalendarDay(dateStr);
            dayDiv.addEventListener('click', select);
            dayDiv.addEventListener('keydown', event => {
                if (event.target === dayDiv && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(); }
            });
            addLogButtonToCalendarDay(dayDiv, new Date(date));
        } else {
            dayDiv.setAttribute('aria-hidden', 'true');
        }
        calendar.appendChild(dayDiv);
        if (weekday === 6) {
            const summary = document.createElement('div');
            summary.className = 'week-summary';
            summary.innerHTML = `<span class="week-label">${messageHTML("本周")}</span>${formatPnL(weekPnL)}<small>${messageHTML('{count} 个交易日', { count: weekDays })}</small>`;
            calendar.appendChild(summary);
            weekPnL = 0;
            weekDays = 0;
        }
    }
    if (!monthDates.includes(selectedDate)) {
        const traded = monthDates.filter(date => getDailyStats(new Date(`${date}T00:00:00Z`)));
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        selectedDate = monthDates.includes(today) ? today : traded.at(-1) || monthDates[0];
    }
    selectCalendarDay(selectedDate);
}

export function selectCalendarDay(dateStr) {
    selectedDate = dateStr;
    document.querySelectorAll('.calendar-day').forEach(day => {
        const selected = day.dataset.date === dateStr;
        day.classList.toggle('selected', selected);
        day.setAttribute('aria-pressed', String(selected));
    });
    const preview = document.getElementById('dayPreview');
    if (!preview) return;
    const date = new Date(`${dateStr}T00:00:00Z`);
    const stats = getDailyStats(date);
    const trades = allTrades.filter(trade => trade.TradeDate === dateStr && trade['Open/CloseIndicator'] === 'C');
    preview.innerHTML = `<div class="preview-date">${dateHTML(dateStr, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</div><h2>${messageHTML("当日快览")}</h2><div class="preview-pnl">${formatPnL(stats?.pnl || 0)}</div><div class="preview-summary"><span>${messageHTML('{count} 条平仓记录', { count: trades.length })}</span><span>${messageHTML('{count} 个代码', { count: stats?.trades || 0 })}</span></div><div class="preview-trades"></div><button class="preview-details">${messageHTML("查看全部交易")}</button><div class="preview-journal"><h3>${messageHTML("给这一天留一点思考")}</h3><p>${messageHTML("记录事实、收获和下一次可以做得更好的地方。")}</p><button class="primary preview-log">${messageHTML("写每日复盘")}</button><button class="preview-weekly">${messageHTML("写每周复盘")}</button></div>`;
    const list = preview.querySelector('.preview-trades');
    if (!stats) {
        const empty = document.createElement('p');
        empty.className = 'empty-state'; setMessage(empty, "这一天没有已导入的平仓交易。也可以记录观察与复盘。"); list.append(empty);
    } else {
        stats.symbols.slice(0, 5).forEach(([symbol, trade]) => {
            const row = document.createElement('div'); row.className = 'preview-trade';
            const name = document.createElement('span'); name.textContent = symbol;
            const value = document.createElement('span'); value.innerHTML = formatPnL(trade.pnl);
            row.append(name, value); list.append(row);
        });
    }
    preview.querySelector('.preview-details').addEventListener('click', () => showTradeDetails(date));
    preview.querySelector('.preview-log').addEventListener('click', () => openLogModal(dateStr, 'daily'));
    preview.querySelector('.preview-weekly').addEventListener('click', () => openLogModal(dateStr, 'weekly'));
}

// Normalize day before changing the month so Jan 31 → February, not March.
export function navigateMonth(direction) {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1);
    renderCalendar();
}

// 显示交易详情
export function showTradeDetails(date) {
    const modal = document.getElementById('tradeModal');
    const modalContent = modal ? modal.querySelector('.trade-modal-content') : null;
    const dateStr = date.toISOString().split('T')[0];

    // 首次调用时记录原始内容，方便详情视图关闭后恢复
    if (modalContent && !originalTradeModalContent) {
        originalTradeModalContent = modalContent.innerHTML;
    }

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
    const dateEl = document.getElementById('modalDate');
    setDateMessage(dateEl, dateStr, { year: 'numeric', month: 'short', day: 'numeric' });
    dateEl.dataset.date = dateStr;

    // 计算统计数据
    const consolidatedArray = Array.from(consolidatedTrades.values());
    const totalPnL = consolidatedArray.reduce((sum, trade) => sum + trade.FifoPnlRealized, 0);
    const winners = consolidatedArray.filter(trade => trade.FifoPnlRealized > 0).length;
    const winrate = consolidatedArray.length ? (winners / consolidatedArray.length * 100).toFixed(2) : '0.00';
    const totalVolume = consolidatedArray.reduce((sum, trade) => sum + trade.Quantity, 0);
    const totalProfits = consolidatedArray.reduce((sum, t) => t.FifoPnlRealized > 0 ? sum + t.FifoPnlRealized : sum, 0);
    const totalLosses = consolidatedArray.reduce((sum, t) => t.FifoPnlRealized < 0 ? sum + Math.abs(t.FifoPnlRealized) : sum, 0);
    const profitFactor = totalLosses === 0 ? totalProfits : totalProfits / totalLosses;

    // 更新统计信息显示
    const netPnLEl = document.getElementById('modalNetPnL');
    if (netPnLEl) {
        netPnLEl.classList.remove('profit', 'fail');
        netPnLEl.classList.add(totalPnL >= 0 ? 'profit' : 'fail');
        const prefix = totalPnL >= 0 ? '+' : '';
        setMessage(netPnLEl, '净盈亏 {value}', { value: `${prefix}$${totalPnL.toFixed(2)}` });
    }
    document.getElementById('modalTotalTrades').textContent = consolidatedArray.length;
    document.getElementById('modalWinners').textContent = winners;
    document.getElementById('modalLosers').textContent = consolidatedArray.length - winners;
    document.getElementById('modalWinrate').textContent = `${winrate}%`;
    document.getElementById('modalVolume').textContent = totalVolume;
    document.getElementById('modalProfitFactor').textContent = profitFactor.toFixed(2);

    // 填充交易表格
    const tableBody = document.getElementById('tradesTableBody');
    tableBody.innerHTML = '';

    consolidatedArray.forEach(trade => {
        const row = document.createElement('tr');
        const pnl = trade.FifoPnlRealized;
        const roi = ((pnl / TOTAL_ACCOUNT_VALUE) * 100).toFixed(2);

        row.innerHTML = `
            <td>${trade.DateTime}</td>
            <td>${escapeHTML(trade.Symbol)}</td>
            <td>${messageHTML(trade.Side)}</td>
            <td>${escapeHTML(trade.Symbol)}</td>
            <td class="${pnl >= 0 ? 'profit' : 'fail'}">${formatPnL(pnl)}</td>
            <td class="${pnl >= 0 ? 'profit' : 'fail'}">${roi}%</td>
            <td>${trade.TradeTimes}</td>
            <td>--</td>
        `;

        tableBody.appendChild(row);
    });

    // 在交易详情中渲染日志内容
    displayLogInTradeModal(date);

    // 设置前后交易日导航
    const tradeDates = Array.from(new Set(allTrades
        .filter(t => t['Open/CloseIndicator'] === 'C')
        .map(t => t.TradeDate)
    )).sort();
    const currentIndex = tradeDates.indexOf(dateStr);
    const prevBtn = document.getElementById('prevTradeDay');
    const nextBtn = document.getElementById('nextTradeDay');
    if (prevBtn) {
        prevBtn.style.display = currentIndex > 0 ? 'inline-block' : 'none';
        prevBtn.onclick = () => {
            if (currentIndex > 0) {
                showTradeDetails(new Date(tradeDates[currentIndex - 1]));
            }
        };
    }
    if (nextBtn) {
        nextBtn.style.display = currentIndex < tradeDates.length - 1 ? 'inline-block' : 'none';
        nextBtn.onclick = () => {
            if (currentIndex < tradeDates.length - 1) {
                showTradeDetails(new Date(tradeDates[currentIndex + 1]));
            }
        };
    }

    if (modal) {
        modal.style.display = 'block';

        // 确保按钮事件绑定（每次打开都重新绑定以避免丢失）
        const viewBtn = document.getElementById('viewDetailsBtn');
        if (viewBtn) viewBtn.onclick = viewTradeDetails;
        const closeBtn = document.getElementById('closeTradeModalBtn');
        if (closeBtn) closeBtn.onclick = closeTradeModal;

        // 添加点击外部关闭功能（使用onclick避免重复绑定）
        modal.onclick = (e) => {
            if (e.target === modal) {
                closeTradeModal();
            }
        };
    }
}

// 关闭交易详情弹窗
export function closeTradeModal() {
    const modal = document.getElementById('tradeModal');
    if (modal) {
        // 如果详情视图替换了内容，先恢复原始结构
        const modalContent = modal.querySelector('.trade-modal-content');
        if (modalContent && originalTradeModalContent) {
            modalContent.innerHTML = originalTradeModalContent;
            translatePage(modalContent);
            bindLocaleControls(modalContent);
        }

        modal.style.display = 'none';

        // 清空数据但保留结构，避免破坏已加载的内容
        const dateEl = document.getElementById('modalDate');
        if (dateEl) dateEl.textContent = '';
        const netEl = document.getElementById('modalNetPnL');
        if (netEl) {
            netEl.textContent = '';
            netEl.classList.remove('profit', 'fail');
        }
        const totalEl = document.getElementById('modalTotalTrades');
        if (totalEl) totalEl.textContent = '';
        const winEl = document.getElementById('modalWinners');
        if (winEl) winEl.textContent = '';
        const loseEl = document.getElementById('modalLosers');
        if (loseEl) loseEl.textContent = '';
        const winrateEl = document.getElementById('modalWinrate');
        if (winrateEl) winrateEl.textContent = '';
        const volumeEl = document.getElementById('modalVolume');
        if (volumeEl) volumeEl.textContent = '';
        const pfEl = document.getElementById('modalProfitFactor');
        if (pfEl) pfEl.textContent = '';

        const tableBody = document.getElementById('tradesTableBody');
        if (tableBody) {
            tableBody.innerHTML = '';
        }

        // 移除日志部分（如果存在）
        const logSection = modal.querySelector('.log-section');
        if (logSection) {
            logSection.remove();
        }
    }
}

// 查看详细交易信息
export function viewTradeDetails() {
    const dateEl = document.getElementById('modalDate');
    const modalContent = document.querySelector('.trade-modal-content');
    if (!dateEl || !modalContent) return;

    const displayDate = dateEl.textContent || '';
    let isoDate = dateEl.dataset.date || '';

    if (!isoDate && displayDate) {
        const parsedDate = new Date(displayDate);
        if (!isNaN(parsedDate)) {
            isoDate = parsedDate.toISOString().split('T')[0];
        }
    }

    if (!isoDate) return;
    
    // 获取选定日期的详细交易
    const detailedTrades = allTrades.filter(trade => 
        trade.TradeDate === isoDate &&
        trade['Open/CloseIndicator'] === 'C'
    ).sort((a, b) => {
        const timeA = new Date(a.DateTime).getTime();
        const timeB = new Date(b.DateTime).getTime();
        return timeA - timeB;
    });

    // 创建详细视图
    const detailedView = `
        <div class="modal-language">${localeControlsHTML()}</div>
        <div class="modal-header">
            <h2>${dateHTML(isoDate, { year: 'numeric', month: 'short', day: 'numeric' })} · ${messageHTML('详细交易')}</h2>
            <button class="close-button" id="closeDetailModalBtn" aria-label="${t('关闭')}" data-i18n-aria-label="关闭">&times;</button>
        </div>
        <div class="trades-details">
            <table class="trades-table">
                <thead>
                    <tr>
                        <th>${messageHTML("Time")}</th>
                        <th>${messageHTML("Symbol")}</th>
                        <th>${messageHTML("Side")}</th>
                        <th>${messageHTML("Qty")}</th>
                        <th>${messageHTML("Entry")}</th>
                        <th>${messageHTML("Exit")}</th>
                        <th>${messageHTML("Duration")}</th>
                        <th>${messageHTML("P&L")}</th>
                        <th>${messageHTML("ROI%")}</th>
                    </tr>
                </thead>
                <tbody>
                    ${detailedTrades.map(trade => {
                        const pnl = parseFloat(trade.FifoPnlRealized);
                        const roi = ((pnl / TOTAL_ACCOUNT_VALUE) * 100).toFixed(2);
                        const duration = calculateDuration(trade.OpenDateTime, trade.DateTime);
                        return `
                            <tr>
                                <td>${dateHTML(trade.DateTime, { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}</td>
                                <td class="symbol">${escapeHTML(trade.Symbol)}</td>
                                <td>${messageHTML(String(trade['Buy/Sell']).toUpperCase())}</td>
                                <td>${Math.abs(trade.Quantity)}</td>
                                <td>${trade.TradePrice}</td>
                                <td>${trade.ClosePrice}</td>
                                <td>${durationHTML(duration)}</td>
                                <td class="${pnl >= 0 ? 'profit' : 'fail'}">${formatPnL(pnl)}</td>
                                <td class="${pnl >= 0 ? 'profit' : 'fail'}">${roi}%</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <div class="button-group">
            <button class="cancel-button" id="closeDetailBtn">${messageHTML("Close")}</button>
        </div>
    `;

    modalContent.innerHTML = detailedView;
    bindLocaleControls(modalContent);
    
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
function durationHTML(value) {
    const match = /^(?:(\d+)h )?(\d+)m$/.exec(value);
    if (!match) return escapeHTML(value);
    return messageHTML(match[1] ? '{hours}小时 {minutes}分钟' : '{minutes}分钟', { hours: match[1], minutes: match[2] });
}
