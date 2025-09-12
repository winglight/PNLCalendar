// log-ui.js - 日志UI交互处理
import { 
    createOrUpdateLog, 
    getLogByDate, 
    getAllLogs, 
    deleteLog, 
    getLogPreviewText,
    LOG_TEMPLATE
} from './logs.js';
import { allTrades } from './data.js';
import { getDailyStats } from './stats.js';

// 日志UI状态
let currentEditingLog = null;
let logListPage = 0;
const LOGS_PER_PAGE = 20;

// 初始化日志UI事件
export function initLogUI() {
    // 日志按钮事件
    const showLogSidebarBtn = document.getElementById('showLogSidebarBtn');
    if (showLogSidebarBtn) {
        showLogSidebarBtn.addEventListener('click', openLogSidebar);
    }

    // 关闭侧边栏按钮
    const closeLogSidebarBtn = document.getElementById('closeLogSidebar');
    if (closeLogSidebarBtn) {
        closeLogSidebarBtn.addEventListener('click', closeLogSidebar);
    }

    // 日志模态框关闭按钮
    const closeLogModalBtn = document.getElementById('closeLogModal');
    if (closeLogModalBtn) {
        closeLogModalBtn.addEventListener('click', closeLogModal);
    }

    // 日志表单提交
    const logForm = document.getElementById('logForm');
    if (logForm) {
        logForm.addEventListener('submit', handleLogFormSubmit);
    }

    // 删除日志按钮
    const deleteLogBtn = document.getElementById('deleteLogBtn');
    if (deleteLogBtn) {
        deleteLogBtn.addEventListener('click', handleDeleteLog);
    }

    // 侧边栏滚动加载
    const logSidebarList = document.getElementById('logSidebarList');
    if (logSidebarList) {
        logSidebarList.addEventListener('scroll', handleLogListScroll);
    }

    // 点击模态框外部关闭
    const logModal = document.getElementById('logModal');
    if (logModal) {
        logModal.addEventListener('click', (e) => {
            if (e.target === logModal) {
                closeLogModal();
            }
        });
    }

    // 日志类型/日期变化时自动切换与计算
    const typeSel = document.getElementById('logType');
    const dateInput = document.getElementById('logDate');
    if (typeSel && dateInput) {
        const recalc = () => {
            const date = dateInput.value;
            const type = typeSel.value;
            if (!date) return;
            // 自动填充对应类型数据
            autoFillTradeInfo(date, type);
            // 互斥显示：weekly 显示周区块，daily 显示日区块
            toggleWeeklyFields(type === 'weekly');
            toggleDailyFields(type === 'daily');
        };
        typeSel.addEventListener('change', recalc);
        dateInput.addEventListener('change', recalc);
    }
}

// 打开日志录入模态框
export function openLogModal(date, logType = null) {
    const modal = document.getElementById('logModal');
    const form = document.getElementById('logForm');
    
    if (!modal || !form) return;
    
    // 自动判断日志类型（如果未指定）
    if (!logType) {
        const dateObj = new Date(date);
        const dayOfWeek = dateObj.getDay(); // 0=周日, 1=周一, ..., 6=周六
        // 判断：周六为每周复盘，其他为每日复盘
        logType = (dayOfWeek === 6) ? 'weekly' : 'daily';
    }
    
    // 确保日期格式正确（YYYY-MM-DD）
    let formattedDate = date;
    if (typeof date === 'string' && date.length === 10) {
        formattedDate = date; // 已经是 YYYY-MM-DD 格式
    } else if (date instanceof Date) {
        formattedDate = date.toISOString().split('T')[0];
    } else {
        // 尝试解析字符串为日期
        const tempDate = new Date(date);
        if (!isNaN(tempDate.getTime())) {
            formattedDate = tempDate.toISOString().split('T')[0];
        }
    }
    
    // 设置日期和类型
    document.getElementById('logDate').value = formattedDate;
    document.getElementById('logType').value = logType;
    
    // 检查是否已有日志
    const existingLog = getLogByDate(formattedDate, logType);
    
    if (existingLog) {
        // 编辑现有日志
        currentEditingLog = existingLog;
        populateLogForm(existingLog);
        document.getElementById('deleteLogBtn').classList.remove('hidden');
        document.getElementById('logModalTitle').textContent = '编辑复盘日志';
    } else {
        // 创建新日志
        currentEditingLog = null;
        resetLogForm();
        
        // 重新设置日期和类型（重置可能清空了）
        document.getElementById('logDate').value = formattedDate;
        document.getElementById('logType').value = logType;
        
        // 自动填充交易信息
        autoFillTradeInfo(formattedDate, logType);
        
            // 根据类型显示相应区域
            if (logType === 'weekly') {
                const weeklyData = computeWeeklyAutoStats(formattedDate);
                populateWeeklyAutoFields(weeklyData);
                toggleWeeklyFields(true);
                toggleDailyFields(false);
            } else {
                toggleWeeklyFields(false);
                toggleDailyFields(true);
            }
        
        document.getElementById('deleteLogBtn').classList.add('hidden');
        document.getElementById('logModalTitle').textContent = '新增复盘日志';
    }
    
    modal.classList.remove('hidden');
}

