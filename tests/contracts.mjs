import assert from 'node:assert/strict';
import { harness, plain, seed, trade } from './harness.mjs';

const cases = [];
const contract = (id, name, fn, options = {}) => cases.push({ id, name, fn, ...options });
const legacy = (id, name, fn) => contract(id, name, fn, { knownBaseline: true });
const ui = (id, name, fn) => contract(id, name, fn, { newContract: true });
const ids = rows => plain(rows.map(t => t.TransactionID));
const localDay = (h, date) => new h.Date(`${date}T12:00:00`);
const completeLog = (type = 'daily', date = '2025-01-31') => ({
  date, type, quickReview: { tradesCount: 4, overallFeeling: 4 },
  factRecord: 'Synthetic facts', learningPoints: 'Synthetic learning', improvementDirection: 'Synthetic improvement', selfAffirmation: 'Synthetic affirmation',
  associatedTrades: ['synthetic-open', 'synthetic-close'],
  weeklyData: { totalTrades: 3, pnlResult: 12.34, maxWin: 20, maxLoss: -7.66, winRate: 66.666, followsDailyLimit: true },
  successExperiences: { plannedTrades: 'Synthetic planned', emotionalStability: 'Synthetic stable' },
  mistakeSummary: { violatedPlans: ['Synthetic violation'], emotionalFactors: ['Synthetic fear'] },
  nextWeekOptimization: { goodHabitToKeep: 'Synthetic habit', mistakeToAvoid: 'Synthetic mistake', specificActions: 'Synthetic action 1\nSynthetic action 2' },
  weeklyAffirmation: 'Synthetic weekly affirmation'
});

