#!/usr/bin/env node
/**
 * dsh-glass-weather verification.
 *
 * Runs offline by default and needs no DSH install: it loads the *built*
 * artifacts and exercises both halves.
 *
 *   1. manifest + patch consistency (dsh.bundle / dsh.client / entry ids),
 *   2. Host half: schema defaults, tool registration, tool result projection,
 *   3. browser half: the real `lib/client.js` is executed against a minimal DOM
 *      and a recording 2D canvas context, then the engine is driven frame by
 *      frame — snow/rain particles, fog gradients, pause-on-hidden,
 *      reduced-motion, and the settings-card/command registrations,
 *   4. `--online` (default) additionally calls the real Open-Meteo API through
 *      the tool and cross-checks the numbers against a direct API read.
 *
 * Usage:
 *   node scripts/verify.mjs             # offline checks + live Open-Meteo check
 *   node scripts/verify.mjs --offline   # skip the network check
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OFFLINE = process.argv.includes('--offline');

let passed = 0;
let failed = 0;
/**
 * Checks deliberately not run because `--offline` was passed.
 *
 * An *unexpected* skip must never be silent: the live section turns a network
 * failure into a failed check instead, so the summary can never under-report
 * while still exiting 0.
 */
let skipped = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${detail === '' ? '' : `  ${detail}`}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail === '' ? '' : `  ${detail}`}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/* ------------------------------------------------------------ 1. manifest */

section('1. manifest and patch');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
check('package name is dsh-glass-weather', pkg.name === 'dsh-glass-weather', pkg.name);
check('main points at lib/index.js', pkg.main === 'lib/index.js', pkg.main);
check('exports["."] defaults to lib/index.js', pkg.exports?.['.']?.default === './lib/index.js');
check('exports["./client"] defaults to lib/client.js', pkg.exports?.['./client']?.default === './lib/client.js');
check('dsh.bundle.patch is declared', pkg.dsh?.bundle?.patch === './cordis.patch.yml');
check(
  'dsh.client is an object with platform "web" (a bare `true` is rejected by dsh-client-modules)',
  pkg.dsh?.client?.platform === 'web',
  JSON.stringify(pkg.dsh?.client),
);
check('no runtime dependencies', Object.keys(pkg.dependencies ?? {}).length === 0);

const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8');
check('patch inserts the weather entry', /-\s*id:\s*weather\b/.test(patch) && /name:\s*dsh-glass-weather\b/.test(patch));

const hostSource = readFileSync(join(ROOT, 'src/index.ts'), 'utf8');
const clientEntrySource = readFileSync(join(ROOT, 'src/client/index.tsx'), 'utf8');
const hostId = /WEATHER_ENTRY_ID\s*=\s*'([^']+)'/.exec(hostSource)?.[1];
const clientId = /WEATHER_ENTRY_ID_CANDIDATES[^=]*=\s*\[\s*'([^']+)'/.exec(clientEntrySource)?.[1];
const patchId = /-\s*id:\s*(\S+)/.exec(patch)?.[1];
check('entry id is identical in patch, Host and browser halves', hostId === clientId && hostId === patchId, `${String(patchId)} / ${String(hostId)} / ${String(clientId)}`);

for (const artifact of ['lib/index.js', 'lib/client.js']) {
  check(`${artifact} exists`, existsSync(join(ROOT, artifact)));
}

/* ------------------------------------------------------- 2. browser bundle */

section('2. browser bundle wrapper');

const clientCode = readFileSync(join(ROOT, 'lib/client.js'), 'utf8');
check(
  'registers through window.__ModuleLoader__.load',
  clientCode.startsWith('window.__ModuleLoader__.load({ id: "dsh-glass-weather"'),
  clientCode.slice(0, 60).replace(/\n/g, ' '),
);
check('closes the factory with the module exports', clientCode.trimEnd().endsWith('return module.exports; } });'));
const requires = [...clientCode.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
const unexpected = [...new Set(requires)].filter((name) => name !== 'react' && name !== 'react/jsx-runtime');
check('only platform modules are required at run time', unexpected.length === 0, [...new Set(requires)].join(', '));

/* ------------------------------------------------- 3. DOM / canvas harness */

section('3. browser half on a DOM harness');

/** Recording 2D context: counts every drawing call. */
function createContext2D() {
  const ops = { stroke: 0, fill: 0, arc: 0, ellipse: 0, fillRect: 0, clearRect: 0, gradients: 0, lineTo: 0 };
  const gradient = { addColorStop() {} };
  return {
    ops,
    canvas: null,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    shadowColor: '',
    shadowBlur: 0,
    save() {},
    restore() {},
    setTransform() {},
    resetTransform() {},
    translate() {},
    scale() {},
    rotate() {},
    transform() {},
    setLineDash() {},
    clip() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    rect() {},
    lineTo() {
      ops.lineTo += 1;
    },
    quadraticCurveTo() {
      ops.lineTo += 1;
    },
    bezierCurveTo() {
      ops.lineTo += 1;
    },
    arcTo() {
      ops.arc += 1;
    },
    stroke() {
      ops.stroke += 1;
    },
    fill() {
      ops.fill += 1;
    },
    arc() {
      ops.arc += 1;
    },
    ellipse() {
      ops.ellipse += 1;
    },
    fillRect() {
      ops.fillRect += 1;
    },
    clearRect() {
      ops.clearRect += 1;
    },
    fillText() {
      ops.fill += 1;
    },
    strokeText() {},
    measureText() {
      return { width: 0 };
    },
    drawImage() {},
    createRadialGradient() {
      ops.gradients += 1;
      return gradient;
    },
    createLinearGradient() {
      ops.gradients += 1;
      return gradient;
    },
  };
}

class HTMLElementStub {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.offsetParent = {};
    this.ownRect = { left: 0, top: 0, width: 300, height: 40 };
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  /** Attribute-selector-only lookup, enough for the tagged <style> element. */
  querySelector(selector) {
    const attribute = /\[([^\]=]+)(?:="([^"]*)")?\]/.exec(selector);
    if (attribute === null) return null;
    const name = attribute[1];
    const value = attribute[2];
    const matches = (node) => {
      if (node.attributes?.[name] === undefined) return false;
      return value === undefined || node.attributes[name] === value;
    };
    const walk = (node) => {
      for (const child of node.children ?? []) {
        if (matches(child)) return child;
        const deeper = walk(child);
        if (deeper !== null) return deeper;
      }
      return null;
    };
    return walk(this);
  }
  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    child.parentElement = this;
    return child;
  }
  insertBefore(child, reference) {
    const index = reference === null || reference === undefined ? this.children.length : this.children.indexOf(reference);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    child.parentNode = this;
    child.parentElement = this;
    return child;
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    child.parentElement = null;
    return child;
  }
  remove() {
    const parent = this.parentNode;
    if (parent !== null && Array.isArray(parent.children)) {
      const index = parent.children.indexOf(this);
      if (index >= 0) parent.children.splice(index, 1);
    }
    this.parentNode = null;
    this.parentElement = null;
    this.removed = true;
  }
  getBoundingClientRect() {
    return { x: this.ownRect.left, y: this.ownRect.top, ...this.ownRect };
  }
  getContext(kind) {
    if (kind !== '2d') return null;
    this.ctx ??= createContext2D();
    return this.ctx;
  }
  addEventListener() {}
  removeEventListener() {}
}

