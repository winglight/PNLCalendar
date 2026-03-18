import { allTrades, calculateDuration } from './data.js';
import { LOG_TEMPLATE, getLogByDate } from './logs.js';

const AI_CONFIG_KEY = 'aiReviewConfig';

const DAILY_DEFAULT_TEMPLATE = `你是资深交易复盘教练。请仅返回 JSON，不要附加解释。
复盘周期: {{period_type}}
区间: {{start_date}} ~ {{end_date}}
时区: {{timezone}}
请重点参考附件文件:
- 订单CSV: {{orders_file_name_csv}}
订单条数: {{orders_count}}
文件列表: {{files}}
订单表结构: {{orders_schema}}
复盘表结构: {{trade_logs_schema}}
已有复盘(可为空): {{current_log}}
输出字段必须兼容 trade_logs，至少包含: overall_feeling,fact_record,learning_points,improvement_direction,self_affirmation`;

const WEEKLY_DEFAULT_TEMPLATE = `你是资深交易复盘教练。请仅返回 JSON，不要附加解释。
复盘周期: {{period_type}}
区间: {{start_date}} ~ {{end_date}}
时区: {{timezone}}
请重点参考附件文件:
- 订单CSV: {{orders_file_name_csv}}
订单条数: {{orders_count}}
文件列表: {{files}}
订单表结构: {{orders_schema}}
复盘表结构: {{trade_logs_schema}}
已有复盘(可为空): {{current_log}}
可选违背计划标签(必须从中选择): {{violated_plan_options}}
可选情绪标签(必须从中选择): {{emotional_factor_options}}
输出字段必须兼容 trade_logs，至少包含: overall_feeling,fact_record,learning_points,improvement_direction,self_affirmation,planned_trades,emotional_stability,violated_plans,emotional_factors,good_habit_to_keep,mistake_to_avoid,specific_actions,weekly_affirmation
其中 violated_plans 与 emotional_factors 请返回字符串数组，且元素必须来自上述可选标签；specific_actions 请返回字符串数组，或返回按换行分隔的字符串。`;

function getDefaultConfig() {
    return {
        url: 'http://localhost:8000',
        token: '',
        model: 'gpt-4',
        isNewSession: true,
        dailyTemplate: DAILY_DEFAULT_TEMPLATE,
        weeklyTemplate: WEEKLY_DEFAULT_TEMPLATE
    };
}

function normalizeBaseUrl(url) {
    return (url || '').trim().replace(/\/+$/, '');
}

function loadAiConfig() {
    const defaults = getDefaultConfig();
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return defaults;
    try {
        const parsed = JSON.parse(raw);
        return {
            ...defaults,
            ...parsed,
            isNewSession: parsed?.isNewSession !== false
        };
    } catch (error) {
        return defaults;
    }
}

