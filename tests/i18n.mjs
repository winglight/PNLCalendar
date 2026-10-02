import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { harness, plain, seed, trade, source } from './harness.mjs';

if (process.argv.includes('--timezones')) {
  for (const TZ of ['UTC', 'America/Los_Angeles', 'Asia/Shanghai']) {
    console.log(`\n===== I18N TIMEZONE: ${TZ} =====`);
    execFileSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', fileURLToPath(import.meta.url)], { env: { ...process.env, TZ }, stdio: 'inherit' });
  }
  process.exit(0);
}
process.env.TZ ||= 'UTC';
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const noLocale = h => Object.fromEntries(Object.entries(h.snapshot()).filter(([key]) => key !== 'pnlCalendarLocale'));
const formState = h => h.document.querySelectorAll('input, textarea, select').map(el => ({ id: el.id, value: el.value, checked: el.checked, selected: el.options.map(o => ({ value: o.value, selected: o.selected })) })).filter(el => el.id !== 'weeklyDailyLimit');
const seeded = [trade({ Symbol: '事实-SYNTH', TransactionID: 'synthetic-i18n-1' }), trade({ Symbol: 'SECOND', TransactionID: 'synthetic-i18n-2', FifoPnlRealized: '-2.34' })];
async function ready(h) {
  await seed(h, seeded);
  const main = await h.load('main.js');
  await h.document.dispatch('DOMContentLoaded');
  return { main, locale: await h.load('i18n.js'), data: await h.load('data.js'), stats: await h.load('stats.js'), calendar: await h.load('calendar.js'), logs: await h.load('logs.js'), logUI: await h.load('log-ui.js') };
}
async function flush(h) { let safety = 0; while (h.timers.length && safety++ < 50) await h.timers.shift()(); assert.ok(safety < 50, 'Timers must settle'); }
const stubCharts = h => {
  class Chart {
    static defaults = {};
    constructor(ctx, config) { this.config = config; this.data = config.data; this.options = config.options; this.updates = []; this.destroyed = false; }
    update(mode) { this.updates.push(mode); }
    destroy() { this.destroyed = true; }
    resize() {}
  }
  h.context.Chart = Chart;
};

test('Catalog has Chinese/English parity and every explicit DOM key resolves', async h => {
  const { MESSAGES } = await h.load('messages.js');
  for (const [key, entry] of Object.entries(MESSAGES)) {
    assert.ok(entry['zh-CN']?.trim(), key); assert.ok(entry.en?.trim(), key);
    const params = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    assert.deepEqual(params(entry.en), params(entry['zh-CN']), key);
  }
  for (const attr of ['data-i18n', 'data-i18n-title', 'data-i18n-placeholder', 'data-i18n-aria-label']) {
    for (const el of h.document.querySelectorAll(`[${attr}]`)) assert.ok(MESSAGES[el.getAttribute(attr)], el.getAttribute(attr));
  }
  const locale = await h.load('i18n.js');
  for (const code of ['en', 'zh-CN']) {
    locale.setLocale(code);
    for (const el of h.document.querySelectorAll('[data-i18n]')) assert.equal(el.textContent, MESSAGES[el.dataset.i18n][code]);
  }
});

test('Locale initializes from storage/browser and safely falls back on invalid or blocked storage', async h => {
  const locale = await h.load('i18n.js');
  h.context.navigator = { language: 'en-GB' }; locale.initI18n(); assert.equal(locale.getLocale(), 'en');
  h.localStorage.setItem('pnlCalendarLocale', 'zh-CN'); locale.initI18n(); assert.equal(locale.getLocale(), 'zh-CN');
  h.localStorage.setItem('pnlCalendarLocale', 'not-a-locale'); locale.initI18n(); assert.equal(locale.getLocale(), 'zh-CN');
  assert.equal(locale.setLocale('en-US'), 'en'); assert.equal(h.localStorage.getItem('pnlCalendarLocale'), 'en');
  const before = h.snapshot(); locale.setLocale('zh-CN', { persist: false }); assert.deepEqual(h.snapshot(), before);
  h.localStorage.getItem = () => { throw new Error('Synthetic denied storage'); };
  h.localStorage.setItem = () => { throw new Error('Synthetic denied storage'); };
  locale.initI18n(); assert.equal(locale.getLocale(), 'zh-CN'); assert.doesNotThrow(() => locale.setLocale('en'));
  assert.equal(h.document.documentElement.getAttribute('lang'), 'en-US');
});