const headStub = new HTMLElementStub('head');
const documentStub = {
  hidden: false,
  head: headStub,
  body: new HTMLElementStub('body'),
  createElement(tag) {
    return new HTMLElementStub(tag);
  },
  querySelector(selector) {
    if (selector.includes('data-composer-seat')) return composerStub;
    if (selector.includes('data-dsh-glass-weather-styles')) {
      return headStub.children.find((element) => element.attributes['data-dsh-glass-weather-styles'] !== undefined) ?? null;
    }
    return null;
  },
  querySelectorAll() {
    return [];
  },
  addEventListener() {},
  removeEventListener() {},
};

const composerStub = new HTMLElementStub('div');
composerStub.ownRect = { left: 200, top: 600, width: 800, height: 120 };

let clock = 0;
const rafQueue = [];
let rafCounter = 0;
let reducedMotion = false;
const motionListeners = new Set();

globalThis.HTMLElement = HTMLElementStub;
globalThis.document = documentStub;
globalThis.getComputedStyle = () => ({ position: 'static', isolation: 'auto', zIndex: 'auto' });
// Keep the real `performance` object intact — undici's fetch (used by the live
// Open-Meteo check) calls markResourceTiming on it — and only virtualise `now`.
Object.defineProperty(globalThis.performance, 'now', { configurable: true, writable: true, value: () => clock });
globalThis.requestAnimationFrame = (callback) => {
  rafQueue.push(callback);
  rafCounter += 1;
  return rafCounter;
};
globalThis.cancelAnimationFrame = () => {};
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.MutationObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.matchMedia = () => ({
  matches: reducedMotion,
  addEventListener(_type, listener) {
    motionListeners.add(listener);
  },
  removeEventListener(_type, listener) {
    motionListeners.delete(listener);
  },
});

const innerWidth = 1200;
const innerHeight = 800;
globalThis.window = {
  innerWidth,
  innerHeight,
  devicePixelRatio: 3,
  addEventListener() {},
  removeEventListener() {},
  dshDesktop: { marker: true },
  // A real browser exposes these on `window`; production code reads them there.
  matchMedia: globalThis.matchMedia,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
};

/** Advance the clock and run every callback queued so far. */
function pump(ms, times = 1) {
  for (let i = 0; i < times; i += 1) {
    clock += ms;
    const queued = rafQueue.splice(0, rafQueue.length);
    for (const callback of queued) callback(clock);
  }
}

const registrations = [];
globalThis.window.__ModuleLoader__ = {
  load(registration) {
    registrations.push(registration);
  },
};

const clientUrl = new URL(`file://${join(ROOT, 'lib/client.js').replace(/\\/g, '/')}`);
await import(`${clientUrl.href}?v=${String(Date.now())}`);

check('bundle registered exactly one module', registrations.length === 1, `id=${String(registrations[0]?.id)}`);
check('module id is the package name', registrations[0]?.id === 'dsh-glass-weather');
check('factory is a function', typeof registrations[0]?.factory === 'function');

const reactStub = {
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot?.(),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  // Real React calls a function initializer lazily; the stub must too, or a
  // `useState(readClock)` would hand the component the function itself.
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
};
const jsxRuntimeStub = {
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
  Fragment: Symbol('Fragment'),
};
const clientExports = registrations[0].factory((specifier) => {
  if (specifier === 'react') return reactStub;
  if (specifier === 'react/jsx-runtime') return jsxRuntimeStub;
  throw new Error(`unexpected require: ${specifier}`);
});
check('client exports apply()', typeof clientExports.apply === 'function');
check('client exports name', clientExports.name === 'dsh-glass-weather');

/* Fake cordis context. */
const effectDisposers = [];
const commandRegistrations = [];
const slotRegistrations = [];
const describeListeners = new Set();
const formListeners = new Set();
const formState = {
  value: {
    enabled: true,
    city: '',
    rainColor: '#aedbf0',
    snowColor: '#ffffff',
    fogColor: '#c8d8e8',
    lightningColor: '#ffffff',
    densityScale: 1,
    speedScale: 1,
    opacity: 0.7,
    enableLightning: true,
    manualEffect: 'auto',
  },
};
const fakeForm = {
  getSnapshot: () => ({ status: 'ready', value: formState.value, revision: 3, writable: true, mode: 'host' }),
  subscribe(listener) {
    formListeners.add(listener);
    return () => formListeners.delete(listener);
  },
  async set(field, value) {
    formState.value = { ...formState.value, [field]: value };
    for (const listener of formListeners) listener();
    return true;
  },
};
/**
 * Cordis-shaped fake context.
 *
 * A plain object exposing every service would hide a whole class of real bug:
 * in Cordis, reading a service off a context that did not `inject` it throws.
 * So a context exposes only core members and the services it actually injected,
 * and `inject(deps, cb)` hands the callback a child carrying just those.
 */
function makeCordisContext(injected) {
  const core = {
    effect(callback, label) {
      const disposer = callback();
      effectDisposers.push({ label, disposer });
    },
    logger: { info() {}, warn() {}, error() {} },
    inject(deps, callback) {
      const child = {};
      for (const dep of deps) {
        if (dep in serviceRegistry) child[dep] = serviceRegistry[dep];
      }
      callback(makeCordisContext(child));
    },
  };
  return new Proxy(core, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop in injected) return injected[prop];
      if (prop in serviceRegistry) {
        throw new Error(`cannot read service "${String(prop)}" without inject`);
      }
      throw new Error(`unknown context member "${String(prop)}"`);
    },
  });
}

const formsService = {
  get: (namespace) => {
    formsService.lastNamespace = namespace;
    return fakeForm;
  },
  describe: () => ({
    getSnapshot: () => ({
      status: 'ready',
      // The live entry id of a bundle-inserted plugin is include-prefixed.
      view: { namespaces: [{ ns: 'include:weather', value: formState.value }] },
    }),
    subscribe(listener) {
      describeListeners.add(listener);
      return () => describeListeners.delete(listener);
    },
    async ensure() {},
  }),
};
const serviceRegistry = {
  configForms: formsService,
  slots: {
    inject(_key, register) {
      register();
    },
    register(options, component) {
      slotRegistrations.push({ options, component });
      return () => {};
    },
  },
  commandUi: {
    register(contribution) {
      commandRegistrations.push(contribution);
      return () => {};
    },
  },
};

const weatherServices = makeCordisContext({});

/** Canned Open-Meteo answers, so the browser half's data path is deterministic. */
function jsonResponse(body) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}
/** How many times each stubbed endpoint was asked. */
const stubCalls = { forecast: 0, air: 0, geocode: 0 };
/**
 * Toggleable stub failures, so the degradation paths can be exercised against
 * the same harness the happy path uses. Every switch is flipped back off before
 * the next case, so later checks always see a healthy upstream.
 */