// 自动填充交易信息
function autoFillTradeInfo(date, logType) {
    if (logType === 'daily') {
        // 每日复盘：计算当日交易
        const dayTrades = allTrades.filter(trade => {
            const tradeDate = new Date(trade.TradeDate).toISOString().split('T')[0];
            return tradeDate === date;
        });

        // 填充交易次数
        document.getElementById('tradeCount').value = dayTrades.length;

        // 填充关联交易ID
        const tradeIds = dayTrades.map(trade => trade.TransactionID).filter(id => id);
        document.getElementById('linkedTrades').value = tradeIds.join(',');

        toggleWeeklyFields(false);
        toggleDailyFields(true);
    } else if (logType === 'weekly') {
        // 计算本周范围（周一~周五）
        const { weekStartStr, weekEndStr } = getWeekRange(date);

        // 筛选本周的交易
        const weekTrades = allTrades.filter(trade => {
            const tradeDateStr = (new Date(trade.TradeDate)).toISOString().split('T')[0];
            return tradeDateStr >= weekStartStr && tradeDateStr <= weekEndStr;
        });

        // 填充交易次数
        document.getElementById('tradeCount').value = weekTrades.length;

        // 填充关联交易ID
        const tradeIds = weekTrades.map(trade => trade.TransactionID).filter(id => id);
        document.getElementById('linkedTrades').value = tradeIds.join(',');

        // 计算并填充每周自动统计
        const weeklyData = computeWeeklyAutoStats(date);
        populateWeeklyAutoFields(weeklyData);
        toggleWeeklyFields(true);
        toggleDailyFields(false);
    }
}

// 计算给定日期所在周(周一~周五)的范围
function getWeekRange(dateStr) {
    const selectedDate = new Date(dateStr);
    const day = selectedDate.getDay(); // 0(日)~6(六)
    const offsetToMonday = (day + 6) % 7; // 将周日映射为6，周一为0
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - offsetToMonday);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const weekStartStr = monday.toISOString().split('T')[0];
    const weekEndStr = friday.toISOString().split('T')[0];
    return { monday, friday, weekStartStr, weekEndStr };
}

// 计算每周自动统计数据
function computeWeeklyAutoStats(dateStr) {
    const { weekStartStr, weekEndStr } = getWeekRange(dateStr);
    const weekTrades = allTrades.filter(trade => {
        const tradeDateStr = (new Date(trade.TradeDate)).toISOString().split('T')[0];
        return tradeDateStr >= weekStartStr && tradeDateStr <= weekEndStr;
    });

    // 仅对已关闭交易用于盈亏统计
    const closedTrades = weekTrades.filter(t => t['Open/CloseIndicator'] === 'C');

    // 使用唯一的TransactionID统计交易笔数
    const uniqueIds = new Set(closedTrades.map(t => t.TransactionID).filter(Boolean));
    const totalTrades = uniqueIds.size || closedTrades.length;

    const pnls = closedTrades.map(t => parseFloat(t.FifoPnlRealized) || 0);
    const pnlResult = pnls.reduce((a, b) => a + b, 0);
    const maxWin = pnls.length ? Math.max(0, ...pnls) : 0;
    const maxLoss = pnls.length ? Math.min(0, ...pnls) : 0; // 负数或0

    const winners = closedTrades.filter(t => parseFloat(t.FifoPnlRealized) > 0).length;
    const winRate = (closedTrades.length > 0) ? (winners / closedTrades.length) * 100 : 0;

    // 是否遵守“每日最多3笔交易”：对每个交易日统计唯一TransactionID数量
    const perDayCounts = new Map();
    closedTrades.forEach(t => {
        const d = (new Date(t.TradeDate)).toISOString().split('T')[0];
        const key = d;
        const set = perDayCounts.get(key) || new Set();
        if (t.TransactionID) set.add(t.TransactionID);
        else set.add(`${t.Symbol}-${t.DateTime || ''}-${t.Quantity || ''}`);
        perDayCounts.set(key, set);
    });
    let followsDailyLimit = true;
    perDayCounts.forEach(set => {
        if (set.size > 3) followsDailyLimit = false;
    });

    return { totalTrades, pnlResult, maxWin, maxLoss, winRate, followsDailyLimit };
}