test('Real header and settings switches update all three tabs, aria labels and document language', async h => {
  const { locale } = await ready(h);
  const toggle = h.document.querySelector('.app-actions [data-locale-toggle]');
  await toggle.click(); assert.equal(locale.getLocale(), 'en'); assert.equal(toggle.textContent, '中');
  assert.deepEqual(['tab-calendar', 'tab-analytics', 'tab-journal'].map(id => h.el(id).textContent), ['Calendar', 'Analytics', 'Journal']);
  assert.equal(h.el('symbolFilter').getAttribute('placeholder'), 'Search symbol, e.g. AAPL*');
  assert.equal(h.el('settingsBtn').getAttribute('aria-label'), 'Settings');
  await h.el('settingsBtn').click(); assert.equal(h.el('settingsDialog').open, true);
  await h.document.querySelector('[data-locale-choice="zh-CN"]').click();
  assert.equal(h.el('settingsDialog').open, true); assert.equal(h.el('tab-calendar').textContent, '交易日历');
  assert.equal(h.document.querySelector('[data-locale-choice="zh-CN"]').getAttribute('aria-pressed'), 'true');
  await h.el('closeSettingsBtn').click(); assert.equal(h.el('settingsDialog').open, false);
});

test('Switching only stores locale and preserves trades, filters, notes, view, selected day and all six themes', async h => {
  const { locale, data, stats, calendar, logs } = await ready(h);
  logs.createOrUpdateLog({ date: '2025-01-31', type: 'daily', factRecord: 'Net P&L / 记录事实 / 用户原文', associatedTrades: ['synthetic-i18n-1'] });
  h.localStorage.setItem('aiReviewConfig', JSON.stringify({ url: 'https://synthetic.invalid', dailyTemplate: '用户提示词 unchanged' }));
  h.localStorage.setItem('r2Config', JSON.stringify({ enabled: false, app: 'synthetic', url: 'https://synthetic.invalid' }));
  data.filterTradesBySymbol('事实-SYNTH'); data.saveDateRangeSelection(new h.Date(2025, 0, 1), new h.Date(2025, 0, 31));
  h.el('symbolFilter').value = '事实-SYNTH'; h.el('startDate').value = '2025-01-01'; h.el('endDate').value = '2025-01-31';
  calendar.selectCalendarDay('2025-01-31');
  await h.el('tab-analytics').click();
  const before = noLocale(h), records = plain(data.allTrades), filtered = plain(data.filteredTrades), totals = plain(stats.calculateAdvancedStats());
  const themes = await h.load('themes.js');
  for (const theme of themes.THEME_IDS) {
    themes.applyTheme(theme, { persist: false });
    for (const code of ['en', 'zh-CN']) {
      locale.setLocale(code); assert.deepEqual(noLocale(h), before); assert.deepEqual(plain(data.allTrades), records); assert.deepEqual(plain(data.filteredTrades), filtered); assert.deepEqual(plain(stats.calculateAdvancedStats()), totals);
      assert.equal(h.el('symbolFilter').value, '事实-SYNTH'); assert.equal(h.el('startDate').value, '2025-01-01'); assert.equal(h.el('endDate').value, '2025-01-31');
      assert.equal(h.el('analyticsView').hidden, false); assert.equal(h.document.documentElement.dataset.theme, theme);
      assert.equal(h.document.querySelector('.calendar-day.selected').dataset.date, '2025-01-31');
    }
  }
  assert.equal(h.fetchCalls.length, 0);
});

for (const width of [375, 700, 701, 1440]) test(`Calendar labels switch at ${width}px without replacing day nodes or dropping weekends`, async () => {
  const h = await harness({ width }); const { locale, calendar, stats } = await ready(h);
  calendar.currentDate.setFullYear(2025, 0, 1); calendar.renderCalendar();
  const days = h.document.querySelectorAll('.calendar-day'), summaries = h.document.querySelectorAll('.week-summary');
  const before = plain(stats.getMonthlyStats(2025, 0));
  locale.setLocale('en'); assert.equal(h.el('currentMonth').textContent, 'January 2025');
  assert.deepEqual(h.document.querySelectorAll('.calendar-header').map(el => el.textContent), ['Sun','Mon','Tue','Wed','Thu','Fri','Sat','Weekly total']);
  assert.equal(days.length, 31); assert.deepEqual(h.document.querySelectorAll('.calendar-day'), days); assert.deepEqual(h.document.querySelectorAll('.week-summary'), summaries);
  assert.match(h.el('dayPreview').textContent, /Daily overview/); assert.match(h.el('tradingDays').textContent, /trading days?/);
  assert.deepEqual(plain(stats.getMonthlyStats(2025, 0)), before);
  locale.setLocale('zh-CN'); assert.match(h.el('currentMonth').textContent, /2025年1月/);
});