function saveAiConfig(config) {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

function getAiConfigFromForm() {
    const url = document.getElementById('aiUrl')?.value || '';
    const token = document.getElementById('aiToken')?.value || '';
    const model = document.getElementById('aiModel')?.value || '';
    const isNewSession = !!document.getElementById('aiNewSession')?.checked;
    const dailyTemplate = document.getElementById('aiDailyTemplate')?.value || '';
    const weeklyTemplate = document.getElementById('aiWeeklyTemplate')?.value || '';
    return {
        url: normalizeBaseUrl(url),
        token: token.trim(),
        model: model.trim() || 'gpt-4',
        isNewSession,
        dailyTemplate: dailyTemplate.trim() || DAILY_DEFAULT_TEMPLATE,
        weeklyTemplate: weeklyTemplate.trim() || WEEKLY_DEFAULT_TEMPLATE
    };
}

function fillAiConfigForm(config) {
    const merged = { ...getDefaultConfig(), ...config };
    const aiUrl = document.getElementById('aiUrl');
    const aiToken = document.getElementById('aiToken');
    const aiModel = document.getElementById('aiModel');
    const aiNewSession = document.getElementById('aiNewSession');
    const aiDailyTemplate = document.getElementById('aiDailyTemplate');
    const aiWeeklyTemplate = document.getElementById('aiWeeklyTemplate');
    if (aiUrl) aiUrl.value = merged.url || '';
    if (aiToken) aiToken.value = merged.token || '';
    if (aiModel) aiModel.value = merged.model || '';
    if (aiNewSession) aiNewSession.checked = merged.isNewSession !== false;
    if (aiDailyTemplate) aiDailyTemplate.value = merged.dailyTemplate || DAILY_DEFAULT_TEMPLATE;
    if (aiWeeklyTemplate) aiWeeklyTemplate.value = merged.weeklyTemplate || WEEKLY_DEFAULT_TEMPLATE;
}

function showAiConfigStatus(message, type = 'success') {
    const statusEl = document.getElementById('aiConfigStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('hidden', 'success', 'error');
    statusEl.classList.add(type === 'error' ? 'error' : 'success');
}

function clearAiConfigStatus() {
    const statusEl = document.getElementById('aiConfigStatus');
    if (!statusEl) return;
    statusEl.textContent = '';
    statusEl.classList.add('hidden');
    statusEl.classList.remove('success', 'error');
}

function showAiGenerateError(message) {
    const errorEl = document.getElementById('aiGenerateError');
    if (!errorEl) return;
    if (!message) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
        return;
    }
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function getHeaders(token, hasJson = true) {
    const headers = {};
    if (hasJson) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function handleSaveAiConfig() {
    const config = getAiConfigFromForm();
    saveAiConfig(config);
    showAiConfigStatus('配置已保存');
}

async function handleTestAiConfig() {
    clearAiConfigStatus();
    const config = getAiConfigFromForm();
    saveAiConfig(config);
    if (!config.url) {
        showAiConfigStatus('AI URL 不能为空', 'error');
        return;
    }
    const testBtn = document.getElementById('testAiConfigBtn');
    const oldText = testBtn?.textContent || '';
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.textContent = '测试中...';
    }
    try {
        const healthUrl = `${normalizeBaseUrl(config.url)}/healthz`;
        const response = await fetch(healthUrl, {
            method: 'GET',
            headers: getHeaders(config.token, false)
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} ${text}`.trim());
        }
        const body = await response.json().catch(() => ({}));
        if (body.status && String(body.status).toLowerCase() !== 'ok') {
            throw new Error(`服务状态异常: ${body.status}`);
        }
        showAiConfigStatus('AI服务连接正常');
    } catch (error) {
        showAiConfigStatus(`AI测试失败: ${error.message}`, 'error');
    } finally {
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.textContent = oldText || 'AI测试';
        }
    }
}

function getWeekRange(dateStr) {
    const selectedDate = new Date(dateStr);
    const day = selectedDate.getDay();
    const offsetToMonday = (day + 6) % 7;
    const monday = new Date(selectedDate);
    monday.setDate(selectedDate.getDate() - offsetToMonday);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const weekStartStr = monday.toISOString().split('T')[0];
    const weekEndStr = friday.toISOString().split('T')[0];
    return { weekStartStr, weekEndStr };
}

function getTradesByPeriod(date, type) {
    if (type === 'weekly') {
        const { weekStartStr, weekEndStr } = getWeekRange(date);
        const weeklyTrades = allTrades.filter(trade => {
            const tradeDateStr = new Date(trade.TradeDate).toISOString().split('T')[0];
            return tradeDateStr >= weekStartStr && tradeDateStr <= weekEndStr;
        });
        return { startDate: weekStartStr, endDate: weekEndStr, trades: weeklyTrades };
    }
    const dailyTrades = allTrades.filter(trade => {
        const tradeDateStr = new Date(trade.TradeDate).toISOString().split('T')[0];
        return tradeDateStr === date;
    });
    return { startDate: date, endDate: date, trades: dailyTrades };
}

function normalizeNum(value, digits = 2) {
    const num = Number.parseFloat(value);
    if (Number.isNaN(num)) return '';
    return num.toFixed(digits);
}

function csvEscape(value) {
    const str = String(value ?? '');
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function buildOrdersCsv(trades) {
    const headers = ['Time', 'Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'Duration', 'P&L'];
    const sourceTrades = trades.filter(t => t['Open/CloseIndicator'] === 'C');
    const rows = (sourceTrades.length > 0 ? sourceTrades : trades).map(trade => {
        const openTime = trade.OpenDateTime || trade.OrigTradeDate || '';
        const closeTime = trade.DateTime || trade.CloseDateTime || '';
        const time = closeTime || openTime || trade.TradeDate || '';
        const duration = calculateDuration(openTime, closeTime);
        return [
            time,
            trade.Symbol || '',
            trade['Buy/Sell'] || trade.Side || '',
            normalizeNum(trade.Quantity, 0) || trade.Quantity || '',
            normalizeNum(trade.OrigTradePrice || trade.EntryPrice || trade.TradePrice),
            normalizeNum(trade.TradePrice || trade.ExitPrice || trade.ClosePrice),
            duration,
            normalizeNum(trade.FifoPnlRealized || trade['P&L'] || trade.pnl)
        ].map(csvEscape).join(',');
    });
    return [headers.join(','), ...rows].join('\n');
}

function textToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

function formatCurrentLog(type, date) {
    const currentLog = getLogByDate(date, type);
    if (!currentLog) return '';
    return JSON.stringify(currentLog, null, 2);
}

function getTradeLogsSchemaString() {
    const schema = {
        type: LOG_TEMPLATE.type,
        quickReview: LOG_TEMPLATE.quickReview,
        factRecord: LOG_TEMPLATE.factRecord,
        learningPoints: LOG_TEMPLATE.learningPoints,
        improvementDirection: LOG_TEMPLATE.improvementDirection,
        selfAffirmation: LOG_TEMPLATE.selfAffirmation,
        weeklyData: LOG_TEMPLATE.weeklyData,
        successExperiences: LOG_TEMPLATE.successExperiences,
        mistakeSummary: LOG_TEMPLATE.mistakeSummary,
        nextWeekOptimization: LOG_TEMPLATE.nextWeekOptimization,
        weeklyAffirmation: LOG_TEMPLATE.weeklyAffirmation
    };
    return JSON.stringify(schema, null, 2);
}

function getOrdersSchemaString() {
    return JSON.stringify({
        Time: 'string',
        Symbol: 'string',
        Side: 'string',
        Qty: 'number',
        Entry: 'number',
        Exit: 'number',
        Duration: 'string',
        'P&L': 'number'
    }, null, 2);
}

function getSelectOptions(id) {
    const select = document.getElementById(id);
    if (!select) return [];
    return Array.from(select.options)
        .map(option => option.value?.trim())
        .filter(Boolean);
}

function buildPrompt(config, type, selectedDate, startDate, endDate, ordersCsv, fileName, tradesCount) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const template = type === 'weekly' ? config.weeklyTemplate : config.dailyTemplate;
    const currentLog = formatCurrentLog(type, selectedDate);
    const violatedPlanOptions = getSelectOptions('violatedPlans');
    const emotionalFactorOptions = getSelectOptions('emotionalFactors');
    const values = {
        period_type: type,
        start_date: startDate,
        end_date: endDate,
        timezone,
        orders_file_name_csv: fileName,
        orders_count: String(tradesCount),
        files: JSON.stringify([fileName]),
        orders_schema: getOrdersSchemaString(),
        trade_logs_schema: getTradeLogsSchemaString(),
        current_log: currentLog,
        violated_plan_options: violatedPlanOptions.join('、'),
        emotional_factor_options: emotionalFactorOptions.join('、'),
        orders_csv: ordersCsv
    };
    const templatePrompt = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? '');
    if (type !== 'weekly') return templatePrompt;
    return `${templatePrompt}
补充约束:
- violated_plans 仅可从以下选项中选择: ${violatedPlanOptions.join('、')}
- emotional_factors 仅可从以下选项中选择: ${emotionalFactorOptions.join('、')}
- specific_actions 建议返回数组；若返回字符串，请按每条动作单独换行。`;
}

async function streamChat(config, prompt, attachment) {
    const baseUrl = normalizeBaseUrl(config.url);
    if (!baseUrl) {
        throw new Error('AI URL 不能为空');
    }
    const payload = {
        messages: [{
            role: 'user',
            content: prompt,
            attachments: [attachment]
        }],
        model: config.model || 'gpt-4',
        stream: true,
        is_new_session: config.isNewSession !== false
    };
    const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: getHeaders(config.token, true),
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status} ${text}`.trim());
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        return data.content || '';
    }
    if (!response.body) {
        throw new Error('未收到流式响应');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let buffer = '';
    let fullContent = '';
    while (!done) {
        const result = await reader.read();
        done = result.done;
        buffer += decoder.decode(result.value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const lineRaw of lines) {
            const line = lineRaw.trim();
            if (!line) continue;
            let parsed;
            try {
                parsed = JSON.parse(line);
            } catch (error) {
                continue;
            }
            if (parsed.error) {
                throw new Error(parsed.error);
            }
            if (parsed.content) {
                fullContent += parsed.content;
            }
        }
    }
    const lastLine = buffer.trim();
    if (lastLine) {
        try {
            const parsed = JSON.parse(lastLine);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) fullContent += parsed.content;
        } catch (error) {
            if (fullContent.trim()) return fullContent.trim();
            throw new Error('无法解析流式响应');
        }
    }
    return fullContent.trim();
}

function extractJsonText(rawText) {
    const text = (rawText || '').trim();
    if (!text) throw new Error('AI返回为空');
    try {
        JSON.parse(text);
        return text;
    } catch (error) {}
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlock?.[1]) {
        const candidate = codeBlock[1].trim();
        JSON.parse(candidate);
        return candidate;
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
        const candidate = text.slice(start, end + 1);
        JSON.parse(candidate);
        return candidate;
    }
    throw new Error('AI返回不是有效JSON');
}

function getField(data, keys) {
    for (const key of keys) {
        if (data[key] !== undefined && data[key] !== null) return data[key];
    }
    return undefined;
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el || value === undefined || value === null) return;
    el.value = String(value);
}

