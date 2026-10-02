import { setMessage, setAttributeMessage } from './i18n.js';
import { initThemes } from './themes.js';
import { openLogSidebar, closeLogSidebar, openLogModal } from './log-ui.js';
import { chartInstances, updateStatistics } from './stats.js';

export function selectView(view) {
    if (!['calendar', 'analytics', 'journal'].includes(view)) view = 'calendar';
    document.querySelectorAll('.view-panel').forEach(panel => { panel.hidden = panel.id !== `${view}View`; });
    document.querySelectorAll('.app-nav [data-view]').forEach(button => {
        const active = button.dataset.view === view;
        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
    document.getElementById('summaryStrip').hidden = view === 'journal';
    if (view === 'journal') openLogSidebar(); else closeLogSidebar();
    if (view === 'analytics') requestAnimationFrame(() => Object.values(chartInstances).forEach(chart => chart?.resize()));
}

function applyChartTheme() {
    const styles = getComputedStyle(document.documentElement);
    const token = name => styles.getPropertyValue(name).trim();
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = token('--muted');
    Chart.defaults.borderColor = token('--line');
    Object.values(chartInstances).forEach(chart => {
        if (!chart?.options) return;
        for (const scale of Object.values(chart.options.scales || {})) {
            if (scale.ticks) scale.ticks.color = token('--muted');
            if (scale.grid) scale.grid.color = token('--line');
        }
        if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = token('--muted');
        chart.update('none');
    });
}

export function initUIShell() {
    initThemes();
    document.addEventListener('pnl:themechange', () => { updateStatistics(); applyChartTheme(); });
    applyChartTheme();
    document.querySelectorAll('.app-nav [data-view]').forEach(button => button.addEventListener('click', () => selectView(button.dataset.view)));
    document.querySelector('.app-brand').addEventListener('click', event => { event.preventDefault(); selectView('calendar'); });
    document.getElementById('closeLogSidebar').addEventListener('click', () => selectView('calendar'));
    const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    document.getElementById('newDailyLogBtn').addEventListener('click', () => openLogModal(today(), 'daily'));
    document.getElementById('newWeeklyLogBtn').addEventListener('click', () => openLogModal(today(), 'weekly'));
    const settings = document.getElementById('settingsDialog');
    document.getElementById('settingsBtn').addEventListener('click', () => settings.showModal());
    document.getElementById('closeSettingsBtn').addEventListener('click', () => settings.close());
    settings.addEventListener('click', event => { if (event.target === settings) settings.close(); });
    ['aiConfigBtn', 'configR2Btn'].forEach(id => document.getElementById(id).addEventListener('click', () => settings.close()));
    document.getElementById('closeImportModalBtn').addEventListener('click', () => { document.getElementById('importModal').style.display = 'none'; });
    const more = document.getElementById('expandMetricsBtn');
    more.addEventListener('click', () => {
        const expanded = more.getAttribute('aria-expanded') !== 'true';
        more.setAttribute('aria-expanded', String(expanded));
        setMessage(more, expanded ? '收起辅助信息' : '展开辅助信息');
        document.getElementById('summaryStrip').classList.toggle('metrics-expanded', expanded);
    });
    document.querySelectorAll('.fullscreen-btn').forEach(button => button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); }
    }));
    document.querySelectorAll('.close, .close-button').forEach(button => {
        if (!button.getAttribute('aria-label')) setAttributeMessage(button, 'aria-label', '关闭');
        if (button.tagName === 'BUTTON') return;
        button.setAttribute('role', 'button'); button.tabIndex = 0;
        setAttributeMessage(button, 'aria-label', '关闭');
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); }
        });
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || settings.open) return;
        const closeIds = ['closeLogModal', 'closeAiConfigModal', 'closeTradeModalBtn', 'closeImportModalBtn'];
        for (const id of closeIds) {
            const button = document.getElementById(id);
            const modal = button?.closest('.modal, .trade-modal, .import-modal');
            if (modal && !modal.classList.contains('hidden') && getComputedStyle(modal).display !== 'none') { button.click(); return; }
        }
        for (const id of ['statModal', 'chartModal']) {
            const modal = document.getElementById(id);
            if (modal?.style.display === 'flex') { modal.querySelector('.close-button')?.click(); return; }
        }
        document.getElementById('dateRangePicker').classList.remove('active');
        document.getElementById('symbolDropdown').classList.remove('active');
    });
    selectView('calendar');
}