// 将周自动数据填充到只读字段
function populateWeeklyAutoFields(weeklyData) {
    if (!weeklyData) return;
    const { totalTrades, pnlResult, maxWin, maxLoss, winRate, followsDailyLimit } = weeklyData;
    const weeklyTotalTrades = document.getElementById('weeklyTotalTrades');
    const weeklyPnlResult = document.getElementById('weeklyPnlResult');
    const weeklyMaxWinLoss = document.getElementById('weeklyMaxWinLoss');
    const weeklyWinRate = document.getElementById('weeklyWinRate');
    const weeklyDailyLimit = document.getElementById('weeklyDailyLimit');

    if (weeklyTotalTrades) weeklyTotalTrades.value = totalTrades;
    if (weeklyPnlResult) weeklyPnlResult.value = `${pnlResult >= 0 ? '+' : ''}$${pnlResult.toFixed(2)}`;
    if (weeklyMaxWinLoss) weeklyMaxWinLoss.value = `$${Math.max(0, maxWin).toFixed(2)} / $${Math.abs(Math.min(0, maxLoss)).toFixed(2)}`;
    if (weeklyWinRate) weeklyWinRate.value = `${winRate.toFixed(1)}%`;
    if (weeklyDailyLimit) weeklyDailyLimit.value = followsDailyLimit ? '是' : '否';
}

function toggleWeeklyFields(show) {
    const weeklyFields = document.getElementById('weeklyFields');
    if (!weeklyFields) return;
    if (show) weeklyFields.classList.remove('hidden');
    else weeklyFields.classList.add('hidden');
}

function toggleDailyFields(show) {
    const dailyFields = document.getElementById('dailyFields');
    if (!dailyFields) return;
    if (show) dailyFields.classList.remove('hidden');
    else dailyFields.classList.add('hidden');
}

// 关闭日志模态框
export function closeLogModal() {
    const modal = document.getElementById('logModal');
    if (modal) {
        modal.classList.add('hidden');
        currentEditingLog = null;
    }
}

// 填充日志表单
function populateLogForm(log) {
    document.getElementById('logDate').value = log.date;
    document.getElementById('logType').value = log.type;
    document.getElementById('tradeCount').value = log.quickReview?.tradesCount || '';
    document.getElementById('feelScore').value = log.quickReview?.overallFeeling || '';
    document.getElementById('facts').value = log.factRecord || '';
    document.getElementById('learnings').value = log.learningPoints || '';
    document.getElementById('improvements').value = log.improvementDirection || '';
    document.getElementById('affirmations').value = log.selfAffirmation || '';
    document.getElementById('linkedTrades').value = log.associatedTrades?.join(',') || '';

    if (log.type === 'weekly') {
        // 周自动字段
        populateWeeklyAutoFields(log.weeklyData || null);
        // 文本/多选字段
        document.getElementById('plannedTrades').value = log.successExperiences?.plannedTrades || '';
        document.getElementById('emotionalStability').value = log.successExperiences?.emotionalStability || '';

        const violatedPlansEl = document.getElementById('violatedPlans');
        const emotionalFactorsEl = document.getElementById('emotionalFactors');
        if (violatedPlansEl) {
            Array.from(violatedPlansEl.options).forEach(opt => {
                opt.selected = (log.mistakeSummary?.violatedPlans || []).includes(opt.value);
            });
        }
        if (emotionalFactorsEl) {
            Array.from(emotionalFactorsEl.options).forEach(opt => {
                opt.selected = (log.mistakeSummary?.emotionalFactors || []).includes(opt.value);
            });
        }

        document.getElementById('goodHabitToKeep').value = log.nextWeekOptimization?.goodHabitToKeep || '';
        document.getElementById('mistakeToAvoid').value = log.nextWeekOptimization?.mistakeToAvoid || '';
        document.getElementById('specificActions').value = log.nextWeekOptimization?.specificActions || '';
        document.getElementById('weeklyAffirmation').value = log.weeklyAffirmation || '';
        toggleWeeklyFields(true);
        toggleDailyFields(false);
    } else {
        toggleWeeklyFields(false);
        toggleDailyFields(true);
    }
}