const stubFail = { forecast: false, air: false, legacy: false };
/** The `current` object of the last stubbed forecast answer (for assertions). */
let stubLastForecastCurrent;
/** The extra readings only the modern Open-Meteo answer carries. */
const MODERN_CURRENT_FIELDS = ['cloud_cover', 'rain', 'snowfall', 'wind_gusts_10m', 'pressure_msl', 'visibility'];
/** A stubbed upstream that answers 503 without throwing. */
const serviceUnavailable = () => ({
  ok: false,
  status: 503,
  statusText: 'Service Unavailable',
  json: async () => ({}),
});
// Kept so the live section can put the real network back.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const href = String(url);
  if (href.includes('geocoding-api')) {
    stubCalls.geocode += 1;
    return jsonResponse({ results: [{ name: '南昌', latitude: 28.55, longitude: 115.94, country: '中国' }] });
  }
  if (href.includes('air-quality-api')) {
    stubCalls.air += 1;
    if (stubFail.air) return serviceUnavailable();
    return jsonResponse({ current: { pm2_5: 12.4, pm10: 15.1, dust: 0 } });
  }
  if (href.includes('api.open-meteo.com')) {
    stubCalls.forecast += 1;
    if (stubFail.forecast) return serviceUnavailable();
    const current = {
      temperature_2m: 19.6,
      relative_humidity_2m: 88,
      weather_code: 61,
      precipitation: 0.2,
      wind_speed_10m: 11.2,
      cloud_cover: 100,
      rain: 0.2,
      snowfall: 0,
      wind_gusts_10m: 24.5,
      pressure_msl: 1008.4,
      visibility: 9000,
      cape: 0,
    };
    // An interface from before the extra readings existed: the six optional
    // fields are simply absent, which must not be confused with "zero".
    if (stubFail.legacy) {
      for (const field of MODERN_CURRENT_FIELDS) delete current[field];
    }
    stubLastForecastCurrent = current;
    return jsonResponse({
      latitude: 28.55,
      longitude: 115.94,
      current,
      daily: {
        time: ['2026-10-04'],
        temperature_2m_max: [22.1],
        temperature_2m_min: [19.5],
        weather_code: [61],
        precipitation_sum: [5.5],
      },
    });
  }
  if (href.includes('ipapi.co')) {
    return jsonResponse({ latitude: 28.55, longitude: 115.94, city: '南昌', region: '江西' });
  }
  throw new Error(`unexpected fetch: ${href}`);
};

/** Let queued microtasks and timers settle. */
const tick = async (rounds = 12) => {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 20));
};

let applyThrew;
try {
  clientExports.apply(weatherServices);
} catch (error) {
  applyThrew = error instanceof Error ? error.message : String(error);
}
check('client apply() completes without an un-injected service read', applyThrew === undefined, applyThrew ?? '');
check('the root context still refuses un-injected services', (() => {
  try {
    void weatherServices.configForms;
    return false;
  } catch {
    return true;
  }
})());

const headerRegistration = slotRegistrations.find(
  (entry) => entry.options.name === 'conversation.session.header.actions',
);
const settingsRegistration = slotRegistrations.find((entry) => entry.options.name === 'settings.plugins.tab');
check(
  'the pill registers into conversation.session.header.actions',
  headerRegistration !== undefined,
  JSON.stringify(slotRegistrations.map((entry) => entry.options.name)),
);
check('settings card registered into settings.plugins.tab', settingsRegistration !== undefined);
check('settings card id matches the settings namespace', settingsRegistration?.options.id === 'weather');
check(
  'the pill sits beside the shipped chips (own id, order 40)',
  headerRegistration?.options.id === 'weather' && headerRegistration?.options.order === 40,
  JSON.stringify({ id: headerRegistration?.options.id, order: headerRegistration?.options.order }),
);
check('refresh_weather client command registered', commandRegistrations.length === 1 && commandRegistrations[0].name === 'refresh_weather');
check('the include-prefixed live entry id is adopted', formsService.lastNamespace === 'include:weather', String(formsService.lastNamespace));
check('command is a client-side action', commandRegistrations[0]?.ui?.kind === 'action');