for (const type of ['daily', 'weekly']) test(`${type} review retains unsaved fields, option values, associated IDs and modal identity`, async h => {
  const { locale, logUI, logs } = await ready(h);
  logUI.openLogModal('2025-01-31', type);
  for (const id of ['facts','learnings','improvements','affirmations','plannedTrades','emotionalStability','goodHabitToKeep','mistakeToAvoid','specificActions','weeklyAffirmation']) h.el(id).value = `${id}: 用户原文 / Profit factor`;
  h.el('linkedTrades').value = 'synthetic-i18n-1,synthetic-i18n-2'; h.el('feelScore').value = '4';
  h.el('violatedPlans').options[0].selected = true; h.el('emotionalFactors').options[1].selected = true;
  const modal = h.el('logModal'), form = h.el('logForm'), fields = formState(h), stored = noLocale(h);
  await modal.querySelector('[data-locale-toggle]').click();
  assert.equal(locale.getLocale(), 'en'); assert.equal(h.el('logModal'), modal); assert.equal(h.el('logForm'), form); assert.equal(modal.classList.contains('hidden'), false);
  assert.deepEqual(formState(h), fields); assert.deepEqual(noLocale(h), stored); assert.equal(logs.allLogs.length, 0);
  assert.equal(h.el('violatedPlans').options[0].textContent, 'Overtrading'); assert.equal(h.el('violatedPlans').options[0].value, '超量交易');
  assert.equal(h.el('emotionalFactors').options[1].textContent, 'Fear'); assert.equal(h.el('weeklyDailyLimit').value, type === 'weekly' ? 'Yes' : h.el('weeklyDailyLimit').value);
  await form.dispatch('submit'); const saved = logs.getLogByDate('2025-01-31', type);
  assert.equal(saved.factRecord, 'facts: 用户原文 / Profit factor'); assert.deepEqual(plain(saved.associatedTrades), ['synthetic-i18n-1','synthetic-i18n-2']);
  if (type === 'weekly') { assert.deepEqual(plain(saved.mistakeSummary.violatedPlans), ['超量交易']); assert.deepEqual(plain(saved.mistakeSummary.emotionalFactors), ['恐惧']); }
  logUI.openLogModal('2025-01-31', type); assert.equal(h.el('facts').value, saved.factRecord); locale.setLocale('zh-CN'); assert.equal(h.el('facts').value, saved.factRecord);
});

test('Open journal cards keep expanded state and user text when labels change', async h => {
  const { locale, logs, logUI } = await ready(h);
  logs.createOrUpdateLog({ date: '2025-01-31', type: 'daily', factRecord: '记录事实 <span data-i18n="净盈亏">raw text</span>' });
  logUI.openLogSidebar(); await flush(h);
  const item = h.document.querySelector('.log-item'); await item.querySelector('.log-item-header').click();
  locale.setLocale('en'); assert.equal(item.classList.contains('expanded'), true); assert.equal(h.document.querySelector('.log-item'), item);
  assert.match(item.textContent, /Quick review/); assert.match(item.textContent, /记录事实 <span data-i18n="净盈亏">raw text<\/span>/);
  assert.equal(item.querySelector('.log-item-preview').querySelectorAll('[data-i18n]').length, 0);
});