contract('realized-pnl', 'Statistics use imported FIFO realized P&L and exclude open positions', async h => {
  const data = await seed(h, [trade(), trade({ TransactionID: 'loss', Symbol: 'LOSS', FifoPnlRealized: '-2.34', Quantity: '-100' }), trade({ TransactionID: 'open', Symbol: 'OPEN', 'Open/CloseIndicator': 'O', FifoPnlRealized: '999999' })]);
  const stats = await h.load('stats.js'); const totals = stats.calculateStats();
  assert.equal(totals.netPnL, 10); assert.equal(totals.tradeCount, 2); assert.equal(totals.winRate.percentage, 50);
  assert.equal(stats.getDailyStats(new h.Date('2025-01-31T00:00:00Z')).pnl, 10);
  assert.equal(stats.getMonthlyStats(2025, 0).pnL, 10);
  assert.equal(data.allTrades[0].FifoPnlRealized, '12.34');
});
contract('transaction-id-dedup', 'Repeated IB TransactionID imports are idempotent; later imported values replace earlier values', async h => {
  const data = await seed(h, [trade(), trade()]); assert.equal(data.allTrades.length, 1);
  data.mergeTrades([trade({ FifoPnlRealized: '13.45' }), trade({ TransactionID: 'other-close' })]);
  assert.equal(data.allTrades.length, 2); assert.equal(data.allTrades[0].FifoPnlRealized, '13.45');
  const persisted = JSON.parse(h.localStorage.getItem('trades')); assert.equal(persisted.length, 2);
});
contract('open-close-duration', 'Same-batch open/close records retain imported P&L and holding duration', async h => {
  const data = await seed(h, [trade({ TransactionID: 'open', DateTime: '2025-01-31T09:00:00Z', 'Open/CloseIndicator': 'O' }), trade()]);
  assert.equal(data.allTrades.length, 2); assert.equal(data.allTrades[1].OpenDateTime, '2025-01-31T09:00:00Z');
  assert.equal(data.calculateDuration(data.allTrades[1].OpenDateTime, data.allTrades[1].DateTime), '1h 30m');
  assert.equal(data.calculateDuration('', '2025-01-31T10:00:00Z'), '--');
  assert.equal(data.calculateDuration('2025-01-31T10:00:00Z', '2025-01-31T10:25:00Z'), '25m');
});
legacy('reload-transaction-ids', 'Reload preserves distinct same-day/symbol TransactionIDs', async h => {
  const data = await seed(h, [trade(), trade({ TransactionID: 'other-close', FifoPnlRealized: '1.11' })]);
  assert.deepEqual(ids(data.loadTradesFromStorage()), ['synthetic-close-1', 'other-close']);
});
legacy('reload-numeric-quantity', 'Reload aggregation never concatenates IB numeric quantity strings', async h => {
  const data = await seed(h, [trade({ Quantity: '2' }), trade({ TransactionID: 'other-close', Quantity: '3' })]);
  const total = data.loadTradesFromStorage().reduce((sum, t) => sum + Number(t.Quantity), 0); assert.equal(total, 5);
});
legacy('cross-batch-open-time', 'A close imported later can find an already stored open record', async h => {
  const data = await seed(h, [trade({ TransactionID: 'open', DateTime: '2025-01-31T09:00:00Z', 'Open/CloseIndicator': 'O' })]);
  data.mergeTrades([trade()]); assert.equal(data.allTrades.find(t => t.TransactionID === 'synthetic-close-1').OpenDateTime, '2025-01-31T09:00:00Z');
});
legacy('reload-import-idempotence', 'Reload followed by repeat import does not count a merged same-day trade twice', async h => {
  const a = trade({ TransactionID: 'a', FifoPnlRealized: '10' }), b = trade({ TransactionID: 'b', FifoPnlRealized: '20' });
  const data = await seed(h, [a, b]); await data.loadTrades(); data.mergeTrades([b]);
  data.filterTradesByDateRange(localDay(h, '2025-01-31'), localDay(h, '2025-01-31'));
  const stats = await h.load('stats.js'); assert.equal(stats.calculateStats().netPnL, 30);
});
contract('ib-csv', 'IB-style CSV imports quoted headers, IDs, open/close fields and FIFO P&L', async h => {
  const data = await h.load('data.js');
  const csv = '"TransactionID","Symbol","TradeDate","DateTime","Open/CloseIndicator","Quantity","FifoPnlRealized"\n"ib-open","SYNTH","2025-01-31","2025-01-31T09:00:00Z","O","3","0"\n"ib-close","SYNTH","2025-01-31","2025-01-31T10:30:00Z","C","-3","12.34"\n';
  assert.equal(data.processTradeData(csv), true); assert.deepEqual(ids(data.allTrades), ['ib-open', 'ib-close']);
  assert.equal(data.allTrades[1].FifoPnlRealized, '12.34'); assert.equal(data.allTrades[1].OpenDateTime, '2025-01-31T09:00:00Z');
  data.processTradeData(csv); assert.equal(data.allTrades.length, 2);
});
contract('symbol-prefix', 'Only a trailing * enables prefix matching; exact symbols stay exact', async h => {
  const data = await seed(h, [trade({ TransactionID: '1', Symbol: 'SYN' }), trade({ TransactionID: '2', Symbol: 'SYN 250131C00100' }), trade({ TransactionID: '3', Symbol: 'XSYN' })]);
  assert.deepEqual(ids(data.filterTradesBySymbol('SYN')), ['1']); assert.deepEqual(ids(data.filterTradesBySymbol('SYN*')), ['1', '2']);
  assert.deepEqual(ids(data.filterTradesBySymbol('*SYN')), []); assert.equal(data.filterTradesBySymbol('*').length, 3);
});
contract('inclusive-date-filter', 'Explicit dates include both endpoints and exclude adjoining months', async h => {
  const data = await seed(h, ['2025-01-31', '2025-02-01', '2025-02-28', '2025-03-01'].map((date, i) => trade({ TransactionID: String(i), TradeDate: date })));
  assert.deepEqual(ids(data.filterTradesByDateRange(localDay(h, '2025-02-01'), localDay(h, '2025-02-28'))), ['1', '2']);
  assert.deepEqual(ids(data.filterTradesByDateRange(localDay(h, '2025-02-28'), localDay(h, '2025-02-28'))), ['2']);
});
contract('saved-date-range', 'Date range choice round-trips without altering trades', async h => {
  const data = await seed(h, [trade()]); const before = h.localStorage.getItem('trades');
  data.saveDateRangeSelection(localDay(h, '2025-01-01'), localDay(h, '2025-01-31'), 'custom');
  const restored = data.getSavedDateRangeSelection(); assert.equal(restored.range, 'custom'); assert.equal(restored.startDate.getDate(), 1); assert.equal(restored.endDate.getDate(), 31);
  assert.equal(h.localStorage.getItem('trades'), before);
  h.localStorage.setItem('pnlSelectedDateRange', '{broken'); assert.equal(data.getSavedDateRangeSelection(), null);
});
for (const [preset, outside] of [['thisMonth', '2025-02-01'], ['lastMonth', '2025-01-01'], ['thisQuarter', '2025-04-01']]) {
  legacy(`preset-${preset}`, `${preset} excludes the first day of the next period`, async h => {
    const data = await seed(h, [trade({ TradeDate: outside })]); data.setDateRange(preset); assert.equal(data.filteredTrades.length, 0);
  });
}
legacy('preset-week-month-boundary', 'This-week preset ends six days after its start across a month boundary', async (unused, opts) => {
  const h = await harness({ ...opts, now: '2025-11-01T12:00:00Z' }); const data = await seed(h, [trade({ TradeDate: '2025-11-02' })]);
  data.setDateRange('thisWeek'); assert.equal(h.el('endDate').value, '2025-11-01'); assert.equal(data.filteredTrades.length, 0);
});
contract('monthly-stat-boundary', 'Monthly statistics handle leap days and exclude neighboring months', async h => {
  await seed(h, [trade({ TradeDate: '2024-02-29', FifoPnlRealized: '7' }), trade({ TransactionID: 'march', TradeDate: '2024-03-01', FifoPnlRealized: '50' })]);
  const stats = await h.load('stats.js'); assert.equal(stats.getMonthlyStats(2024, 1).pnL, 7); assert.equal(stats.getMonthlyStats(2024, 1).days, 1);
});
contract('log-template-schema', 'Daily and weekly log schema keeps every original field', async h => {
  const logs = await h.load('logs.js'); const fixture = completeLog();
  assert.deepEqual(Object.keys(plain(logs.LOG_TEMPLATE)).sort(), ['id', ...Object.keys(fixture), 'createdAt', 'updatedAt'].sort());
});
for (const type of ['daily', 'weekly']) {
  contract(`log-crud-${type}`, `${type} logs preserve all fields through create, read, update, storage reload and delete`, async h => {
    const logs = await h.load('logs.js'); const fixture = completeLog(type); const id = logs.createOrUpdateLog(fixture);
    const log = logs.getLogByDate(fixture.date, type); assert.equal(log.id, id);
    for (const [key, value] of Object.entries(fixture)) assert.deepEqual(plain(log[key]), value, key);
    assert.ok(log.createdAt); assert.ok(log.updatedAt);
    logs.createOrUpdateLog({ id, factRecord: 'Edited synthetic fact' }); assert.equal(logs.allLogs.length, 1);
    assert.equal(logs.getLogByDate(fixture.date, type).factRecord, 'Edited synthetic fact');
    await logs.loadLogs(); const restored = logs.getLogByDate(fixture.date, type);
    assert.deepEqual(plain(restored.nextWeekOptimization), fixture.nextWeekOptimization); assert.deepEqual(plain(restored.associatedTrades), fixture.associatedTrades);
    assert.equal(logs.deleteLog(id), true); assert.equal(logs.deleteLog(id), false); assert.equal(logs.getLogByDate(fixture.date, type), undefined);
    assert.deepEqual(JSON.parse(h.localStorage.getItem('logs')), []);
  });
}
contract('log-associations', 'Trade association add/remove/batch operations deduplicate and persist', async h => {
  const logs = await h.load('logs.js'); const id = logs.createOrUpdateLog({ date: '2025-01-31', type: 'daily', associatedTrades: [] });
  logs.associateTradeToLog(id, 'a'); logs.associateTradeToLog(id, 'a'); logs.associateDailyTradesToLog('2025-01-31', [trade({ TransactionID: 'a' }), trade({ TransactionID: 'b' }), trade({ TransactionID: '' })]);
  assert.deepEqual(plain(logs.getLogByDate('2025-01-31').associatedTrades), ['a', 'b']);
  logs.disassociateTradeFromLog(id, 'a'); assert.deepEqual(JSON.parse(h.localStorage.getItem('logs'))[0].associatedTrades, ['b']);
});
legacy('independent-log-associations', 'Creating a second log does not share the first log association array', async h => {
  const logs = await h.load('logs.js'); const a = logs.createOrUpdateLog({ date: '2025-01-30', type: 'daily' });
  logs.createOrUpdateLog({ date: '2025-01-31', type: 'daily' }); logs.associateTradeToLog(a, 'only-log-a');
  assert.deepEqual(plain(logs.getLogByDate('2025-01-31').associatedTrades), []);
});
legacy('independent-log-nested-fields', 'Template nested quickReview and weekly fields are independent across logs', async h => {
  const logs = await h.load('logs.js'); logs.createOrUpdateLog({ date: '2025-01-30', type: 'weekly' }); logs.createOrUpdateLog({ date: '2025-01-31', type: 'weekly' });
  logs.getLogByDate('2025-01-30', 'weekly').quickReview.overallFeeling = 1;
  logs.getLogByDate('2025-01-30', 'weekly').nextWeekOptimization.goodHabitToKeep = 'only-log-a';
  assert.equal(logs.getLogByDate('2025-01-31', 'weekly').quickReview.overallFeeling, 3);
  assert.equal(logs.getLogByDate('2025-01-31', 'weekly').nextWeekOptimization.goodHabitToKeep, '');
});
contract('log-range-weekly-lookup', 'Log date queries are inclusive, newest first, and weekly lookup spans seven days', async h => {
  const logs = await h.load('logs.js');
  for (const date of ['2025-01-26', '2025-01-27', '2025-01-31', '2025-02-01']) logs.createOrUpdateLog({ date, type: date === '2025-02-01' ? 'weekly' : 'daily', associatedTrades: [] });
  assert.deepEqual(plain(logs.getLogsByDateRange('2025-01-27', '2025-01-31').map(l => l.date)), ['2025-01-31', '2025-01-27']);
  assert.equal(logs.getWeeklyLog(new h.Date('2025-01-27T00:00:00Z')).date, '2025-02-01');
});
contract('malformed-log-storage', 'Invalid log JSON is handled safely', async h => {
  h.localStorage.setItem('logs', '{invalid'); const logs = await h.load('logs.js'); assert.deepEqual(plain(logs.loadLogsFromStorage()), []);
});
legacy('weekly-auto-stats', 'Weekly review auto-fields use imported closed trades Monday–Friday across month boundaries', async h => {
  await seed(h, [trade({ TransactionID: 'open', TradeDate: '2025-01-31', 'Open/CloseIndicator': 'O', FifoPnlRealized: '999' }), trade({ TransactionID: 'a', TradeDate: '2025-01-27', FifoPnlRealized: '10' }), trade({ TransactionID: 'b', TradeDate: '2025-01-31', FifoPnlRealized: '-4' }), trade({ TransactionID: 'sat', TradeDate: '2025-02-01', FifoPnlRealized: '1000' }), trade({ TransactionID: 'sun', TradeDate: '2025-02-02', FifoPnlRealized: '2000' })]);
  const logUI = await h.load('log-ui.js'); const stats = logUI.__computeWeeklyAutoStats('2025-02-01');
  assert.deepEqual(plain(stats), { totalTrades: 2, pnlResult: 6, maxWin: 10, maxLoss: -4, winRate: 50, followsDailyLimit: true });
  assert.deepEqual(ids(logUI.__getTradesForLog('2025-02-01', 'weekly').trades), ['open', 'a', 'b']);
});
contract('weekly-daily-limit', 'Weekly review flags more than three closed TransactionIDs on one day', async h => {
  await seed(h, [1, 2, 3, 4].map(n => trade({ TransactionID: String(n) })));
  const logUI = await h.load('log-ui.js'); assert.equal(logUI.__computeWeeklyAutoStats('2025-02-01').followsDailyLimit, false);
});