// 重置日志表单
function resetLogForm() {
    const form = document.getElementById('logForm');
    if (form) {
        form.reset();
        // 设置默认值
        document.getElementById('feelScore').value = '3';
    }
    toggleWeeklyFields(false);
    toggleDailyFields(true);
}

// 处理日志表单提交
function handleLogFormSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const type = formData.get('type');
    const date = formData.get('date');

    // 若为weekly，刷新一次自动字段，确保保存时为最新
    let weeklyAuto = null;
    if (type === 'weekly') {
        weeklyAuto = computeWeeklyAutoStats(date);
        populateWeeklyAutoFields(weeklyAuto);
    }

    const logData = {
        id: currentEditingLog?.id,
        date: date,
        type: type,
        quickReview: {
            tradesCount: parseInt(formData.get('quickReview.count')) || 0,
            overallFeeling: parseInt(formData.get('quickReview.feel')) || 3
        },
        factRecord: formData.get('facts'),
        learningPoints: formData.get('learnings'),
        improvementDirection: formData.get('improvements'),
        selfAffirmation: formData.get('affirmations'),
        associatedTrades: formData.get('linkedTradeIds')?.split(',').map(id => id.trim()).filter(id => id) || []
    };

    if (type === 'weekly') {
        logData.weeklyData = weeklyAuto || {
            totalTrades: parseInt(document.getElementById('weeklyTotalTrades').value) || 0,
            pnlResult: 0,
            maxWin: 0,
            maxLoss: 0,
            winRate: 0,
            followsDailyLimit: true
        };
        logData.successExperiences = {
            plannedTrades: document.getElementById('plannedTrades').value || '',
            emotionalStability: document.getElementById('emotionalStability').value || ''
        };
        const violatedPlansSel = document.getElementById('violatedPlans');
        const emotionalFactorsSel = document.getElementById('emotionalFactors');
        logData.mistakeSummary = {
            violatedPlans: violatedPlansSel ? Array.from(violatedPlansSel.selectedOptions).map(o => o.value) : [],
            emotionalFactors: emotionalFactorsSel ? Array.from(emotionalFactorsSel.selectedOptions).map(o => o.value) : []
        };
        logData.nextWeekOptimization = {
            goodHabitToKeep: document.getElementById('goodHabitToKeep').value || '',
            mistakeToAvoid: document.getElementById('mistakeToAvoid').value || '',
            specificActions: document.getElementById('specificActions').value || ''
        };
        logData.weeklyAffirmation = document.getElementById('weeklyAffirmation').value || '';
    }
    
    try {
        createOrUpdateLog(logData);
        closeLogModal();
        
        // 如果侧边栏打开，刷新列表
        const sidebar = document.getElementById('logSidebar');
        if (sidebar && !sidebar.classList.contains('hidden')) {
            refreshLogList();
        }
        
        // 重新渲染日历以显示日志按钮
        if (window.renderCalendar) {
            window.renderCalendar();
        }
        
        showToast('日志保存成功');
    } catch (error) {
        console.error('保存日志失败:', error);
        showToast('保存日志失败', 'error');
    }
}

// 处理删除日志
function handleDeleteLog() {
    if (!currentEditingLog) return;
    
    if (confirm('确定要删除这条日志吗？')) {
        try {
            deleteLog(currentEditingLog.id);
            closeLogModal();
            
            // 刷新侧边栏列表
            const sidebar = document.getElementById('logSidebar');
            if (sidebar && !sidebar.classList.contains('hidden')) {
                refreshLogList();
            }
            
            // 重新渲染日历
            if (window.renderCalendar) {
                window.renderCalendar();
            }
            
            showToast('日志已删除');
        } catch (error) {
            console.error('删除日志失败:', error);
            showToast('删除日志失败', 'error');
        }
    }
}

// 打开日志侧边栏
export function openLogSidebar() {
    const sidebar = document.getElementById('logSidebar');
    if (sidebar) {
        sidebar.classList.remove('hidden');
        sidebar.classList.add('active');
        logListPage = 0;
        loadLogList();
    }
}