test('Import fields and file state survive locale switching; CSV failure is localized', async h => {
  const { locale, main } = await ready(h); main.showImportModal();
  h.el('flexToken').value = 'synthetic-unsaved-token'; h.el('reportId').value = 'synthetic-report';
  const file = { name: 'synthetic.csv' }; h.el('csvFile').files = [file];
  const stored = noLocale(h); await h.el('importModal').querySelector('[data-locale-toggle]').click();
  assert.equal(h.el('flexToken').value, 'synthetic-unsaved-token'); assert.equal(h.el('reportId').value, 'synthetic-report'); assert.equal(h.el('csvFile').files[0], file); assert.deepEqual(noLocale(h), stored); assert.equal(h.el('importModal').style.display, 'block');
  h.context.FileReader = class { readAsText() { this.onerror(); } };
  await h.el('csvFile').dispatch('change'); assert.equal(h.alerts.at(-1), 'CSV import failed: Could not read the CSV file');
  locale.setLocale('zh-CN'); await h.el('csvFile').dispatch('change'); assert.equal(h.alerts.at(-1), 'CSV 导入失败：无法读取 CSV 文件');
});

test('AI config switches labels without translating prompts or losing unsaved connection fields', async h => {
  const { locale } = await ready(h); await h.el('aiConfigBtn').click();
  const prompt = h.el('aiDailyTemplate').value; assert.match(prompt, /你是资深交易复盘教练/);
  h.el('aiToken').value = 'synthetic-unsaved-token'; h.el('aiModel').value = 'synthetic-custom-model'; h.el('aiWeeklyTemplate').value = '提示词 / keep unchanged {{orders_count}}'; h.el('aiNewSession').checked = false;
  const fields = formState(h), saved = noLocale(h); await h.el('aiConfigModal').querySelector('[data-locale-toggle]').click();
  assert.equal(locale.getLocale(), 'en'); assert.deepEqual(formState(h), fields); assert.deepEqual(noLocale(h), saved); assert.equal(h.el('aiConfigModal').classList.contains('hidden'), false);
  assert.equal(h.el('aiDailyTemplate').value, prompt); assert.equal(h.fetchCalls.length, 0);
});

test('AI in-flight status and final button use the latest locale, including an error after a switch', async h => {
  const { locale } = await ready(h); await h.el('aiConfigBtn').click(); h.el('aiUrl').value = 'https://synthetic.invalid';
  let resolve; h.setFetch(() => new Promise(r => { resolve = r; }));
  const pending = h.el('testAiConfigBtn').click(); assert.equal(h.el('testAiConfigBtn').disabled, true);
  locale.setLocale('en'); assert.equal(h.el('testAiConfigBtn').textContent, 'Testing...');
  resolve({ ok: true, json: async () => ({ status: 'ok' }) }); await pending;
  assert.equal(h.el('testAiConfigBtn').textContent, 'Test AI connection'); assert.equal(h.el('aiConfigStatus').textContent, 'AI connection successful');
  locale.setLocale('zh-CN'); assert.equal(h.el('aiConfigStatus').textContent, 'AI服务连接正常');
  h.el('aiUrl').value = ''; await h.el('testAiConfigBtn').click(); locale.setLocale('en'); assert.equal(h.el('aiConfigStatus').textContent, 'Enter an AI service URL');
});

test('AI draft requests remain byte-identical in both languages and drafts remain unsaved', async h => {
  const { locale, logUI, logs } = await ready(h); logUI.openLogModal('2025-01-31', 'weekly');
  h.localStorage.setItem('aiReviewConfig', JSON.stringify({ url: 'https://synthetic.invalid', token: 'synthetic-token', model: 'synthetic-model' }));
  const output = { fact_record: 'AI原文 / unchanged', violated_plans: ['超量交易'], emotional_factors: ['恐惧'] };
  h.setFetch(async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ content: JSON.stringify(output) }) }));
  const requests = [];
  for (const code of ['zh-CN','en']) {
    locale.setLocale(code); await h.el('generateAiLogBtn').click(); requests.push(h.fetchCalls.at(-1)[1].body);
    assert.equal(logs.allLogs.length, 0); assert.equal(h.el('facts').value, output.fact_record); assert.equal(h.el('violatedPlans').selectedOptions[0].value, '超量交易');
  }
  assert.equal(requests[0], requests[1]); assert.equal(h.el('generateAiLogBtn').textContent, 'Generate editable AI draft');
  h.setFetch(async () => { throw new Error('Synthetic service offline'); }); await h.el('generateAiLogBtn').click();
  assert.match(h.el('aiGenerateError').textContent, /^AI generation failed:/); locale.setLocale('zh-CN'); assert.match(h.el('aiGenerateError').textContent, /^AI生成失败:/);
});