function fillForm(h, type = 'daily') {
  const values = { logDate: '2025-01-31', logType: type, tradeCount: '2', feelScore: '4', facts: 'Synthetic facts', learnings: 'Synthetic learning', improvements: 'Synthetic improvement', affirmations: 'Synthetic affirmation', linkedTrades: 'synthetic-open, synthetic-close', plannedTrades: 'Synthetic planned', emotionalStability: 'Synthetic stable', goodHabitToKeep: 'Synthetic habit', mistakeToAvoid: 'Synthetic mistake', specificActions: 'Action one\nAction two', weeklyAffirmation: 'Synthetic weekly affirmation' };
  for (const [id, value] of Object.entries(values)) h.el(id).value = value;
  for (const id of ['violatedPlans', 'emotionalFactors']) h.el(id).options[0].selected = true;
}
for (const type of ['daily', 'weekly']) {
  contract(`form-submit-${type}`, `${type} review form explicitly saves and reopens all editable fields`, async h => {
    await seed(h, [trade({ TransactionID: 'synthetic-close' }), trade({ TransactionID: 'synthetic-open', 'Open/CloseIndicator': 'O' })]);
    const logs = await h.load('logs.js'), logUI = await h.load('log-ui.js'); logUI.initLogUI(); fillForm(h, type);
    await h.el('logForm').dispatch('submit'); const saved = logs.getLogByDate('2025-01-31', type);
    assert.ok(saved); assert.equal(saved.quickReview.tradesCount, 2); assert.equal(saved.quickReview.overallFeeling, 4);
    assert.equal(saved.factRecord, 'Synthetic facts'); assert.equal(saved.learningPoints, 'Synthetic learning'); assert.equal(saved.improvementDirection, 'Synthetic improvement'); assert.equal(saved.selfAffirmation, 'Synthetic affirmation');
    assert.deepEqual(plain(saved.associatedTrades), ['synthetic-open', 'synthetic-close']);
    if (type === 'weekly') {
      assert.equal(saved.weeklyData.pnlResult, 12.34); assert.equal(saved.weeklyData.totalTrades, 1);
      assert.equal(saved.successExperiences.plannedTrades, 'Synthetic planned'); assert.equal(saved.successExperiences.emotionalStability, 'Synthetic stable');
      assert.deepEqual(plain(saved.mistakeSummary.violatedPlans), [h.el('violatedPlans').options[0].value]);
      assert.deepEqual(plain(saved.mistakeSummary.emotionalFactors), [h.el('emotionalFactors').options[0].value]);
      assert.equal(saved.nextWeekOptimization.goodHabitToKeep, 'Synthetic habit'); assert.equal(saved.nextWeekOptimization.mistakeToAvoid, 'Synthetic mistake'); assert.equal(saved.nextWeekOptimization.specificActions, 'Action one\nAction two'); assert.equal(saved.weeklyAffirmation, 'Synthetic weekly affirmation');
    }
    logUI.openLogModal('2025-01-31', type); assert.equal(h.el('facts').value, saved.factRecord); assert.equal(h.el('linkedTrades').value, saved.associatedTrades.join(','));
    if (type === 'weekly') assert.equal(h.el('specificActions').value, 'Action one\nAction two');
    h.el('facts').value = 'Edited through form'; await h.el('logForm').dispatch('submit'); assert.equal(logs.allLogs.length, 1); assert.equal(logs.allLogs[0].factRecord, 'Edited through form');
    logUI.openLogModal('2025-01-31', type); await h.el('deleteLogBtn').dispatch('click'); assert.equal(logs.allLogs.length, 0);
  });
}
contract('ai-config', 'AI configuration saves and reopens URL/model/session/templates without touching logs or trades', async h => {
  await seed(h, [trade()]); const logs = await h.load('logs.js'); logs.createOrUpdateLog(completeLog());
  const before = { trades: h.localStorage.getItem('trades'), logs: h.localStorage.getItem('logs') };
  const ai = await h.load('ai-review.js'); ai.initAIReviewUI();
  for (const [id, value] of Object.entries({ aiUrl: 'https://synthetic.invalid///', aiToken: ' synthetic-test-token ', aiModel: ' synthetic-model ', aiDailyTemplate: 'Daily {{orders_count}}', aiWeeklyTemplate: 'Weekly {{orders_count}}' })) h.el(id).value = value;
  h.el('aiNewSession').checked = false; await h.el('saveAiConfigBtn').dispatch('click');
  const saved = JSON.parse(h.localStorage.getItem('aiReviewConfig'));
  assert.deepEqual(saved, { url: 'https://synthetic.invalid', token: 'synthetic-test-token', model: 'synthetic-model', isNewSession: false, dailyTemplate: 'Daily {{orders_count}}', weeklyTemplate: 'Weekly {{orders_count}}' });
  h.el('aiUrl').value = ''; await h.el('aiConfigBtn').dispatch('click'); assert.equal(h.el('aiUrl').value, saved.url); assert.equal(h.el('aiNewSession').checked, false);
  assert.equal(h.localStorage.getItem('trades'), before.trades); assert.equal(h.localStorage.getItem('logs'), before.logs); assert.equal(h.fetchCalls.length, 0);
});
contract('ai-health-check', 'AI health test uses a synthetic request and reports status', async h => {
  const ai = await h.load('ai-review.js'); ai.initAIReviewUI(); h.el('aiUrl').value = 'https://synthetic.invalid/'; h.el('aiToken').value = 'synthetic-test-token';
  h.setFetch(async () => ({ ok: true, json: async () => ({ status: 'ok' }) })); await h.el('testAiConfigBtn').dispatch('click');
  assert.equal(h.fetchCalls[0][0], 'https://synthetic.invalid/healthz'); assert.equal(h.fetchCalls[0][1].method, 'GET'); assert.ok(h.el('aiConfigStatus').classList.contains('success'));
});
for (const type of ['daily', 'weekly']) {
  contract(`ai-draft-${type}`, `${type} AI generation only fills a draft; explicit form submit persists it`, async h => {
    await seed(h, [trade(), trade({ TransactionID: 'open', 'Open/CloseIndicator': 'O', FifoPnlRealized: '987654' })]);
    const logs = await h.load('logs.js'), logUI = await h.load('log-ui.js'), ai = await h.load('ai-review.js'); logUI.initLogUI(); ai.initAIReviewUI(); fillForm(h, type);
    h.localStorage.setItem('aiReviewConfig', JSON.stringify({ url: 'https://synthetic.invalid', token: 'synthetic-test-token', model: 'synthetic-model' }));
    const result = { overall_feeling: 5, fact_record: 'AI synthetic fact', learning_points: 'AI synthetic learning', improvement_direction: 'AI synthetic improvement', self_affirmation: 'AI synthetic affirmation', planned_trades: 'AI plan', emotional_stability: 'AI stable', violated_plans: [h.el('violatedPlans').options[0].value], emotional_factors: [h.el('emotionalFactors').options[0].value], good_habit_to_keep: 'AI habit', mistake_to_avoid: 'AI mistake', specific_actions: ['AI action one', 'AI action two'], weekly_affirmation: 'AI weekly affirmation' };
    h.setFetch(async () => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ content: JSON.stringify(result) }) }));
    const before = h.localStorage.getItem('logs'); await h.el('generateAiLogBtn').dispatch('click');
    assert.equal(logs.allLogs.length, 0); assert.equal(h.localStorage.getItem('logs'), before); assert.equal(h.el('facts').value, 'AI synthetic fact'); assert.equal(h.el('feelScore').value, '5');
    assert.equal(h.el('generateAiLogBtn').disabled, false); assert.equal(h.fetchCalls.length, 1);
    const request = JSON.parse(h.fetchCalls[0][1].body); const csv = Buffer.from(request.messages[0].attachments[0].data.split(',')[1], 'base64').toString('utf8');
    assert.match(csv, /12\.34/); assert.doesNotMatch(csv, /987654/); assert.equal(request.model, 'synthetic-model');
    if (type === 'weekly') assert.equal(h.el('specificActions').value, 'AI action one\nAI action two');
    await h.el('logForm').dispatch('submit'); const saved = logs.getLogByDate('2025-01-31', type); assert.equal(saved.factRecord, 'AI synthetic fact');
    if (type === 'weekly') { assert.equal(saved.nextWeekOptimization.specificActions, 'AI action one\nAI action two'); assert.equal(saved.weeklyAffirmation, 'AI weekly affirmation'); }
  });
}
contract('ai-generation-error', 'AI errors keep saved logs intact and restore the generation button', async h => {
  const logs = await h.load('logs.js'); logs.createOrUpdateLog(completeLog()); const before = h.localStorage.getItem('logs');
  const ai = await h.load('ai-review.js'); ai.initAIReviewUI(); fillForm(h); h.setFetch(async () => ({ ok: false, status: 503, text: async () => 'Synthetic offline' }));
  await h.el('generateAiLogBtn').dispatch('click'); assert.equal(h.localStorage.getItem('logs'), before); assert.equal(h.el('generateAiLogBtn').disabled, false); assert.match(h.el('aiGenerateError').textContent, /503/);
});