function setMultiSelectValue(id, values) {
    const el = document.getElementById(id);
    if (!el) return;
    const candidates = splitToItems(values, { splitComma: true });
    const options = Array.from(el.options).map(opt => opt.value);
    const valueSet = new Set();
    candidates.forEach(candidate => {
        if (!candidate) return;
        const normalized = normalizeOptionText(candidate);
        let matched = options.find(option => option === candidate);
        if (!matched) {
            matched = options.find(option => normalizeOptionText(option) === normalized);
        }
        if (!matched) {
            matched = options.find(option => {
                const optionNormalized = normalizeOptionText(option);
                return optionNormalized.includes(normalized) || normalized.includes(optionNormalized);
            });
        }
        if (matched) valueSet.add(matched);
    });
    Array.from(el.options).forEach(option => {
        option.selected = valueSet.has(option.value);
    });
}

function normalizeOptionText(text) {
    return String(text || '')
        .trim()
        .toLowerCase()
        .replace(/[\s，,。；;、/\\\-()（）【】\[\]:"'`]/g, '');
}

function splitToItems(value, { splitComma = false } = {}) {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) {
        return value.flatMap(item => splitToItems(item, { splitComma })).filter(Boolean);
    }
    const text = String(value).trim();
    if (!text) return [];
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let segments = normalized.split(/\n|；|;|\|/);
    if (segments.length <= 1 && /(?:^|\s)\d+[\.、\)]/.test(normalized)) {
        segments = normalized.split(/(?=(?:^|\s)\d+[\.、\)])/);
    }
    if (segments.length <= 1 && splitComma && /,|，/.test(normalized)) {
        segments = normalized.split(/,|，/);
    }
    return segments
        .map(item => item
            .trim()
            .replace(/^[\-*•]\s*/, '')
            .replace(/^\d+[\.、\)]\s*/, '')
            .trim()
        )
        .filter(Boolean);
}