test('R2 unsaved form and stable config keys survive switching; locale triggers no sync', async h => {
  const { locale, data } = await ready(h); data.r2Sync.createConfigDialog();
  const dialog = h.document.querySelector('.config-dialog'); h.el('app').value = 'synthetic-app'; h.el('url').value = 'https://synthetic.invalid'; h.el('token').value = 'synthetic-token'; h.el('r2-enabled').checked = false;
  const fields = formState(h), before = noLocale(h); await dialog.querySelector('[data-locale-toggle]').click();
  assert.equal(locale.getLocale(), 'en'); assert.match(dialog.textContent, /Enable R2 sync/); assert.deepEqual(formState(h), fields); assert.deepEqual(noLocale(h), before); assert.equal(h.fetchCalls.length, 0);
  await h.el('save-config').click(); assert.deepEqual(JSON.parse(h.localStorage.getItem('r2Config')), { app: 'synthetic-app', url: 'https://synthetic.invalid', token: 'synthetic-token', enabled: false });
});

test('Trade summary/detail modal dates, direction, duration and close/reopen survive switches', async h => {
  const { locale, calendar, data } = await ready(h); data.allTrades[0].OpenDateTime = '2025-01-31T09:00:00Z'; const before = plain(data.allTrades);
  calendar.showTradeDetails(new h.Date('2025-01-31T00:00:00Z')); const modal = h.el('tradeModal');
  await modal.querySelector('[data-locale-toggle]').click(); assert.equal(locale.getLocale(), 'en'); assert.equal(modal.style.display, 'block'); assert.equal(h.el('modalDate').dataset.date, '2025-01-31');
  assert.match(h.el('tradesTableBody').textContent, /Long/); calendar.viewTradeDetails(); assert.match(modal.textContent, /Detailed trades/); assert.match(modal.textContent, /1 hr 30 min/);
  await modal.querySelector('[data-locale-toggle]').click(); assert.match(modal.textContent, /详细交易/); assert.match(modal.textContent, /1小时 30分钟/); assert.equal(modal.style.display, 'block');
  calendar.closeTradeModal(); calendar.showTradeDetails(new h.Date('2025-01-31T00:00:00Z'));
  await modal.querySelector('[data-locale-toggle]').click(); assert.match(modal.textContent, /View details/); assert.deepEqual(plain(data.allTrades), before);
});

test('Charts, tooltip labels and fullscreen metrics switch in place without changing values', async h => {
  stubCharts(h); const { locale, stats } = await ready(h);
  const charts = { ...stats.chartInstances }, values = Object.fromEntries(Object.entries(charts).map(([key,c]) => [key, plain(c.data.datasets.map(d=>d.data))]));
  for (const code of ['en','zh-CN','en']) {
    locale.setLocale(code);
    for (const [key, chart] of Object.entries(charts)) { assert.equal(stats.chartInstances[key], chart); assert.equal(chart.destroyed, false); assert.deepEqual(plain(chart.data.datasets.map(d=>d.data)), values[key]); }
  }
  assert.equal(charts.cumulativePnLChart.data.datasets[0].label, 'Cumulative P&L'); assert.equal(charts.durationPerformanceChart.data.labels[0], '0–5 min'); assert.match(charts.weeklyStatsChart.data.labels[0], /Week/);
  await h.document.querySelector('[data-card="profit-factor"]').click(); const metric = h.el('statModal'); assert.equal(metric.style.display, 'flex'); assert.equal(h.el('statModalTitle').textContent, 'Profit factor');
  locale.setLocale('zh-CN'); assert.equal(metric.style.display, 'flex'); assert.equal(h.el('statModalTitle').textContent, '盈利因子'); assert.match(h.el('statModalContent').textContent, /总盈利除以总亏损/);
  await h.document.querySelector('[data-chart="dailyPnLChart"]').click(); await flush(h);
  const fullscreen = stats.chartInstances.dailyPnLChart_fullscreen; assert.ok(fullscreen); locale.setLocale('en'); assert.equal(stats.chartInstances.dailyPnLChart_fullscreen, fullscreen); assert.equal(fullscreen.data.datasets[0].label, 'Daily P&L'); assert.equal(h.el('chartModalTitle').textContent, 'Daily net P&L');
});