async function renderJanuary(h) { const calendar = await h.load('calendar.js'); calendar.currentDate.setUTCFullYear(2025, 0, 15); calendar.renderCalendar(); return { calendar, cells: h.el('calendar').children }; }
contract('desktop-calendar', 'Desktop calendar renders seven weekday headers, every date, and weekly summaries', async h => {
  const { cells } = await renderJanuary(h); const headers = cells.filter(c => c.classList.contains('calendar-header'));
  assert.equal(headers.length, 8);
  const labels = headers.map(c => c.textContent.trim());
  assert.ok(labels.every((label, i) => [['Sun', '周日'], ['Mon', '周一'], ['Tue', '周二'], ['Wed', '周三'], ['Thu', '周四'], ['Fri', '周五'], ['Sat', '周六'], ['Weekly', '周汇总']][i].includes(label)), JSON.stringify(labels));
  assert.equal(cells.filter(c => c.classList.contains('calendar-day')).length, 31); assert.equal(cells.filter(c => c.classList.contains('week-summary')).length, 5);
});
ui('month-navigation', 'January 31 navigates to February, then back to January without skipping a month', async h => {
  const calendar = await h.load('calendar.js'); calendar.currentDate.setUTCFullYear(2025, 0, 31); calendar.navigateMonth(1);
  assert.equal(calendar.currentDate.getMonth(), 1); assert.equal(calendar.currentDate.getDate(), 1);
  calendar.navigateMonth(-1); assert.equal(calendar.currentDate.getMonth(), 0);
});
for (const width of [375, 700, 701]) {
  ui(`responsive-${width}`, `${width}px preserves all date nodes and Weekly; weekends are a CSS-only visibility choice`, async (unused, opts) => {
    const h = await harness({ ...opts, width }); const { cells } = await renderJanuary(h);
    assert.equal(cells.filter(c => c.classList.contains('calendar-header')).length, 8);
    const days = cells.filter(c => c.classList.contains('calendar-day')); assert.equal(days.length, 31); assert.equal(cells.filter(c => c.classList.contains('week-summary')).length, 5);
    for (const day of days) { const weekday = new Date(`${day.dataset.date}T00:00:00Z`).getUTCDay(); assert.equal(day.classList.contains('weekend'), weekday === 0 || weekday === 6, day.dataset.date); }
  });
}
ui('mobile-css-contract', 'Styles hide only weekend-marked calendar cells at max-width 700px and retain Weekly', async h => {
  // Structural CSS contract only; browser visual checks remain separate.
  const styles = [...h.source('index.html').matchAll(/<link\b[^>]*href="([^"]+\.css(?:\?[^"]*)?)"[^>]*>/g)].map(m => m[1]);
  const css = styles.map(file => h.source(file)).join('\n'); const blocks = [];
  for (const match of css.matchAll(/@media\s*\(max-width:\s*700px\)\s*\{/g)) {
    let depth = 1, end = match.index + match[0].length;
    for (; end < css.length && depth; end++) { if (css[end] === '{') depth++; if (css[end] === '}') depth--; }
    blocks.push(css.slice(match.index, end));
  }
  assert.ok(blocks.some(b => /\.weekend[^{}]*\{[^{}]*display:\s*none/s.test(b)), '700px weekend display:none rule');
  assert.ok(blocks.some(b => /\.week-summary[^{}]*\{[^{}]*grid-column:\s*1\s*\/\s*-1/s.test(b)), 'Weekly spans the mobile row');
  assert.ok(!blocks.some(b => /\.week-summary[^{}]*\{[^{}]*display:\s*none/s.test(b)), 'Weekly must stay visible');
});
ui('theme-data-isolation', 'All six themes change only the theme setting, leaving trades/logs/AI/R2 data untouched', async h => {
  const data = await seed(h, [trade()]); const logs = await h.load('logs.js'); logs.createOrUpdateLog(completeLog());
  h.localStorage.setItem('aiReviewConfig', JSON.stringify({ url: 'https://synthetic.invalid', token: 'synthetic-test-token', model: 'synthetic-model' }));
  h.localStorage.setItem('r2Config', JSON.stringify({ enabled: false, url: 'https://synthetic.invalid', token: 'synthetic-test-token' }));
  const before = h.snapshot(), tradeState = plain(data.allTrades), logState = plain(logs.allLogs);
  const themes = await h.load('themes.js'); assert.deepEqual(plain(themes.THEME_IDS), ['forest', 'graphite', 'plum', 'ivory', 'amber', 'teal']);
  for (const theme of themes.THEME_IDS) {
    themes.applyTheme(theme); assert.equal(h.document.documentElement.dataset.theme, theme); assert.equal(h.localStorage.getItem('pnlCalendarTheme'), theme);
    for (const [key, value] of Object.entries(before)) assert.equal(h.localStorage.getItem(key), value, key);
    assert.deepEqual(plain(data.allTrades), tradeState); assert.deepEqual(plain(logs.allLogs), logState);
  }
  assert.equal(h.fetchCalls.length, 0);
});

ui('filter-intersection-date-first', 'Date then symbol filtering intersects without changing original trades', async h => {
  const data = await seed(h, [trade({ TransactionID: 'wanted', Symbol: 'SYN-OPT' }), trade({ TransactionID: 'wrong-date', Symbol: 'SYN-OPT', TradeDate: '2025-02-01' }), trade({ TransactionID: 'wrong-symbol', Symbol: 'OTHER' })]);
  const original = plain(data.allTrades), persisted = h.localStorage.getItem('trades');
  data.filterTradesByDateRange(localDay(h, '2025-01-31'), localDay(h, '2025-01-31'));
  assert.deepEqual(ids(data.filterTradesBySymbol('SYN*')), ['wanted']);
  assert.deepEqual(plain(data.allTrades), original); assert.equal(h.localStorage.getItem('trades'), persisted);
});
ui('filter-intersection-symbol-first', 'Symbol then date filtering gives the same intersection and reset restores all records', async h => {
  const data = await seed(h, [trade({ TransactionID: 'wanted', Symbol: 'SYN-OPT' }), trade({ TransactionID: 'wrong-date', Symbol: 'SYN-OPT', TradeDate: '2025-02-01' }), trade({ TransactionID: 'wrong-symbol', Symbol: 'OTHER' })]);
  const original = plain(data.allTrades), persisted = h.localStorage.getItem('trades');
  data.filterTradesBySymbol('SYN*');
  assert.deepEqual(ids(data.filterTradesByDateRange(localDay(h, '2025-01-31'), localDay(h, '2025-01-31'))), ['wanted']);
  assert.equal(data.clearTradeFilters().length, 3); assert.deepEqual(plain(data.allTrades), original); assert.equal(h.localStorage.getItem('trades'), persisted);
});
ui('clear-symbol-keeps-date', 'Clearing a symbol keeps the selected dates and raw storage unchanged', async h => {
  const data = await seed(h, [trade({ TransactionID: 'a', Symbol: 'ONE' }), trade({ TransactionID: 'b', Symbol: 'TWO' }), trade({ TransactionID: 'out', TradeDate: '2025-02-01' })]);
  const persisted = h.localStorage.getItem('trades'); data.filterTradesByDateRange(localDay(h, '2025-01-31'), localDay(h, '2025-01-31')); data.filterTradesBySymbol('ONE');
  assert.deepEqual(ids(data.filterTradesBySymbol('')), ['a', 'b']); assert.equal(h.localStorage.getItem('trades'), persisted);
});
ui('ytd-preset', 'Year-to-date stops today rather than including future dates', async h => {
  const data = await seed(h, [trade(), trade({ TransactionID: 'future', TradeDate: '2025-02-01' })]); data.setDateRange('ytd');
  assert.deepEqual(ids(data.filteredTrades), ['synthetic-close-1']); assert.equal(h.el('endDate').value, '2025-01-31');
});
ui('last30Days-preset', 'Last 30 days is 30 inclusive calendar dates, ending today', async h => {
  const data = await seed(h, [trade({ TransactionID: 'too-early', TradeDate: '2025-01-01' }), trade({ TransactionID: 'start', TradeDate: '2025-01-02' }), trade({ TransactionID: 'end', TradeDate: '2025-01-31' }), trade({ TransactionID: 'future', TradeDate: '2025-02-01' })]);
  data.setDateRange('last30Days'); assert.deepEqual(ids(data.filteredTrades), ['start', 'end']); assert.equal(h.el('startDate').value, '2025-01-02'); assert.equal(h.el('endDate').value, '2025-01-31');
});
ui('date-input-local-label', 'Month preset input labels keep the local first and last calendar dates', async h => {
  const data = await h.load('data.js'); data.setDateRange('thisMonth'); assert.equal(h.el('startDate').value, '2025-01-01'); assert.equal(h.el('endDate').value, '2025-01-31');
});
legacy('ai-week-range-timezone', 'AI weekly period is Monday–Friday in every tested timezone', async h => {
  const ai = await h.load('ai-review.js'); assert.deepEqual(plain(ai.__getWeekRange('2025-02-01')), { weekStartStr: '2025-01-27', weekEndStr: '2025-01-31' });
});
ui('mobile-retains-weekend-data', 'Mobile hides presentation only: weekend P&L, weekly totals and journals remain intact', async (unused, opts) => {
  const h = await harness({ ...opts, width: 375 });
  const data = await seed(h, [trade({ TransactionID: 'sat', TradeDate: '2025-01-04', FifoPnlRealized: '17' }), trade({ TransactionID: 'sun', TradeDate: '2025-01-05', FifoPnlRealized: '-3' })]);
  const logs = await h.load('logs.js'); logs.createOrUpdateLog({ ...completeLog(), date: '2025-01-04' });
  const beforeTrades = plain(data.allTrades), beforeLogs = plain(logs.allLogs), persisted = h.snapshot();
  const { cells } = await renderJanuary(h); assert.match(h.el('monthlyPnL').textContent, /14\.00/);
  assert.ok(cells.find(c => c.dataset.date === '2025-01-04')?.classList.contains('weekend'));
  const summaries = cells.filter(c => c.classList.contains('week-summary')).map(c => c.textContent);
  assert.ok(summaries.some(text => text.includes('17.00'))); assert.ok(summaries.some(text => text.includes('-3.00')));
  assert.deepEqual(plain(data.allTrades), beforeTrades); assert.deepEqual(plain(logs.allLogs), beforeLogs); assert.deepEqual(h.snapshot(), persisted);
});
ui('theme-no-persist-invalid', 'Theme validation and session-only application do not change persisted state', async h => {
  const themes = await h.load('themes.js'); h.localStorage.setItem('pnlCalendarTheme', 'amber');
  const before = h.snapshot(); assert.equal(themes.applyTheme('plum', { persist: false }), 'plum'); assert.deepEqual(h.snapshot(), before);
  assert.equal(themes.applyTheme('unknown-theme'), 'forest'); assert.equal(h.document.documentElement.dataset.theme, 'forest');
});
ui('theme-buttons', 'Theme choice buttons call the real handler and update accessibility state', async h => {
  const themes = await h.load('themes.js'); const buttons = h.document.querySelectorAll('[data-theme-choice]'); assert.equal(buttons.length, 6);
  themes.initThemes(); for (const button of buttons) { await button.dispatch('click'); assert.equal(h.document.documentElement.dataset.theme, button.dataset.themeChoice); assert.equal(button.getAttribute('aria-pressed'), 'true'); }
});
ui('view-navigation', 'Calendar, analytics and journal navigation retain all data', async h => {
  const data = await seed(h, [trade()]), logs = await h.load('logs.js'); logs.createOrUpdateLog(completeLog());
  const before = h.snapshot(), beforeTrades = plain(data.allTrades), beforeLogs = plain(logs.allLogs);
  const shell = await h.load('ui-shell.js'); shell.initUIShell();
  for (const view of ['analytics', 'journal', 'calendar']) {
    const button = h.document.querySelectorAll('.app-nav [data-view]').find(b => b.dataset.view === view); assert.ok(button); await button.dispatch('click');
    assert.equal(h.el(`${view}View`).hidden, false); assert.equal(button.getAttribute('aria-current'), 'page');
    assert.deepEqual(h.snapshot(), before); assert.deepEqual(plain(data.allTrades), beforeTrades); assert.deepEqual(plain(logs.allLogs), beforeLogs);
  }
});

legacy('monthly-dst-boundary', 'Monthly statistics count each UTC trade date once across daylight-saving transitions', async h => {
  await seed(h, [trade({ TransactionID: 'dst-day', TradeDate: '2025-03-09', FifoPnlRealized: '7' }), trade({ TransactionID: 'month-end', TradeDate: '2025-03-31', FifoPnlRealized: '3' })]);
  const stats = await h.load('stats.js'); assert.equal(stats.getMonthlyStats(2025, 2).pnL, 10); assert.equal(stats.getMonthlyStats(2025, 2).days, 2);
});
export default cases;
