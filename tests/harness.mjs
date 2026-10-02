import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = '6821bbc255fc1cdc1e59123a9b3f56a0ca9580f5';
export const plain = value => JSON.parse(JSON.stringify(value));
const baselineDir = path.join(ROOT, 'tests', 'baseline');
const baselineManifest = JSON.parse(fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'));
if (baselineManifest.sourceCommit !== BASELINE) throw new Error('Baseline manifest commit mismatch');
export function source(file, revision = 'current') {
  if (revision === 'current') return fs.readFileSync(path.join(ROOT, file), 'utf8');
  const entry = baselineManifest.files[file];
  if (!entry) throw new Error(`File ${file} was not present in pinned baseline ${BASELINE}`);
  const packed = fs.readFileSync(path.join(baselineDir, entry.archive));
  if (packed.length !== entry.gzipBytes || createHash('sha256').update(packed).digest('hex') !== entry.gzipSha256) throw new Error(`Compressed baseline fixture checksum mismatch: ${file}`);
  const contents = gunzipSync(packed);
  const actual = createHash('sha256').update(contents).digest('hex');
  if (actual !== entry.sha256 || contents.length !== entry.bytes) throw new Error(`Baseline fixture checksum mismatch: ${file}`);
  return contents.toString('utf8');
}

// Deliberately small DOM double, not a browser/layout engine. It preserves actual
// module event callbacks and form names, while keeping every datum in memory.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.listeners = new Map();
    this.dataset = {}; this.style = {}; this.attributes = {}; this.className = '';
    this.value = ''; this.checked = false; this.disabled = false; this.options = [];
    this._html = ''; this._text = ''; this.parentNode = null;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(n => !names.includes(n)).join(' '); },
      toggle: (name, force) => { const add = force ?? !this.classList.contains(name); this.classList[add ? 'add' : 'remove'](name); return add; }
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(value) { this._html = String(value); this._text = ''; this.children = []; for (const child of parseFragment(this._html)) this.appendChild(child); }
  get textContent() { return this._text || this.children.map(c => c.textContent).join(''); }
  set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
  get selectedOptions() { return this.options.filter(o => o.selected); }
  get childNodes() { return this.children; }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'class') this.className = String(value);
    else if (key === 'id') this.id = String(value);
    else if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, s) => s.toUpperCase())] = String(value);
  }
  getAttribute(key) { return key === 'class' ? this.className : key.startsWith('data-') ? (this.dataset[key.slice(5).replace(/-([a-z])/g, (_, s) => s.toUpperCase())] ?? null) : this.attributes[key] ?? null; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  insertAdjacentHTML(position, html) { if (position !== 'beforeend') throw new Error('Unsupported DOM double insert position'); for (const child of parseFragment(html)) this.appendChild(child); }
  removeAttribute(key) { delete this.attributes[key]; }
  click() { return this.dispatch('click'); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  removeChild(child) { this.children = this.children.filter(c => c !== child); child.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
  addEventListener(type, listener) { const handlers = this.listeners.get(type) || []; handlers.push(listener); this.listeners.set(type, handlers); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== listener)); }
  async dispatch(type, extras = {}) {
    const event = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...extras };
    for (const handler of this.listeners.get(type) || []) await handler(event);
  }
  dispatchEvent(event) { for (const handler of this.listeners.get(event.type) || []) handler(event); return true; }
  matches(selector) {
    if (selector === '*') return true;
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return selector.slice(1).split('.').every(c => this.classList.contains(c));
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return attr[2] === undefined ? this.getAttribute(attr[1]) !== null : this.getAttribute(attr[1]) === attr[2];
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    const all = this.children.flatMap(c => [c, ...c.querySelectorAll('*')]);
    return all.filter(c => {
      if (!c.matches(parts.at(-1))) return false;
      let ancestor = c.parentNode;
      for (let i = parts.length - 2; i >= 0; i--) { while (ancestor && !ancestor.matches(parts[i])) ancestor = ancestor.parentNode; if (!ancestor) return false; ancestor = ancestor.parentNode; }
      return true;
    });
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  contains(element) { return this === element || this.children.some(c => c.contains(element)); }
  reset() { for (const element of this.formElements || []) { element.value = element.defaultValue || ''; element.options.forEach(o => { o.selected = false; }); } }
  focus() {} scrollIntoView() {} getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 }; }
}

function parseFragment(html) {
  const root = new Element('fragment'), stack = [root];
  const safe = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const token of safe.matchAll(/<!--[\s\S]*?-->|<\/[^>]+>|<[^>]+>|[^<]+/g)) {
    const text = token[0];
    if (/^<!/.test(text)) continue;
    if (/^<\//.test(text)) { if (stack.length > 1) stack.pop(); continue; }
    if (text.startsWith('<')) {
      const match = text.match(/^<([\w-]+)\b/); if (!match) continue;
      const el = new Element(match[1]);
      for (const attr of text.matchAll(/([\w.:-]+)(?:="([^"]*)"|='([^']*)')/g)) el.setAttribute(attr[1], attr[2] ?? attr[3]);
      el.name = el.getAttribute('name') || ''; el.value = el.getAttribute('value') || ''; el.defaultValue = el.value;
      el.checked = /\bchecked(?:\s|>|=)/.test(text); el.selected = /\bselected(?:\s|>|=)/.test(text); el.hidden = /\bhidden(?:\s|>|=)/.test(text);
      stack.at(-1).appendChild(el);
      if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(match[1]) && !text.endsWith('/>')) stack.push(el);
    } else {
      const el = new Element('#text'); el._text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); stack.at(-1).appendChild(el);
    }
  }
  return root.children;
}