test('English empty/loading/error labels update without translating user-provided text', async h => {
  const { locale, logUI } = await ready(h); logUI.openLogSidebar(); await flush(h); locale.setLocale('en');
  assert.match(h.el('chartStatus').textContent, /^The chart library did not load/); assert.equal(h.el('logSidebarLoading').textContent, 'Loading...'); assert.match(h.el('logSidebarList').textContent, /^No journal entries yet/);
  assert.equal(h.document.querySelector('[data-theme-choice="forest"]').textContent, 'Forest');
  const message = locale.messageHTML('AI生成失败: {error}', { error: '<b>服务原文</b>' }); assert.match(message, /&lt;b&gt;服务原文&lt;\/b&gt;/);
  assert.equal(locale.t('unknown-key'), 'unknown-key');
});

test('ISO and IB slash civil dates retain their day and charts distinguish years', async h => {
  stubCharts(h); const { locale, data, stats } = await ready(h); locale.setLocale('en');
  assert.equal(locale.formatDate('2024/11/26', { year: 'numeric', month: 'short', day: 'numeric' }), 'Nov 26, 2024');
  assert.equal(locale.formatDate('2024-11-26', { year: 'numeric', month: 'short', day: 'numeric' }), 'Nov 26, 2024');
  assert.equal(locale.formatDate('Tue Nov 26 2024', { year: 'numeric', month: 'short', day: 'numeric' }), 'Nov 26, 2024');
  assert.equal(locale.formatDate('invalid-import-date'), 'invalid-import-date');
  data.mergeTrades([trade({ TransactionID: 'slash-2024', Symbol: 'SLASH24', TradeDate: '2024/11/26', OrderTime: '2024-11-26T12:00:00Z' }), trade({ TransactionID: 'slash-2025', Symbol: 'SLASH25', TradeDate: '2025/11/26', OrderTime: '2025-11-26T12:00:00Z' })]);
  data.clearTradeFilters(); stats.updateStatistics();
  const chart = stats.chartInstances.dailyPnLChart;
  assert.ok(chart.data.labels.includes('Nov 26, 2024')); assert.ok(chart.data.labels.includes('Nov 26, 2025'));
  locale.setLocale('zh-CN'); assert.ok(chart.data.labels.some(s => s.includes('2024年11月26日'))); assert.ok(chart.data.labels.some(s => s.includes('2025年11月26日')));
});

test('Bubbling locale-control clicks preserve active date and symbol pickers', async h => {
  const { calendar, locale } = await ready(h);
  await h.el('symbolDropdownBtn').click(); assert.equal(h.el('symbolDropdown').classList.contains('active'), true);
  calendar.toggleDatePicker(); await flush(h); assert.equal(h.el('dateRangePicker').classList.contains('active'), true);
  h.el('startDate').value = '2025-01-12'; h.el('endDate').value = '2025-01-29';
  await h.document.querySelector('.app-actions [data-locale-toggle]').click();
  assert.equal(locale.getLocale(), 'en'); assert.equal(h.el('symbolDropdown').classList.contains('active'), true); assert.equal(h.el('dateRangePicker').classList.contains('active'), true);
  assert.equal(h.el('startDate').value, '2025-01-12'); assert.equal(h.el('endDate').value, '2025-01-29');
});

test('AI prompt/schema/calculation contracts and persisted option values are unchanged', async h => {
  const aiSource = source('ai-review.js'); const originalAI = source('ai-review.js', 'baseline');
  for (const name of ['DAILY_DEFAULT_TEMPLATE','WEEKLY_DEFAULT_TEMPLATE']) {
    const re = new RegExp(`const ${name} = \\` + '`' + `([\\s\\S]*?)` + '`;');
    assert.equal(aiSource.match(re)[1], originalAI.match(re)[1], name);
  }
  assert.equal(source('logs.js'), source('logs.js', 'baseline'));
  const values = id => h.el(id).options.map(o => o.value);
  assert.deepEqual(values('violatedPlans'), ['超量交易','未设止损','追涨杀跌','持仓过夜','违反策略','情绪化操作']);
  assert.deepEqual(values('emotionalFactors'), ['贪婪','恐惧','犹豫','焦虑','后悔','兴奋']);
});

let failed = 0;
for (const { name, fn } of tests) {
  try { await fn(await harness()); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`\nI18N: ${tests.length - failed}/${tests.length} passed (TZ=${process.env.TZ}). Synthetic DOM and chart doubles, not screenshot verification.`);
process.exitCode = failed ? 1 : 0;