// 关闭日志侧边栏
export function closeLogSidebar() {
    const sidebar = document.getElementById('logSidebar');
    if (sidebar) {
        sidebar.classList.add('hidden');
        sidebar.classList.remove('active');
    }
}

// 加载日志列表
function loadLogList() {
    const listContainer = document.getElementById('logSidebarList');
    const loadingEl = document.getElementById('logSidebarLoading');
    
    if (!listContainer) return;
    
    loadingEl?.classList.remove('hidden');
    
    setTimeout(() => {
        const allLogs = getAllLogs();
        const startIndex = logListPage * LOGS_PER_PAGE;
        const endIndex = startIndex + LOGS_PER_PAGE;
        const logsToShow = allLogs.slice(startIndex, endIndex);
        
        if (logListPage === 0) {
            listContainer.innerHTML = '';
        }
        
        logsToShow.forEach(log => {
            const logItem = createLogListItem(log);
            listContainer.appendChild(logItem);
        });
        
        loadingEl?.classList.add('hidden');
        logListPage++;
    }, 200);
}

// 创建日志列表项
function createLogListItem(log) {
    const item = document.createElement('div');
    item.className = 'log-item';
    item.dataset.logId = log.id;
    item.dataset.logDate = log.date;

    const previewText = getLogPreviewText(log);
    const typeText = log.type === 'weekly' ? '周复盘' : '日复盘';

    const dateObj = new Date(log.date);
    const weekdayMap = ['日','一','二','三','四','五','六'];
    const weekday = weekdayMap[dateObj.getDay()];

    let pnlClass = '';
    if (log.type === 'weekly') {
        const pnl = log.weeklyData?.pnlResult;
        if (typeof pnl === 'number') {
            pnlClass = pnl >= 0 ? 'profit' : 'fail';
        }
    } else {
        const stats = getDailyStats(dateObj);
        if (stats) {
            pnlClass = stats.pnl >= 0 ? 'profit' : 'fail';
        }
    }

    item.innerHTML = `
        <div class="log-item-header">
            <div class="log-item-date ${pnlClass}">${log.date} 周${weekday}</div>
            <div class="log-item-type ${log.type}">${typeText}</div>
        </div>
        <div class="log-item-preview">${previewText}</div>
        <div class="log-item-content">
            <div class="log-content-section">
                <h5>快速回顾</h5>
                <div class="log-content-text">交易笔数: ${log.quickReview?.tradesCount || 0}, 感觉评分: ${log.quickReview?.overallFeeling || 0}/5</div>
            </div>
            ${log.factRecord ? `
            <div class="log-content-section">
                <h5>记录事实</h5>
                <div class="log-content-text">${log.factRecord}</div>
            </div>
            ` : ''}
            ${log.learningPoints ? `
            <div class="log-content-section">
                <h5>提炼学习点</h5>
                <div class="log-content-text">${log.learningPoints}</div>
            </div>
            ` : ''}
            ${log.improvementDirection ? `
            <div class="log-content-section">
                <h5>优化方向</h5>
                <div class="log-content-text">${log.improvementDirection}</div>
            </div>
            ` : ''}
            ${log.selfAffirmation ? `
            <div class="log-content-section">
                <h5>自我肯定</h5>
                <div class="log-content-text">${log.selfAffirmation}</div>
            </div>
            ` : ''}
        </div>
    `;
    
    // 添加点击展开/折叠功能
    const header = item.querySelector('.log-item-header');
    header.addEventListener('click', () => {
        item.classList.toggle('expanded');
        
        // 高亮对应日期
        highlightCalendarDate(log.date);
    });
    
    // 添加双击编辑功能
    header.addEventListener('dblclick', () => {
        openLogModal(log.date, log.type);
    });
    
    return item;
}

// 高亮日历日期
function highlightCalendarDate(date) {
    // 移除之前的高亮
    document.querySelectorAll('.calendar-day.highlighted').forEach(day => {
        day.classList.remove('highlighted');
    });
    
    // 高亮指定日期
    const calendarDays = document.querySelectorAll('.calendar-day');
    calendarDays.forEach(day => {
        if (day.dataset.date === date) {
            day.classList.add('highlighted');
        }
    });
}

// 刷新日志列表
function refreshLogList() {
    logListPage = 0;
    loadLogList();
}