function applyAiResultToForm(result, type) {
    const overallFeelingRaw = getField(result, ['overall_feeling', 'overallFeeling', 'quick_review_overall_feeling', 'overall_feel']);
    if (overallFeelingRaw !== undefined) {
        const num = Number.parseInt(overallFeelingRaw, 10);
        if (!Number.isNaN(num)) {
            setInputValue('feelScore', Math.min(5, Math.max(1, num)));
        }
    }
    setInputValue('facts', getField(result, ['fact_record', 'factRecord']));
    setInputValue('learnings', getField(result, ['learning_points', 'learningPoints']));
    setInputValue('improvements', getField(result, ['improvement_direction', 'improvementDirection']));
    setInputValue('affirmations', getField(result, ['self_affirmation', 'selfAffirmation']));
    const countRaw = getField(result, ['trade_count', 'trades_count']);
    if (countRaw !== undefined) {
        const num = Number.parseInt(countRaw, 10);
        if (!Number.isNaN(num)) setInputValue('tradeCount', num);
    }
    if (type !== 'weekly') return;
    setInputValue('plannedTrades', getField(result, ['planned_trades', 'plannedTrades']));
    setInputValue('emotionalStability', getField(result, ['emotional_stability', 'emotionalStability']));
    setInputValue('goodHabitToKeep', getField(result, ['good_habit_to_keep', 'goodHabitToKeep']));
    setInputValue('mistakeToAvoid', getField(result, ['mistake_to_avoid', 'mistakeToAvoid']));
    const specificActionsRaw = getField(result, ['specific_actions', 'specificActions']);
    const specificActionItems = splitToItems(specificActionsRaw);
    if (specificActionItems.length > 0) {
        setInputValue('specificActions', specificActionItems.join('\n'));
    } else {
        setInputValue('specificActions', specificActionsRaw);
    }
    setInputValue('weeklyAffirmation', getField(result, ['weekly_affirmation', 'weeklyAffirmation']));
    setMultiSelectValue('violatedPlans', getField(result, ['violated_plans', 'violatedPlans']));
    setMultiSelectValue('emotionalFactors', getField(result, ['emotional_factors', 'emotionalFactors']));
}

