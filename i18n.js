import { MESSAGES } from './messages.js?v=20261002-i18n2';

export const LOCALE_STORAGE_KEY = 'pnlCalendarLocale';
export const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'en']);
const FALLBACK_LOCALE = 'zh-CN';
let locale = FALLBACK_LOCALE;

export function normalizeLocale(value) {
    if (typeof value !== 'string') return FALLBACK_LOCALE;
    if (/^en(?:-|$)/i.test(value)) return 'en';
    if (/^zh(?:-|$)/i.test(value)) return 'zh-CN';
    return FALLBACK_LOCALE;
}

export function getLocale() { return locale; }
export function getIntlLocale() { return locale === 'en' ? 'en-US' : 'zh-CN'; }

export function t(key, params = {}) {
    const entry = MESSAGES[key];
    const singular = Number(params.count) === 1 ? entry?.[`${locale}_one`] : null;
    const copy = singular ?? entry?.[locale] ?? entry?.[FALLBACK_LOCALE] ?? key;
    return copy.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? (params[name]?.__pnlMessage ? t(params[name].__pnlMessage, params[name].params) : String(params[name])) : match);
}

export function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

// Only explicitly marked interface labels are updated. Never traverse or translate
// arbitrary user text, form values, symbols, persisted enum values or AI prompts.
export function messageHTML(key, params = {}) {
    const encoded = encodeURIComponent(JSON.stringify(params));
    return `<span data-i18n="${escapeHTML(key)}" data-i18n-params="${encoded}">${escapeHTML(t(key, params))}</span>`;
}

export function setMessage(element, key, params = {}) {
    if (!element) return;
    element.setAttribute('data-i18n', key);
    element.setAttribute('data-i18n-params', encodeURIComponent(JSON.stringify(params)));
    element.textContent = t(key, params);
}

export function setAttributeMessage(element, attribute, key, params = {}) {
    if (!element) return;
    element.setAttribute(`data-i18n-${attribute}`, key);
    element.setAttribute(`data-i18n-${attribute}-params`, encodeURIComponent(JSON.stringify(params)));
    element.setAttribute(attribute, t(key, params));
}

function readParams(element, attribute = 'data-i18n-params') {
    try { return JSON.parse(decodeURIComponent(element.getAttribute(attribute) || '%7B%7D')); }
    catch (_) { return {}; }
}

export function translatePage(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(element => {
        element.textContent = t(element.getAttribute('data-i18n'), readParams(element));
    });
    for (const attribute of ['title', 'placeholder', 'aria-label']) {
        root.querySelectorAll(`[data-i18n-${attribute}]`).forEach(element => {
            element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`), readParams(element, `data-i18n-${attribute}-params`)));
        });
    }
    root.querySelectorAll('[data-i18n-date]').forEach(element => {
        element.textContent = formatDate(element.getAttribute('data-i18n-date'), readParams(element, 'data-i18n-date-options'));
    });
    // This one opt-in readonly field is presentation, never a saved enum value.
    root.querySelectorAll('[data-i18n-readonly]').forEach(element => {
        element.value = t(element.getAttribute('data-i18n-readonly'));
    });
}

export function formatDate(value, options = {}) {
    // IB exports may use YYYY/MM/DD as well as ISO date-only strings. Both are
    // civil dates, never local-midnight instants; formatting must not move a day.
    const civil = typeof value === 'string' && /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
    const dayLabel = typeof value === 'string' && /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) ([A-Z][a-z]{2}) (\d{1,2}) (\d{4})$/.exec(value);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const date = dayLabel ? new Date(Date.UTC(Number(dayLabel[3]), months.indexOf(dayLabel[1]), Number(dayLabel[2])))
        : civil ? new Date(Date.UTC(Number(civil[1]), Number(civil[2]) - 1, Number(civil[3])))
        : typeof value === 'string' ? new Date(value) : value;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return String(value ?? '');
    return new Intl.DateTimeFormat(getIntlLocale(), { timeZone: 'UTC', ...options }).format(date);
}

export function formatMonth(year, month) {
    return formatDate(new Date(Date.UTC(year, month, 1)), { year: 'numeric', month: 'long' });
}

export function setLocale(value, { persist = true } = {}) {
    locale = normalizeLocale(value);
    document.documentElement.setAttribute('lang', getIntlLocale());
    document.documentElement.dataset.locale = locale;
    if (persist) {
        try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch (_) { /* Session-only fallback. */ }
    }
    translatePage();
    document.querySelectorAll('[data-locale-choice]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.localeChoice === locale));
    });
    updateLocaleControls();
    document.dispatchEvent(new CustomEvent('pnl:localechange', { detail: { locale } }));
    return locale;
}

export function initI18n() {
    let preferred = FALLBACK_LOCALE;
    try {
        preferred = localStorage.getItem(LOCALE_STORAGE_KEY)
            || (typeof navigator !== 'undefined' ? navigator.language : FALLBACK_LOCALE);
    } catch (_) { /* Retain the safe default when browser storage is blocked. */ }
    setLocale(preferred, { persist: false });
    bindLocaleControls();
}

export function setDateMessage(element, date, options = {}) {
    if (!element) return;
    element.setAttribute('data-i18n-date', date);
    element.setAttribute('data-i18n-date-options', encodeURIComponent(JSON.stringify(options)));
    element.textContent = formatDate(date, options);
}

export function dateHTML(date, options = {}) {
    return `<span data-i18n-date="${escapeHTML(date)}" data-i18n-date-options="${encodeURIComponent(JSON.stringify(options))}">${escapeHTML(formatDate(date, options))}</span>`;
}

export function localeControlsHTML() {
    return `<button type="button" class="locale-toggle" data-locale-toggle="" aria-label="${escapeHTML(t(locale === 'en' ? '切换到中文' : '切换到英文'))}">${locale === 'en' ? '中' : 'EN'}</button>`;
}

function updateLocaleControls() {
    document.querySelectorAll('[data-locale-toggle]').forEach(button => {
        button.textContent = locale === 'en' ? '中' : 'EN';
        button.setAttribute('aria-label', t(locale === 'en' ? '切换到中文' : '切换到英文'));
        button.setAttribute('title', t(locale === 'en' ? '切换到中文' : '切换到英文'));
    });
}

export function bindLocaleControls(root = document) {
    for (const selector of ['[data-locale-choice]', '[data-locale-toggle]']) {
        root.querySelectorAll(selector).forEach(button => {
            if (button.pnlLocaleBound) return;
            button.pnlLocaleBound = true;
            button.addEventListener('click', event => {
                // Keep open pickers/dropdowns in place; switching language is not
                // an outside-click dismissal of the interaction being translated.
                event.stopPropagation();
                setLocale(button.dataset.localeChoice || (locale === 'en' ? 'zh-CN' : 'en'));
            });
        });
    }
    updateLocaleControls();
}

export function localizedError(key, params = {}) {
    const error = new Error(t(key, params));
    error.localeKey = key;
    error.localeParams = params;
    return error;
}

// Preserve service-provided errors verbatim; only our own errors carry locale IDs.
export function errorCopy(error) {
    return error?.localeKey ? { __pnlMessage: error.localeKey, params: error.localeParams } : String(error?.message || error || '');
}
