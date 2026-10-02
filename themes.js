// Appearance is isolated from trading, journal, filter and connection state.
export const THEME_IDS = Object.freeze(['forest', 'graphite', 'plum', 'ivory', 'amber', 'teal']);
export const THEME_STORAGE_KEY = 'pnlCalendarTheme';

export function applyTheme(theme, { persist = true } = {}) {
    const selected = THEME_IDS.includes(theme) ? theme : 'forest';
    document.documentElement.dataset.theme = selected;
    if (persist) {
        try { localStorage.setItem(THEME_STORAGE_KEY, selected); } catch (_) { /* Session-only when storage is unavailable. */ }
    }
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.themeChoice === selected));
    });
    document.dispatchEvent(new CustomEvent('pnl:themechange', { detail: { theme: selected } }));
    return selected;
}

export function initThemes() {
    applyTheme(document.documentElement.dataset.theme || 'forest', { persist: false });
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
        button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
    });
}