// 处理列表滚动加载
function handleLogListScroll(event) {
    const container = event.target;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 50) {
        const allLogs = getAllLogs();
        const hasMore = logListPage * LOGS_PER_PAGE < allLogs.length;
        
        if (hasMore) {
            loadLogList();
        }
    }
}

// 在日历中添加日志按钮
export function addLogButtonToCalendarDay(dayElement, date) {
    const dateStr = date.toISOString().split('T')[0];
    const existingLog = getLogByDate(dateStr, 'daily');
    
    // 避免重复添加按钮（例如重新渲染）
    const oldBtn = dayElement.querySelector('.log-button');
    if (oldBtn) {
        oldBtn.remove();
    }
    
    const logButton = document.createElement('button');
    logButton.className = 'log-button';
    logButton.title = existingLog ? '编辑日志' : '添加日志';
    logButton.innerHTML = '📖';
    
    logButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLogModal(dateStr);
    });
    
    // 如果已有日志，添加特殊样式
    if (existingLog) {
        logButton.classList.add('has-log');
    }
    
    dayElement.appendChild(logButton);
}

// 在交易详情中显示日志
export function displayLogInTradeModal(date) {
    const dateStr = date.toISOString().split('T')[0];
    const log = getLogByDate(dateStr, 'daily');
    
    // 查找交易详情模态框
    const tradeModal = document.getElementById('tradeModal');
    if (!tradeModal) return;
    
    // 查找或创建日志容器
    let logContainer = tradeModal.querySelector('.log-section');
    if (!logContainer) {
        logContainer = document.createElement('div');
        logContainer.className = 'log-section';
        
        // 插入到表格后面
        const table = tradeModal.querySelector('.trades-table');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(logContainer, table.nextSibling);
        }
    }
    
    // 构建日志内容DOM，避免使用innerHTML覆盖表格的潜在事件
    logContainer.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'log-section-header';
    const h3 = document.createElement('h3');
    h3.textContent = '复盘日志';
    header.appendChild(h3);
    const actionBtn = document.createElement('button');
    actionBtn.className = log ? 'edit-log-btn' : 'add-log-btn';
    actionBtn.textContent = log ? '编辑' : '添加日志';
    actionBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLogModal(dateStr);
    });
    header.appendChild(actionBtn);
    logContainer.appendChild(header);
    
    const content = document.createElement('div');
    content.className = 'log-section-content';
    if (log) {
        const quick = document.createElement('div');
        quick.className = 'log-quick-review';
        quick.innerHTML = `
            <span>交易笔数: ${log.quickReview?.tradesCount || 0}</span>
            <span>感觉评分: ${log.quickReview?.overallFeeling || 0}/5</span>
        `;
        content.appendChild(quick);
        
        if (log.factRecord) {
            const f = document.createElement('div');
            f.className = 'log-field';
            f.innerHTML = `<strong>记录事实:</strong> ${log.factRecord}`;
            content.appendChild(f);
        }
        if (log.learningPoints) {
            const l = document.createElement('div');
            l.className = 'log-field';
            l.innerHTML = `<strong>提炼学习点:</strong> ${log.learningPoints}`;
            content.appendChild(l);
        }
        if (log.improvementDirection) {
            const i = document.createElement('div');
            i.className = 'log-field';
            i.innerHTML = `<strong>优化方向:</strong> ${log.improvementDirection}`;
            content.appendChild(i);
        }
        if (log.selfAffirmation) {
            const s = document.createElement('div');
            s.className = 'log-field';
            s.innerHTML = `<strong>自我肯定:</strong> ${log.selfAffirmation}`;
            content.appendChild(s);
        }
    } else {
        const no = document.createElement('p');
        no.className = 'no-log';
        no.textContent = '暂无复盘日志';
        content.appendChild(no);
    }
    logContainer.appendChild(content);
}

// 显示提示消息
function showToast(message, type = 'success') {
    // 创建提示元素
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // 添加样式
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translate(-50%, -20px);
        padding: 12px 24px;
        border-radius: 4px;
        color: white;
        z-index: 10000;
        font-size: 14px;
        background: ${type === 'error' ? '#e74c3c' : '#27ae60'};
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        opacity: 0;
        display: inline-block;
        transition: all 0.3s ease;
    `;

    document.body.appendChild(toast);

    // 显示动画
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';
    }, 100);

    // 自动隐藏
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// 导出到全局作用域以便HTML中使用
window.logUI = {
    openLogModal,
    closeLogModal,
    openLogSidebar,
    closeLogSidebar
};