async function handleGenerateAiLog() {
    showAiGenerateError('');
    const generateBtn = document.getElementById('generateAiLogBtn');
    const oldText = generateBtn?.textContent || '';
    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.textContent = '生成中...';
    }
    try {
        const config = loadAiConfig();
        const date = document.getElementById('logDate')?.value || '';
        const type = document.getElementById('logType')?.value || 'daily';
        if (!date) {
            throw new Error('请先选择复盘日期');
        }
        const period = getTradesByPeriod(date, type);
        const ordersCsv = buildOrdersCsv(period.trades);
        const fileName = `orders_${type}_${period.startDate}_${period.endDate}.csv`;
        const prompt = buildPrompt(config, type, date, period.startDate, period.endDate, ordersCsv, fileName, period.trades.length);
        const attachment = {
            name: fileName,
            mime_type: 'text/csv',
            data: `data:text/csv;base64,${textToBase64(ordersCsv)}`
        };
        const rawResponse = await streamChat(config, prompt, attachment);
        const jsonText = extractJsonText(rawResponse);
        const parsed = JSON.parse(jsonText);
        applyAiResultToForm(parsed, type);
        showToast('AI内容生成成功，已自动填充');
    } catch (error) {
        const message = error?.message || 'AI生成失败';
        showAiGenerateError(message);
        showToast(`AI生成失败: ${message}`, 'error');
    } finally {
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = oldText || 'AI生成';
        }
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
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
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';
    }, 100);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3000);
}

function openAiConfigModal() {
    const modal = document.getElementById('aiConfigModal');
    if (!modal) return;
    fillAiConfigForm(loadAiConfig());
    clearAiConfigStatus();
    modal.classList.remove('hidden');
}

function closeAiConfigModal() {
    const modal = document.getElementById('aiConfigModal');
    if (!modal) return;
    modal.classList.add('hidden');
}

export function initAIReviewUI() {
    fillAiConfigForm(loadAiConfig());
    const aiConfigBtn = document.getElementById('aiConfigBtn');
    if (aiConfigBtn) {
        aiConfigBtn.addEventListener('click', openAiConfigModal);
    }
    const closeAiConfigModalBtn = document.getElementById('closeAiConfigModal');
    if (closeAiConfigModalBtn) {
        closeAiConfigModalBtn.addEventListener('click', closeAiConfigModal);
    }
    const aiConfigModal = document.getElementById('aiConfigModal');
    if (aiConfigModal) {
        aiConfigModal.addEventListener('click', (event) => {
            if (event.target === aiConfigModal) closeAiConfigModal();
        });
    }
    const saveAiConfigBtn = document.getElementById('saveAiConfigBtn');
    if (saveAiConfigBtn) {
        saveAiConfigBtn.addEventListener('click', handleSaveAiConfig);
    }
    const testAiConfigBtn = document.getElementById('testAiConfigBtn');
    if (testAiConfigBtn) {
        testAiConfigBtn.addEventListener('click', handleTestAiConfig);
    }
    const generateAiLogBtn = document.getElementById('generateAiLogBtn');
    if (generateAiLogBtn) {
        generateAiLogBtn.addEventListener('click', handleGenerateAiLog);
    }
}