export async function harness({ revision = 'current', width = 1200, now = '2025-01-31T12:00:00Z' } = {}) {
  const html = source('index.html', revision);
  const document = new Element('document');
  for (const child of parseFragment(html)) document.appendChild(child);
  const elements = new Map(document.querySelectorAll('[id]').map(el => [el.id, el]));
  const body = document.querySelector('body') || new Element('body');
  const documentElement = document.querySelector('html') || new Element('html');
  Object.assign(document, { body, documentElement, readyState: 'loading', getElementById: id => elements.get(id) || null, createElement: tag => new Element(tag) });
  for (const e of document.querySelectorAll('select')) {
    e.options = e.querySelectorAll('option');
    for (const option of e.options) if (!option.value) option.value = option.textContent.trim();
    e.value = e.options.find(o => o.selected)?.value || e.options[0]?.value || ''; e.defaultValue = e.value;
  }
  for (const e of document.querySelectorAll('form')) e.formElements = e.querySelectorAll('[name]');
  const storage = new Map(); const storageWrites = [];
  const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => { storage.set(key, String(value)); storageWrites.push({ key, value: String(value) }); },
    removeItem: key => { storage.delete(key); storageWrites.push({ key, remove: true }); },
    clear: () => { storage.clear(); }, key: i => [...storage.keys()][i] ?? null,
    get length() { return storage.size; }
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  class FormDataDouble {
    constructor(form) { this.form = form; }
    get(name) { return this.form.formElements.find(e => e.name === name)?.value ?? null; }
  }
  const timers = []; const fetchCalls = []; const errors = [];
  let fetchImpl = async () => { throw new Error('Network is forbidden: inject a synthetic fetch response'); };
  const matchMedia = query => ({ media: query, matches: /max-width:\s*(\d+)px/.test(query) ? width <= Number(query.match(/max-width:\s*(\d+)px/)[1]) : false, addEventListener() {}, removeEventListener() {} });
  const window = Object.assign(new Element('window'), { innerWidth: width, localStorage, matchMedia, location: { href: 'https://synthetic.invalid/' } });
  const context = vm.createContext({
    document, window, localStorage, Date: FixedDate, FormData: FormDataDouble, console: { ...console, error: (...args) => errors.push(args) },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}, requestAnimationFrame: fn => { timers.push(fn); return timers.length; },
    getComputedStyle: () => ({ getPropertyValue: () => '#000000' }), confirm: () => true, alert() {}, CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }, matchMedia, TextEncoder, TextDecoder, URL, URLSearchParams,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    fetch: async (...args) => { fetchCalls.push(args); return fetchImpl(...args); }
  });
  const modules = new Map();
  const privateExports = {
    'ai-review.js': ['getWeekRange', 'buildOrdersCsv', 'getTradesByPeriod', 'loadAiConfig'],
    'log-ui.js': ['computeWeeklyAutoStats', 'getTradesForLog']
  };
  function getModule(file) {
    if (modules.has(file)) return modules.get(file);
    let code = source(file, revision);
    // Export existing helpers only inside this isolated VM; production source is untouched.
    if (privateExports[file]) code += `\nexport { ${privateExports[file].map(n => `${n} as __${n}`).join(', ')} };\n`;
    const module = new vm.SourceTextModule(code, { context, identifier: file });
    modules.set(file, module); return module;
  }
  const linker = (specifier, referring) => getModule(path.posix.normalize(path.posix.join(path.posix.dirname(referring.identifier), specifier)));
  async function load(file) { const m = getModule(file); if (m.status === 'unlinked') await m.link(linker); if (m.status === 'linked') await m.evaluate(); return m.namespace; }
  return { revision, context, window, document, elements, el: id => elements.get(id), storage, storageWrites, localStorage, errors, timers, fetchCalls, Date: FixedDate, load,
    setFetch: fn => { fetchImpl = fn; }, snapshot: () => Object.fromEntries(storage), source: file => source(file, revision) };
}

export function trade(overrides = {}) {
  return { TransactionID: 'synthetic-close-1', Symbol: 'SYNTH', TradeDate: '2025-01-31', DateTime: '2025-01-31T10:30:00Z', OrderTime: '2025-01-31T10:30:00Z', 'Open/CloseIndicator': 'C', Quantity: '3', FifoPnlRealized: '12.34', TradePrice: '9000', OrigTradePrice: '1', 'Buy/Sell': 'SELL', ...overrides };
}
export async function seed(h, trades) {
  const data = await h.load('data.js'); data.mergeTrades(plain(trades));
  data.filterTradesByDateRange(new h.Date(2000, 0, 1), new h.Date(2099, 11, 31));
  return data;
}