/* ---- the stylesheet the plugin injects ---- */
const styleTag = documentStub.head.children.find((element) => element.attributes['data-dsh-glass-weather-styles'] !== undefined);
check('the glass stylesheet is injected into <head>', styleTag !== undefined && documentStub.head.children.length === 1);
const css = typeof styleTag?.textContent === 'string' ? styleTag.textContent : '';
// Comments name the reference's own selectors on purpose; only real rules count.
const cssRules = css.replaceAll(/\/\*[\s\S]*?\*\//g, '');
check(
  'selectors are namespaced: no bare .wx survives',
  cssRules.includes('.dshwx') && cssRules.includes('.dshwx__lens') && cssRules.replaceAll('.dshwx', '\u0000').includes('.wx') === false,
);
const tintedStates = new Set([...cssRules.matchAll(/data-state="([a-z]+)"/g)].map((match) => match[1]));
check('every design state keeps its tint rule', tintedStates.size === 23, `states=${String(tintedStates.size)}`);
check(
  'the glass layers, lens, flash and reduced-motion rule survive the port',
  css.includes('backdrop-filter') && css.includes('.dshwx__halo') && css.includes('wx-bolt') && css.includes('prefers-reduced-motion'),
);
// Regression guard for the settings dropdown: the OS paints the popup, so the
// option rows need their own opaque surface. Inheriting the page's colour made
// the labels white on the OS's white popup and only visible while hovered.
check(
  'the settings dropdown rows carry an opaque, themed surface',
  /\.dshwx-set select option[\s\S]{0,240}background-color:\s*var\(--dsw-alias-bg-overlay/.test(css) &&
    /\.dshwx-set select optgroup[\s\S]{0,120}|\soption,\s*\n\.dshwx-set select optgroup/.test(css) &&
    css.includes('color: var(--dsw-alias-label-primary'),
  'option/optgroup rules use --dsw-alias-bg-overlay + --dsw-alias-label-primary',
);
check(
  'the settings form controls are themed, with system-colour fallbacks',
  /\.dshwx-set select,[\s\S]{0,400}background-color:\s*var\(--dsw-alias-bg-layer-2/.test(css) && css.includes('CanvasText'),
);

/* ---- tree helpers for the stubbed renderer ---- */
/* Function components are CALLED, exactly as React would, so a wrapper like the
   card's <Field> contributes its label instead of hiding it behind an element. */
function renderNode(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(renderNode);
  if (typeof node.type === 'function') return renderNode(node.type(node.props));
  return node;
}

/** Flatten a stubbed React tree into its text. */
function collectText(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  const rendered = renderNode(node);
  if (rendered !== node) return collectText(rendered, out);
  if (typeof node === 'object' && node.props !== undefined) collectText(node.props.children, out);
  return out;
}

/** Every element of one tag inside a stubbed tree. */
function collectByType(node, type, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectByType(child, type, out);
    return out;
  }
  const rendered = renderNode(node);
  if (rendered !== node) return collectByType(rendered, type, out);
  if (node.type === type) out.push(node);
  if (node.props !== undefined) collectByType(node.props.children, type, out);
  return out;
}

/** The first element whose className contains one class. */
function collectByClass(node, className) {
  if (node === null || node === undefined || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = collectByClass(child, className);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  const rendered = renderNode(node);
  if (rendered !== node) return collectByClass(rendered, className);
  const classes = typeof node.props?.className === 'string' ? node.props.className.split(' ') : [];
  if (classes.includes(className)) return node;
  return collectByClass(node.props?.children, className);
}

/* ---- the reading reaches the pill ---- */
await tick();
const live = globalThis.window.__weatherEffect.status();
check(
  'the reading reaches the pill snapshot',
  live.temperature === 19.6 && live.humidity === 88 && live.hi === 22.1 && live.lo === 19.5,
  JSON.stringify({ t: live.temperature, h: live.humidity, hi: live.hi, lo: live.lo }),
);
check('WMO 61 resolves to the design state "rainy"', live.state === 'rainy', String(live.state));
check('the condition text is the design label', live.condition === '雨', String(live.condition));
check(
  'the particle policy defaults to always-on',
  live.particleMode === 'always' && live.enabled === true,
  JSON.stringify({ mode: live.particleMode, enabled: live.enabled }),
);
check('the refresh asked both keyless endpoints once', stubCalls.forecast >= 1 && stubCalls.air >= 1, JSON.stringify(stubCalls));
check(
  'the pill defaults to readings, not the address (city off, no clock)',
  live.fields.city === false &&
    live.fields.condition === true &&
    live.fields.humidity === true &&
    live.fields.range === true &&
    live.fields.warn === true &&
    live.fields.clock === false,
  JSON.stringify(live.fields),
);

/* ---- the pill in the header ---- */
const fields = { ...clientExports.DEFAULT_FIELDS, city: true };
const pillProps = { reading: live, fields, particles: 'always', enabled: true, onRefresh: () => {} };
const pillTree = clientExports.GlassPill(pillProps);
check(
  'the pill is the glass capsule itself (no wrapper, no card)',
  pillTree?.type === 'div' && pillTree.props.className === 'dshwx dshwx--compact',
  String(pillTree?.props?.className),
);
check('the pill carries the design state', pillTree?.props?.['data-state'] === 'rainy');
const pillText = collectText(pillTree).join(' ').replaceAll(/\s+/g, '');
check(
  'the pill carries place, temperature, condition and the daily range',
  pillText.includes('南昌') && pillText.includes('20') && pillText.includes('雨') && pillText.includes('22°'),
  pillText,
);
check('the pill carries the humidity', pillText.includes('88%'), pillText);
check('the pill mounts the particle canvas in always mode', collectByType(pillTree, 'canvas').length === 1);
check(
  'the pill keeps the exact reading in its tooltip',
  typeof pillTree.props.title === 'string' && pillTree.props.title.includes('19.6'),
  String(pillTree.props.title ?? '').slice(0, 50),
);

/* ---- the field switches ---- */
const allOff = { city: false, condition: false, humidity: false, range: false, clock: false, warn: false };
const minimal = clientExports.GlassPill({ ...pillProps, reading: live, fields: allOff, particles: 'off' });
const minimalText = collectText(minimal).join(' ').replaceAll(/\s+/g, '');
check(
  'switching every field off leaves only the glyph and the temperature',
  minimalText.includes('20') && !minimalText.includes('南昌') && !minimalText.includes('88%') && !minimalText.includes('雨'),
  minimalText,
);
check('particles off renders no canvas element at all', collectByType(minimal, 'canvas').length === 0);
const defaultPill = clientExports.GlassPill({ ...pillProps, fields: clientExports.DEFAULT_FIELDS, particles: 'off' });
check(
  'the shipped default keeps the place name out of the pill (tooltip still has it)',
  collectText(defaultPill).join('').includes('南昌') === false && typeof defaultPill.props.title === 'string' && defaultPill.props.title.includes('南昌'),
);
const noPlace = clientExports.GlassPill({
  ...pillProps,
  reading: { ...live, city: '' },
  fields: { ...fields, city: true },
  particles: 'off',
});
check(
  'an unresolvable place renders no place element and no placeholder',
  collectByClass(noPlace, 'dshwx__loc') === undefined && noPlace.props.title.includes('未定位') === false,
  String(noPlace.props.title),
);
const withClock = clientExports.GlassPill({ ...pillProps, fields: { ...allOff, clock: true }, particles: 'off' });
check('the clock appears only when switched on', /\d{2}:\d{2}/.test(collectText(withClock).join('')), collectText(withClock).join(''));
check('the default pill carries no clock', /\d{2}:\d{2}/.test(collectText(pillTree).join('')) === false);
const severePill = clientExports.GlassPill({
  ...pillProps,
  reading: { ...live, state: 'typhoon', condition: '台风' },
  particles: 'off',
});
check('a severe state carries its warning badge', collectByClass(severePill, 'dshwx__warn')?.props?.['data-lv'] === 'red');
const noWarn = clientExports.GlassPill({ ...pillProps, fields: { ...fields, warn: false }, particles: 'off' });
check('the warning badge can be switched off', collectByClass(noWarn, 'dshwx__warn') === undefined);
const thunderPill = clientExports.GlassPill({
  ...pillProps,
  reading: { ...live, state: 'thunder', condition: '雷雨' },
  particles: 'off',
});
check('thunder adds the flash overlay', collectByClass(thunderPill, 'dshwx__bolt') !== undefined);
check(
  'the Host master switch suppresses the particle canvas',
  collectByType(clientExports.GlassPill({ ...pillProps, particles: 'always', enabled: false }), 'canvas').length === 0,
);
formState.value = { ...formState.value, manualEffect: 'off' };
for (const listener of formListeners) listener();
const silenced = globalThis.window.__weatherEffect.status();
check(
  'manualEffect "off" is the Host-side way to silence the particles',
  silenced.manualEffect === 'off' && silenced.state === 'rainy',
  JSON.stringify({ manual: silenced.manualEffect, state: silenced.state }),
);
formState.value = { ...formState.value, manualEffect: 'auto' };
for (const listener of formListeners) listener();

/* ---- the settings card's controls ---- */
const cardWrapper = settingsRegistration?.component();
const cardElement = cardWrapper?.type(cardWrapper.props);
const cardTree = cardElement?.type(cardElement.props);
const cardText = collectText(cardTree).join(' ');
const wantedLabels = ['城市', '天气文字', '湿度', '今日最高/最低', '时间', '预警角标', '粒子动效', '手动天气'];
const missingLabels = wantedLabels.filter((label) => cardText.includes(label) === false);
check('the settings card offers every pill field and switch', missingLabels.length === 0, `${missingLabels.join(',')} | text=${cardText.slice(0, 240)}`);
check(
  'the settings card renders one checkbox per pill field',
  collectByType(cardTree, 'input').length >= 8,
  `inputs=${String(collectByType(cardTree, 'input').length)}`,
);
check(
  'the settings card renders every selector (particles, manual state, host effect)',
  collectByType(cardTree, 'select').length === 3,
  `selects=${String(collectByType(cardTree, 'select').length)}`,
);
const stateGroups = collectByType(cardTree, 'optgroup').map((node) => node.props.label);
check(
  'the manual-state selector groups ordinary and severe weather',
  stateGroups.length === 2 && stateGroups.includes('常规天气') && stateGroups.includes('极端天气'),
  stateGroups.join(','),
);
check(
  'the manual-state selector offers all 23 states plus automatic',
  collectByType(cardTree, 'option').length >= 24,
  `options=${String(collectByType(cardTree, 'option').length)}`,
);

/* ---- the rewritten card: class-based shell, live preview, four groups ---- */
check(
  'the card root is the class-based .dshwx-set shell (no inline layout)',
  cardTree?.type === 'div' && String(cardTree?.props?.className ?? '').split(' ').includes('dshwx-set'),
  String(cardTree?.props?.className),
);
const previewSlot = collectByClass(cardTree, 'dshwx-set__preview');
check(
  'the card previews the real header capsule (dshwx dshwx--compact)',
  previewSlot !== undefined && collectByClass(previewSlot, 'dshwx--compact') !== undefined,
  String(collectByClass(previewSlot ?? {}, 'dshwx--compact')?.props?.className),
);
const groupNodes = collectByType(cardTree, 'section').filter((node) =>
  String(node.props?.className ?? '').split(' ').includes('dshwx-set__group'),
);
const groupTitles = groupNodes.map((node) => collectText(collectByClass(node, 'dshwx-set__title')).join(''));
const wantedGroups = ['显示内容', '外观与动效', '数据与位置', '高级'];
check(
  'the card is split into the titled sections (显示内容 / 外观与动效 / 数据与位置 / 高级)',
  groupNodes.length >= 4 && wantedGroups.every((title) => groupTitles.includes(title)),
  `${String(groupNodes.length)} sections: ${groupTitles.join(' / ')}`,
);
const buttonTexts = collectByType(cardTree, 'button').map((node) => collectText(node).join(''));
check(
  'the card carries the refresh button and the local-reset button',
  buttonTexts.length === 2 && buttonTexts.includes('刷新天气') && buttonTexts.includes('恢复本机默认显示'),
  buttonTexts.join(' / '),
);

/* ---- the artwork ---- */
const art = clientExports.artFor('typhoon');
check('artwork is a self-contained 64×64 svg', art.startsWith('<svg viewBox="0 0 64 64"') && art.endsWith('</svg>'));
const idsA = [...clientExports.artFor('sunny').matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
const idsB = [...clientExports.artFor('sunny').matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
check('gradient ids are minted fresh on every call', idsA.length > 0 && idsA[0].startsWith('wx') && idsA[0] !== idsB[0], `${String(idsA[0])} vs ${String(idsB[0])}`);
const artFailures = clientExports.STATE_LIST.filter((state) => {
  const svg = clientExports.artFor(state);
  return !svg.startsWith('<svg') || svg.length < 200 || !svg.includes('</svg>');
});
check('every one of the 23 states renders artwork', artFailures.length === 0, artFailures.join(','));
check('the line-icon set is complete', ['pin', 'up', 'down', 'warn'].every((key) => typeof clientExports.LINE_ICONS[key] === 'string' && clientExports.LINE_ICONS[key].startsWith('<svg')));

/* ---- WMO → design state ---- */
const stateFor = clientExports.stateForCode;
check('WMO 0 is a clear sky', stateFor(0) === 'sunny', String(stateFor(0)));
check('WMO 3 is overcast', stateFor(3) === 'overcast');
check('WMO 45 is fog', stateFor(45) === 'fog');
check('WMO 61 is rainy', stateFor(61) === 'rainy');
check('WMO 65 is a rainstorm', stateFor(65) === 'rainstorm');
check('WMO 95 is a thunderstorm', stateFor(95) === 'thunder');
check('WMO 96 is hail', stateFor(96) === 'hail');
check('a clear sky after dark becomes Clear Night', stateFor(0, { hour: 23 }) === 'night');
check('35 °C escalates a calm sky to a heatwave', stateFor(1, { temperature: 36 }) === 'heatwave');
check('−15 °C escalates a calm sky to a cold wave', stateFor(2, { temperature: -18 }) === 'coldwave');
check('39 km/h turns a clear sky windy', stateFor(0, { windSpeed: 45 }) === 'windy');
check('a rainstorm stays a rainstorm at 40 °C', stateFor(82, { temperature: 40 }) === 'rainstorm');
check('an unknown code falls back to partly', stateFor(9999) === 'partly');

/* ---- the readings that stand in for the WMO codes that do not exist ---- */
check('cloud cover turns a clear sky into 多云', stateFor(1, { cloudCover: 85 }) === 'cloudy', String(stateFor(1, { cloudCover: 85 })));
check('thin cloud stays 多云转晴', stateFor(1, { cloudCover: 25 }) === 'partly');
check('rain and snow together is sleet', stateFor(61, { rain: 0.6, snowfall: 0.2 }) === 'sleet', String(stateFor(61, { rain: 0.6, snowfall: 0.2 })));
check('rain alone stays rain', stateFor(61, { rain: 0.6, snowfall: 0 }) === 'rainy');
check('freezing rain keeps its own state', stateFor(66, { rain: 0.4, snowfall: 0.1 }) === 'icyrain');
check('PM2.5 turns an overcast sky hazy', stateFor(3, { pm25: 90, visibility: 8000 }) === 'haze', String(stateFor(3, { pm25: 90, visibility: 8000 })));
check('thick fog is never relabelled haze', stateFor(45, { pm25: 120, visibility: 400 }) === 'fog');
check('low visibility blocks the haze rule', stateFor(3, { pm25: 90, visibility: 600 }) === 'overcast');
check('coarse dust carried by wind is a sandstorm', stateFor(0, { pm10: 500, windSpeed: 30 }) === 'sandstorm', String(stateFor(0, { pm10: 500, windSpeed: 30 })));
check('unambiguous dust is enough on its own', stateFor(0, { dust: 250 }) === 'sandstorm');
check('a dusty but calm day stays sunny', stateFor(0, { pm10: 500, windSpeed: 5 }) === 'sunny');
check('typhoon force needs both the wind and the deep low', stateFor(65, { windSpeed: 130, pressure: 980 }) === 'typhoon', String(stateFor(65, { windSpeed: 130, pressure: 980 })));
check('strong wind without a deep low is not a typhoon', stateFor(65, { windSpeed: 130, pressure: 1010 }) === 'rainstorm');
check('a rainstorm is never relabelled by particulates', stateFor(82, { pm25: 300, pm10: 600, windSpeed: 40 }) === 'rainstorm');
check(
  'the extra readings leave the plain code path intact',
  stateFor(61) === 'rainy' && stateFor(0) === 'sunny' && stateFor(0, { hour: 23 }) === 'night' && stateFor(1, { hour: 23 }) === 'partly',
);
check('manualEffect maps onto a state', clientExports.stateForManual('thunder') === 'thunder' && clientExports.stateForManual('auto') === undefined);
check('every state has a Chinese label', clientExports.STATE_LIST.every((state) => /[\u4e00-\u9fa5]/.test(clientExports.stateLabel(state))));

/* ---- place names: a real name, never a placeholder ---- */
check('a full label is shortened to the place alone', clientExports.cityOnly('南昌县, 江西省, 中国') === '南昌县', clientExports.cityOnly('南昌县, 江西省, 中国'));
check('an empty label stays empty', clientExports.cityOnly(undefined) === '' && clientExports.cityOnly('   ') === '');
check(
  'the most specific name wins (county over city over province)',
  clientExports.pickPlaceName({ locality: '南昌县', city: '南昌市', principalSubdivision: '江西省' }) === '南昌县',
  String(clientExports.pickPlaceName({ locality: '南昌县', city: '南昌市', principalSubdivision: '江西省' })),
);
check(
  'the city field is used when locality is missing',
  clientExports.pickPlaceName({ city: '南昌市', principalSubdivision: '江西省' }) === '南昌市',
  String(clientExports.pickPlaceName({ city: '南昌市', principalSubdivision: '江西省' })),
);
check(
  'a deep administrative entry is preferred over a shallow one',
  clientExports.pickPlaceName({
    city: '南昌市',
    localityInfo: {
      administrative: [
        { name: '中国', adminLevel: 2 },
        { name: '江西省', adminLevel: 4 },
        { name: '南昌县', adminLevel: 7 },
      ],
    },
  }) === '南昌县',
  String(
    clientExports.pickPlaceName({
      city: '南昌市',
      localityInfo: {
        administrative: [
          { name: '中国', adminLevel: 2 },
          { name: '江西省', adminLevel: 4 },
          { name: '南昌县', adminLevel: 7 },
        ],
      },
    }),
  ),
);
check('an answer with nothing usable yields nothing', clientExports.pickPlaceName({}) === undefined);
check(
  'the province is the last resort, never the country',
  clientExports.pickPlaceName({ principalSubdivision: '江西省', localityInfo: { administrative: [{ name: '中国', adminLevel: 2 }] } }) === '江西省',
  String(
    clientExports.pickPlaceName({ principalSubdivision: '江西省', localityInfo: { administrative: [{ name: '中国', adminLevel: 2 }] } }),
  ),
);

/* ---- the particle engine ---- */
const fxCanvas = new HTMLElementStub('canvas');
fxCanvas.ownRect = { left: 0, top: 0, width: 560, height: 76 };
const fx = new clientExports.ParticleFx(fxCanvas, 'rainy');
check('the engine is idle until asked to start', fx.running === false);
fx.resize();
fx.start();
check('start() puts the engine in motion', fx.running === true);
pump(40, 60);
const fxOps = fxCanvas.getContext('2d').ops;
check('rain draws strokes', fxOps.stroke > 0, `stroke=${String(fxOps.stroke)}`);
check('the particle canvas respects the DPR ceiling', fxCanvas.width / 560 <= 1.5 + 1e-6, `dpr=${String(fxCanvas.width / 560)}`);
check('the preset table covers exactly the 23 states', Object.keys(clientExports.FX_PRESETS).length === 23, `${String(Object.keys(clientExports.FX_PRESETS).length)}`);
check(
  'every design state has a particle preset',
  clientExports.STATE_LIST.every((state) => Array.isArray(clientExports.FX_PRESETS[state]) && clientExports.FX_PRESETS[state].length > 0),
);

const drawingOps = (ops) => ops.stroke + ops.fill + ops.fillRect + ops.arc;
const opsBefore = { ...fxCanvas.getContext('2d').ops };
documentStub.hidden = true;
pump(40, 10);
const opsHidden = { ...fxCanvas.getContext('2d').ops };
check(
  'rendering pauses while document.hidden',
  drawingOps(opsBefore) === drawingOps(opsHidden),
  `${String(drawingOps(opsBefore))} -> ${String(drawingOps(opsHidden))}`,
);
documentStub.hidden = false;
pump(40, 10);
check('rendering resumes when visible again', drawingOps(fxCanvas.getContext('2d').ops) > drawingOps(opsHidden));
fx.stop();
check('stop() halts the loop', fx.running === false);
fx.destroy();
check('destroy() leaves the engine stopped', fx.running === false);

const snowCanvas = new HTMLElementStub('canvas');
snowCanvas.ownRect = { left: 0, top: 0, width: 560, height: 76 };
const snowFx = new clientExports.ParticleFx(snowCanvas, 'snowy');
snowFx.resize();
snowFx.start();
pump(40, 60);
const snowOps = snowCanvas.getContext('2d').ops;
check('snow draws its particles', snowOps.arc + snowOps.fill + snowOps.fillRect > 0, JSON.stringify(snowOps));
snowFx.destroy();

const calmCanvas = new HTMLElementStub('canvas');
calmCanvas.ownRect = { left: 0, top: 0, width: 560, height: 76 };
reducedMotion = true;
const calmFx = new clientExports.ParticleFx(calmCanvas, 'rainy');
calmFx.resize();
calmFx.start();
check('prefers-reduced-motion never starts the loop', calmFx.running === false);
calmFx.destroy();
reducedMotion = false;

const flatCanvas = new HTMLElementStub('canvas');
flatCanvas.ownRect = { left: 0, top: 0, width: 0, height: 0 };
const flatFx = new clientExports.ParticleFx(flatCanvas, 'rainy');
flatFx.resize();
flatFx.start();
pump(40, 5);
check(
  'a collapsed canvas neither throws nor draws',
  flatCanvas.getContext('2d').ops.stroke === 0,
  `stroke=${String(flatCanvas.getContext('2d').ops.stroke)}`,
);
flatFx.destroy();

/* ---- settings round-trip ---- */
formState.value = { ...formState.value, manualEffect: 'fog' };
for (const listener of formListeners) listener();
for (const listener of describeListeners) listener();
check('a settings write republishes the pill state', globalThis.window.__weatherEffect.status().state === 'fog', String(globalThis.window.__weatherEffect.status().state));
formState.value = { ...formState.value, manualEffect: 'auto', enabled: false };
for (const listener of formListeners) listener();
const switched = globalThis.window.__weatherEffect.status();
check(
  'the Host master switch reaches the pill',
  switched.enabled === false && switched.state === 'rainy',
  JSON.stringify({ enabled: switched.enabled, state: switched.state }),
);
globalThis.window.__weatherEffect.setParticleMode('off');
check('the particle policy reaches the pill', globalThis.window.__weatherEffect.status().particleMode === 'off');
globalThis.window.__weatherEffect.setFields({ ...clientExports.DEFAULT_FIELDS, city: false, clock: true });
const fieldSwap = globalThis.window.__weatherEffect.status().fields;
check(
  'the field switches reach the pill snapshot',
  fieldSwap.city === false && fieldSwap.clock === true && fieldSwap.humidity === true,
  JSON.stringify(fieldSwap),
);
check(
  'the field coercion drops junk instead of trusting storage',
  JSON.stringify(clientExports.coerceFields({ city: 'yes', clock: true, humidity: null })) ===
    JSON.stringify({ ...clientExports.DEFAULT_FIELDS, clock: true }),
  JSON.stringify(clientExports.coerceFields({ city: 'yes', clock: true, humidity: null })),
);

/* ---- the local manual state: how the one source-less state stays reachable ---- */
const codeLess = ['cloudy', 'haze', 'sleet', 'sandstorm', 'typhoon', 'tornado'];
check(
  'six design states have no WMO code of their own',
  codeLess.every((state) => clientExports.STATE_LIST.includes(state) && clientExports.stateForCode(9999) !== state),
  codeLess.join(','),
);
check(
  'five of the six are derived from the extra Open-Meteo readings',
  stateFor(1, { cloudCover: 90 }) === 'cloudy' &&
    stateFor(3, { pm25: 90 }) === 'haze' &&
    stateFor(61, { rain: 0.5, snowfall: 0.2 }) === 'sleet' &&
    stateFor(0, { pm10: 500, windSpeed: 30 }) === 'sandstorm' &&
    stateFor(65, { windSpeed: 130, pressure: 980 }) === 'typhoon',
);
check(
  'tornado has no public source and therefore stays manual-only',
  clientExports.stateForCode(95, { gust: 200, cape: 5000 }) === 'thunder' && clientExports.STATE_LIST.includes('tornado'),
  String(clientExports.stateForCode(95, { gust: 200, cape: 5000 })),
);
globalThis.window.__weatherEffect.setState('typhoon');
check('a manual state overrides the live weather', globalThis.window.__weatherEffect.status().state === 'typhoon');
check('the manual state is reported back for the selector', globalThis.window.__weatherEffect.status().stateOverride === 'typhoon');
globalThis.window.__weatherEffect.setState('haze');
check('another manual state takes over', globalThis.window.__weatherEffect.status().state === 'haze');
globalThis.window.__weatherEffect.setState('');
const released = globalThis.window.__weatherEffect.status();
check(
  'clearing the manual state falls back to the live code',
  released.state === 'rainy' && released.stateOverride === '',
  JSON.stringify({ state: released.state, override: released.stateOverride }),
);
globalThis.window.__weatherEffect.setState('not-a-state');
check('an unknown state string degrades to automatic', globalThis.window.__weatherEffect.status().stateOverride === '');
check(
  'the state guard accepts exactly the 23 states',
  clientExports.STATE_LIST.every((state) => clientExports.isGlassState(state)) && clientExports.isGlassState('rainy ') === false,
);

/* ---- degradation: what a broken upstream does to the pill ---- */
section('3b. degradation and fault tolerance');

/** Await one refresh and report a rejection instead of letting it escape. */
const refreshOutcome = async () => {
  try {
    await globalThis.window.__weatherEffect.refresh();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};
const faultStatus = () => globalThis.window.__weatherEffect.status();

/* 1. the air-quality endpoint is a bonus signal: its death must be invisible. */
stubFail.air = true;
const airDownRejection = await refreshOutcome();
const airDown = faultStatus();
check('a dead air-quality endpoint never rejects refresh()', airDownRejection === undefined, airDownRejection ?? '');
check('a dead air-quality endpoint leaves no error on the snapshot', airDown.error === undefined, String(airDown.error));
check(
  'the WMO code alone still decides the state (rainy, never haze or sandstorm)',
  airDown.state === 'rainy',
  String(airDown.state),
);
check(
  'the forecast reading survives the missing particulates',
  airDown.temperature === 19.6 && airDown.hi === 22.1 && airDown.condition === '雨',
  JSON.stringify({ t: airDown.temperature, hi: airDown.hi, condition: airDown.condition }),
);
stubFail.air = false;

/* 2. the forecast endpoint is the only hard dependency: it must fail loudly but
      keep whatever was last read on screen. */
const readingBeforeFailure = faultStatus();
stubFail.forecast = true;
const forecastDownRejection = await refreshOutcome();
const forecastDown = faultStatus();
check('a dead forecast endpoint never rejects refresh()', forecastDownRejection === undefined, forecastDownRejection ?? '');
check(
  'a dead forecast endpoint surfaces a readable error',
  typeof forecastDown.error === 'string' && forecastDown.error.length > 0,
  String(forecastDown.error),
);
check(
  'the error names the endpoint that failed',
  /Open-Meteo forecast responded 503/.test(forecastDown.error ?? ''),
  String(forecastDown.error),
);
check(
  'a failed refresh keeps the previous reading instead of clearing it',
  forecastDown.temperature === readingBeforeFailure.temperature &&
    forecastDown.state === readingBeforeFailure.state &&
    forecastDown.condition === '雨',
  JSON.stringify({ t: forecastDown.temperature, state: forecastDown.state, condition: forecastDown.condition }),
);
check(
  'the debug handle survives a failed refresh',
  typeof globalThis.window.__weatherEffect?.status === 'function' && typeof globalThis.window.__weatherEffect?.refresh === 'function',
);
stubFail.forecast = false;

/* 3. an interface from before the extra readings existed: absent fields are not
      zeroes, and the WMO code must still answer on its own. */
stubFail.legacy = true;
const legacyRejection = await refreshOutcome();
const legacy = faultStatus();
check('an old interface without the extra readings does not crash the client', legacyRejection === undefined, legacyRejection ?? '');
check(
  'the legacy answer really omitted every modern reading',
  MODERN_CURRENT_FIELDS.every((field) => stubLastForecastCurrent?.[field] === undefined),
  JSON.stringify(MODERN_CURRENT_FIELDS.filter((field) => stubLastForecastCurrent?.[field] !== undefined)),
);
check('WMO 61 still resolves to rainy without the extra readings', legacy.state === 'rainy', String(legacy.state));
check(
  'the plain readings still reach the pill (temperature, humidity, range)',
  legacy.temperature === 19.6 && legacy.humidity === 88 && legacy.hi === 22.1 && legacy.lo === 19.5,
  JSON.stringify({ t: legacy.temperature, h: legacy.humidity, hi: legacy.hi, lo: legacy.lo }),
);
check(
  'absent optional fields never become a phantom severe state',
  legacy.state !== 'haze' && legacy.state !== 'sandstorm' && legacy.state !== 'sleet' && legacy.error === undefined,
  JSON.stringify({ state: legacy.state, error: legacy.error }),
);
stubFail.legacy = false;

/* 4. the local keys: a blocked or corrupt store must fall back to the shipped
      defaults instead of breaking the settings card. */
const nativeStorage = globalThis.window.localStorage;
globalThis.window.localStorage = {
  getItem() {
    throw new Error('storage blocked');
  },
  setItem() {
    throw new Error('storage blocked');
  },
  removeItem() {
    throw new Error('storage blocked');
  },
};
check(
  'a blocked particle-policy key falls back to always-on',
  clientExports.readStoredParticleMode() === clientExports.DEFAULT_PARTICLE_MODE,
  String(clientExports.readStoredParticleMode()),
);
check(
  'a blocked field key falls back to the shipped defaults',
  JSON.stringify(clientExports.readStoredFields()) === JSON.stringify(clientExports.DEFAULT_FIELDS),
  JSON.stringify(clientExports.readStoredFields()),
);
check('a blocked state key falls back to automatic', clientExports.readStoredState() === '', `state=${String(clientExports.readStoredState())}`);
let storageWriteThrew;
try {
  clientExports.writeStoredParticleMode('off');
  clientExports.writeStoredFields(clientExports.DEFAULT_FIELDS);
  clientExports.writeStoredState('rainy');
} catch (error) {
  storageWriteThrew = error instanceof Error ? error.message : String(error);
}
check('a blocked store never makes a persisted write throw', storageWriteThrew === undefined, storageWriteThrew ?? '');

globalThis.window.localStorage = {
  getItem: (key) => (String(key) === clientExports.FIELDS_STORAGE_KEY ? '{ not json' : 'not-a-state'),
  setItem() {},
  removeItem() {},
};
check(
  'a corrupt field payload falls back to the shipped defaults',
  JSON.stringify(clientExports.readStoredFields()) === JSON.stringify(clientExports.DEFAULT_FIELDS),
  JSON.stringify(clientExports.readStoredFields()),
);
check('an unknown stored state degrades to automatic', clientExports.readStoredState() === '', `state=${String(clientExports.readStoredState())}`);
if (nativeStorage === undefined) delete globalThis.window.localStorage;
else globalThis.window.localStorage = nativeStorage;

/* 5. everything restored: the pill must recover on its own, with the error gone. */
const recoveredRejection = await refreshOutcome();
const recovered = faultStatus();
check(
  'restoring the endpoints clears the error and the reading is live again',
  recoveredRejection === undefined &&
    recovered.error === undefined &&
    recovered.state === 'rainy' &&
    recovered.temperature === 19.6 &&
    stubFail.forecast === false &&
    stubFail.air === false &&
    stubFail.legacy === false,
  JSON.stringify({ error: recovered.error, state: recovered.state, t: recovered.temperature }),
);

/* ---- teardown ---- */
const teardown = effectDisposers.find((entry) => entry.label === 'dsh-weather: header pill, settings card and command');
check('the plugin registers one tracked effect', teardown !== undefined, JSON.stringify(effectDisposers.map((entry) => entry.label)));
teardown?.disposer?.();
check('teardown removes the injected stylesheet', styleTag?.removed === true, `removed=${String(styleTag?.removed)}`);
check('teardown removes the debug handle', globalThis.window.__weatherEffect === undefined);

/* ----------------------------------------------------------- 4. Host half */

section('4. Host half');

const host = await import(new URL(`file://${join(ROOT, 'lib/index.js').replace(/\\/g, '/')}`).href);
check('host exports name', host.name === 'dsh-glass-weather');
check('host injects the tools service', Array.isArray(host.inject) && host.inject.includes('tools'));

const defaults = { ...host.Config({}).get() };
const EXPECTED_DEFAULTS = {
  enabled: true,
  city: '',
  rainColor: '#aedbf0',
  snowColor: '#ffffff',
  fogColor: '#c8d8e8',
  lightningColor: '#ffffff',
  densityScale: 1,
  speedScale: 1,
  opacity: 0.7,
  enableLightning: true,
  manualEffect: 'auto',
};
check('every config field has a default (wholesale config replacement is safe)', JSON.stringify(defaults) === JSON.stringify(EXPECTED_DEFAULTS), JSON.stringify(defaults));
const partial = host.Config({ enabled: false }).get();
check('a partial section keeps the other defaults', partial.enabled === false && partial.rainColor === '#aedbf0' && partial.manualEffect === 'auto');
let rejected = false;
try {
  host.Config({ densityScale: 99 }).get();
} catch {
  rejected = true;
}
check('out-of-range values are rejected by the schema (not silently coerced)', rejected);

const liveConfig = host.Config({}).get();
const liveDefaults = { ...liveConfig };
check('the volatile reference resolves to a plain section', liveDefaults.city === '' && liveDefaults.opacity === 0.7);

let registered;
const hostEffectDisposers = [];
const hostContext = {
  fiber: { marker: true },
  logger: { info() {}, warn() {}, error() {} },
  tools: {
    register(definition) {
      registered = definition;
      return () => {};
    },
  },
  inject(_deps, callback) {
    callback(hostContext);
  },
  effect(callback) {
    hostEffectDisposers.push(callback());
  },
  settings: {
    configure() {
      return () => {};
    },
  },
};
host.apply(hostContext, host.Config({}));
check('get_weather tool registered', registered?.name === 'get_weather');
check('tool description covers when NOT to use it', /不要用于查询历史天气数据/.test(registered?.description ?? ''));
check('tool declares location as required', Array.isArray(registered?.parameters?.required) && registered.parameters.required.includes('location'), JSON.stringify(registered?.parameters?.required));
check('tool declares a numeric days parameter', registered?.parameters?.properties?.days?.type === 'integer');
check('tool output schema mirrors the documented result', 'daily' in (registered?.output?.schema?.properties ?? {}) && 'windSpeed' in (registered?.output?.schema?.properties ?? {}));
check('settings page policy was installed', hostEffectDisposers.length === 1);

const fakeReport = {
  location: '北京',
  temperature: 18.5,
  weathercode: 61,
  weatherText: '小雨',
  precipitation: 0.4,
  windSpeed: 7.2,
  humidity: 88,
  daily: [{ date: '2026-10-04', tempMax: 22, tempMin: 14, weathercode: 61, weatherText: '小雨', precipitationSum: 1.2 }],
};
const rendered = registered.output.render({ location: 'x', days: 1 }, fakeReport);
check('render produces one text block', Array.isArray(rendered) && rendered.length === 1 && rendered[0].type === 'text');
check('render mentions the place, the day and the humidity', /北京/.test(rendered[0].text) && /2026-10-04/.test(rendered[0].text) && /88%/.test(rendered[0].text));

/* ------------------------------------------------- 5. Cordis activation */

section('5. real Cordis 4 activation');

const { Context, Service } = await import('@deepseek-ai/cordis');

class FakeTools extends Service {
  static inject = [];
  constructor(ctx) {
    super(ctx, 'tools');
    this.registered = undefined;
  }
  register(definition) {
    this.registered = definition;
    return () => {
      this.registered = undefined;
    };
  }
}

class FakeSettings extends Service {
  static inject = [];
  constructor(ctx) {
    super(ctx, 'settings');
    this.configureCalls = 0;
    this.configureCleanups = 0;
  }
  configure() {
    this.configureCalls += 1;
    return () => {
      this.configureCleanups += 1;
    };
  }
}

/** Boot a throwaway app and report the plugin's fiber state. */
async function activate({ withTools, withSettings }) {
  const app = new Context();
  let tools;
  let settings;
  if (withTools) {
    app.plugin({
      name: 'fake-tools',
      apply: (ctx) => {
        tools = new FakeTools(ctx);
      },
    });
  }
  if (withSettings) {
    app.plugin({
      name: 'fake-settings',
      apply: (ctx) => {
        settings = new FakeSettings(ctx);
      },
    });
  }
  const fiber = app.plugin(host, {});
  await new Promise((resolve) => setTimeout(resolve, 60));
  return { app, fiber, tools, settings };
}

const withoutTools = await activate({ withTools: false, withSettings: false });
check('the fiber stays pending while `tools` is absent', withoutTools.fiber?.state !== 2, `state=${String(withoutTools.fiber?.state)}`);

const active = await activate({ withTools: true, withSettings: true });
check('the fiber activates once `tools` is served', active.fiber?.state === 2, `state=${String(active.fiber?.state)}`);
check('activation registers get_weather', active.tools?.registered?.name === 'get_weather');
check('activation installs the settings page policy once', active.settings?.configureCalls === 1, `calls=${String(active.settings?.configureCalls)}`);

const toolOnly = await activate({ withTools: true, withSettings: false });
check('the plugin runs without a Settings service (optional injection)', toolOnly.fiber?.state === 2 && toolOnly.tools?.registered?.name === 'get_weather');

const disposal = await activate({ withTools: true, withSettings: true });
check('the tool is registered before disposal', disposal.tools?.registered?.name === 'get_weather');
check('the settings policy is installed before disposal', disposal.settings?.configureCalls === 1);
// Disabling a Loader entry (or a hot reload) disposes its fiber: everything the
// plugin registered through `ctx.effect` is reversed with no teardown code of
// its own. The tool registration rides the same mechanism inside dsh-tools
// (`layers.effect(this.ctx, ...)`, where `ctx.tools` is a caller-scoped proxy).
disposal.fiber?.dispose();
await new Promise((resolve) => setTimeout(resolve, 40));
check('disposing the plugin fiber reverses its ctx.effect registrations', disposal.settings?.configureCleanups === 1, `cleanups=${String(disposal.settings?.configureCleanups)}`);

/* -------------------------------------------------------- 6. Open-Meteo */

section('6. live Open-Meteo check');

// The browser-half harness above replaces the global fetch with canned answers;
// section 6 is about the real service, so the real fetch comes back first.
globalThis.fetch = nativeFetch;

if (OFFLINE) {
  console.log('  SKIP  --offline was passed: 7 live checks not run');
  skipped += 7;
} else {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, 15000);
    const result = await registered.execute({ location: '北京', days: 2 }, { signal: controller.signal });
    clearTimeout(timer);

    const direct = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=39.9042&longitude=116.4074&current=temperature_2m,weather_code,precipitation,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum&forecast_days=2&timezone=auto',
    ).then((response) => response.json());

    check('tool returned a location label', typeof result.location === 'string' && result.location.length > 0, result.location);
    check('temperature matches a direct API read', Math.abs(result.temperature - direct.current.temperature_2m) < 0.05, `${String(result.temperature)} vs ${String(direct.current.temperature_2m)}`);
    check('weather code matches a direct API read', result.weathercode === direct.current.weather_code, `${String(result.weathercode)} vs ${String(direct.current.weather_code)}`);
    check('weather text is a Chinese description', /[\u4e00-\u9fa5]/.test(result.weatherText), result.weatherText);
    check('two forecast days were returned', result.daily.length === 2, `days=${String(result.daily.length)}`);
    check('daily max/min are ordered sensibly', result.daily.every((day) => day.tempMin <= day.tempMax));
    console.log(`  INFO  ${result.location} ${result.weatherText} ${String(result.temperature)}°C wind ${String(result.windSpeed)} km/h`);

    // The geocoder only knows 南昌; a user typing their own administrative
    // division (南昌县) must still resolve.
    const suffixed = await registered.execute({ location: '南昌县', days: 1 }, { signal: new AbortController().signal });
    check('an administrative suffix still resolves (南昌县 → 南昌)', /南昌/.test(suffixed.location), suffixed.location);
    console.log(`  INFO  南昌县 → ${suffixed.location} ${suffixed.weatherText} ${String(suffixed.temperature)}°C`);
  } catch (error) {
    // Not a silent skip: an unreachable service means the live checks did not
    // run, which is exactly the kind of gap a release gate must fail on.
    check(
      'live Open-Meteo reachable (pass --offline to skip this section on purpose)',
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/* ------------------------------------------------------------- summary */

console.log(`\n${'='.repeat(46)}`);
console.log(`passed: ${String(passed)}   failed: ${String(failed)}${skipped > 0 ? `   skipped: ${String(skipped)}` : ''}`);
if (skipped > 0) console.log(`skipped by --offline: ${String(skipped)} live checks were not run`);
if (failed > 0) {
  console.log('failed checks:');
  for (const label of failures) console.log(`  - ${label}`);
  process.exitCode = 1;
} else {
  console.log('all checks passed');
}
