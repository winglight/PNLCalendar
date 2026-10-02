// Apply the user's appearance before first paint. Never read trading/configuration data.
(() => {
    const allowed = ['forest', 'graphite', 'plum', 'ivory', 'amber', 'teal'];
    try {
        const theme = localStorage.getItem('pnlCalendarTheme');
        document.documentElement.dataset.theme = allowed.includes(theme) ? theme : 'forest';
    } catch (_) {
        document.documentElement.dataset.theme = 'forest';
    }
})();
