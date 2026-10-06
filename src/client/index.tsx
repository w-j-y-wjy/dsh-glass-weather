/**
 * dsh-glass-weather — browser half.
 *
 * The weather surface is a *glass pill* (ported from the supplied design): one
 * 30px capsule in `conversation.session.header.actions`, beside the shipped
 * header buttons, carrying every part of the reading the user switched on —
 * glyph, warning badge, place, temperature, condition, daily range, humidity and
 * clock — plus the design's particle layer.
 *
 * There is no hover expansion and no overlay: the pill is the whole surface, so
 * it can never cover a neighbouring button. The stylesheet it injects is
 * namespaced (`.dshwx`) and removed with the plugin.
 *
 * Configuration comes from the same settings document the Host tool reads,
 * through `ctx.configForms`. Service access is structural and always lives
 * inside `ctx.inject`, because reading an un-injected Cordis service throws —
 * which would take the whole browser half down silently.
 */
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import { resolveWeather } from './locate.ts';
import { useAppTheme } from './theme.ts';
import {
  DEFAULT_FIELDS,
  FIELD_OPTIONS,
  GlassPill,
  coerceFields,
  type ParticleMode,
  type PillFields,
  type PillReading,
} from './pill.tsx';
import { installStyles } from './styles.ts';
import { STATES, STATE_LIST, stateForCode, stateForManual, stateLabel, type GlassState } from './widget/state.ts';
import type { EffectKind, WeatherConfig } from '../index.ts';

/** Slot the pill registers into: title-adjacent session actions. */
export const HEADER_SLOT = 'conversation.session.header.actions';

/** Where the particle policy is remembered (per browser profile). */
export const PARTICLES_STORAGE_KEY = 'dsh-weather:particles';

/** Where the pill's field switches are remembered. */
export const FIELDS_STORAGE_KEY = 'dsh-weather:pill-fields';

/** Where the local manual weather state is remembered. */
export const STATE_STORAGE_KEY = 'dsh-weather:state';

/** Default particle policy: the design's layer runs in the pill. */
export const DEFAULT_PARTICLE_MODE: ParticleMode = 'always';

/* ------------------------------------------------------------------ store */

interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

/** Minimal external store for `useSyncExternalStore`. */
function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/* ----------------------------------------------------------------- status */

/**
 * What the pill is allowed to show.
 *
 * Structurally a superset of {@link PillReading}, so the whole snapshot can be
 * handed to the pill without copying.
 */
export interface OverlayStatus extends PillReading {
  /** Wind speed in km/h, from the same reading. */
  windSpeed: number | undefined;
  /** The manual override currently in force. */
  manualEffect: EffectKind;
  /** Whether the Host master switch allows the particle layer. */
  enabled: boolean;
  /** The particle policy in force. */
  particleMode: ParticleMode;
  /** Which parts of the reading the pill draws. */
  fields: PillFields;
  /** Local manual state, or `''` for "decide from the weather". */
  stateOverride: GlassState | '';
}

/**
 * The client-side reading behind the pill.
 *
 * The first block is what the pill displays; the second block is what the state
 * decision reads on top of the WMO code — the extra variables that let it tell
 * apart the states a code cannot express.
 */
interface Reading {
  weathercode: number;
  temperature: number;
  humidity: number;
  windSpeed: number;
  location: string;
  hi: number | undefined;
  lo: number | undefined;
  cloudCover: number;
  rain: number;
  snowfall: number;
  gust: number;
  pressure: number;
  visibility: number;
  pm25: number | undefined;
  pm10: number | undefined;
  dust: number | undefined;
}

/** Structural view of the services this half consumes. */
interface WeatherServices {
  inject(deps: readonly string[], callback: (child: WeatherServices) => void): void;
  effect(callback: () => (() => void) | void, label?: string): void;
  logger: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
  configForms: ConfigFormsLike;
  slots?: SlotsLike;
  commandUi?: CommandUiLike;
}

interface ConfigFormsLike {
  get<T>(entryId: string): ConfigForm<T>;
  describe(): {
    getSnapshot(): { status: string; view: { namespaces: readonly { ns: string; value: unknown }[] } | undefined };
    subscribe(listener: () => void): () => void;
    ensure(): Promise<void>;
  };
}

interface SlotsLike {
  inject(key: string, register: () => () => void): unknown;
  register(options: Record<string, unknown>, component: unknown): () => void;
}

interface CommandUiLike {
  register(contribution: Record<string, unknown>): () => void;
}

/* -------------------------------------------------------------- the card */

/** Settings section shape as the browser sees it. */
type WeatherValue = Partial<WeatherConfig>;

/** Binding between the settings mirror and the card. */
export interface FormBinding {
  getForm(): ConfigForm<WeatherValue> | undefined;
  subscribe(listener: () => void): () => void;
}

/** One line of plain-language help per pill field. */
const FIELD_HELP: Readonly<Record<keyof PillFields, string>> = Object.freeze({
  city: '在胶囊里显示地名（如「南昌县」）。地名最长，会占用会话标题的宽度。',
  condition: '显示「阴 / 小雨」这类状态词。',
  humidity: '显示相对湿度百分比。',
  range: '显示今天的最高与最低温度。',
  clock: '显示当前时间。系统任务栏已有时间，所以默认关闭。',
  warn: '恶劣天气（霾、沙尘暴、台风等）时，在图标旁显示对应颜色的三角预警标。',
});

/** Human labels for the particle policies. */
const PARTICLE_LABEL: Readonly<Record<ParticleMode, string>> = Object.freeze({
  always: '常驻（胶囊里跑）',
  off: '关闭',
});

/** Effect kind → the card's option label. */
const EFFECT_LABEL: Readonly<Record<EffectKind, string>> = Object.freeze({
  auto: '自动（按实时天气）',
  rain: '雨',
  snow: '雪',
  fog: '雾',
  thunder: '雷暴',
  off: '关闭粒子（Host）',
});

/** Every selectable effect kind, in the order the card lists them. */
const EFFECT_KINDS: readonly EffectKind[] = Object.freeze(['auto', 'rain', 'snow', 'fog', 'thunder', 'off']);

/** Reads the particle policy from the browser. */
export function readStoredParticleMode(): ParticleMode {
  try {
    if (typeof window === 'undefined') return DEFAULT_PARTICLE_MODE;
    const stored = window.localStorage.getItem(PARTICLES_STORAGE_KEY);
    if (stored === 'always' || stored === 'off') return stored;
  } catch {
    /* storage blocked: fall through to the default */
  }
  return DEFAULT_PARTICLE_MODE;
}

/** Persists the particle policy; a blocked storage keeps the session value. */
export function writeStoredParticleMode(mode: ParticleMode): void {
  try {
    window.localStorage.setItem(PARTICLES_STORAGE_KEY, mode);
  } catch {
    /* private mode / storage disabled */
  }
}

/** Reads the pill's field switches from the browser. */
export function readStoredFields(): PillFields {
  try {
    if (typeof window === 'undefined') return { ...DEFAULT_FIELDS };
    const stored = window.localStorage.getItem(FIELDS_STORAGE_KEY);
    if (stored === null) return { ...DEFAULT_FIELDS };
    return coerceFields(JSON.parse(stored) as unknown);
  } catch {
    /* storage blocked or corrupt: fall through to the defaults */
  }
  return { ...DEFAULT_FIELDS };
}

/** Persists the field switches. */
export function writeStoredFields(fields: PillFields): void {
  try {
    window.localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(fields));
  } catch {
    /* private mode / storage disabled */
  }
}

/** True when a value names one of the design's 23 states. */
export function isGlassState(value: unknown): value is GlassState {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(STATES, value);
}

/**
 * Reads the local manual state.
 *
 * This is what makes all 23 states reachable: four of them (haze, sandstorm,
 * typhoon, tornado) have no WMO code behind them, so nothing but a manual pick
 * can show them.
 */
export function readStoredState(): GlassState | '' {
  try {
    if (typeof window === 'undefined') return '';
    const stored = window.localStorage.getItem(STATE_STORAGE_KEY);
    return isGlassState(stored) ? stored : '';
  } catch {
    /* storage blocked: stay automatic */
  }
  return '';
}

/** Persists the local manual state. */
export function writeStoredState(state: GlassState | ''): void {
  try {
    if (state === '') window.localStorage.removeItem(STATE_STORAGE_KEY);
    else window.localStorage.setItem(STATE_STORAGE_KEY, state);
  } catch {
    /* private mode / storage disabled */
  }
}

/** The settings card contributed to `settings.plugins.tab`. */
export function WeatherSettingsCard(props: {
  binding: FormBinding;
  status: Store<OverlayStatus>;
  particles: Store<ParticleMode>;
  fields: Store<PillFields>;
  state: Store<GlassState | ''>;
  onRefresh: () => void;
}): ReactElement {
  const { binding, status, particles, fields, state, onRefresh } = props;
  const getForm = useCallback(() => binding.getForm(), [binding]);
  const form = useSyncExternalStore(binding.subscribe, getForm);
  if (form === undefined) {
    return (
      <div className="dshwx-set">
        <div className="dshwx-set__status">正在读取设置…</div>
      </div>
    );
  }
  return (
    <WeatherFields form={form} status={status} particles={particles} fields={fields} state={state} onRefresh={onRefresh} />
  );
}

/** The controls, once a form exists. */
function WeatherFields(props: {
  form: ConfigForm<WeatherValue>;
  status: Store<OverlayStatus>;
  particles: Store<ParticleMode>;
  fields: Store<PillFields>;
  state: Store<GlassState | ''>;
  onRefresh: () => void;
}): ReactElement {
  const { form, status, particles, fields, state, onRefresh } = props;
  const subscribe = useMemo(() => form.subscribe.bind(form), [form]);
  const readSnapshot = useMemo(() => form.getSnapshot.bind(form), [form]);
  const snapshot = useSyncExternalStore(subscribe, readSnapshot);
  const live = useSyncExternalStore(status.subscribe, status.get);
  const mode = useSyncExternalStore(particles.subscribe, particles.get);
  const shown = useSyncExternalStore(fields.subscribe, fields.get);
  const manualState = useSyncExternalStore(state.subscribe, state.get);
  // The preview follows the same theme as the header pill.
  const theme = useAppTheme();
  const [lastWrite, setLastWrite] = useState<string>('');

  const value: WeatherConfig = coerceConfig(snapshot.value);
  // Deliberately NOT gating the controls on `writable`: a refused write answers
  // with `false`, and showing that beats a dead control the user cannot explain.
  const set = (field: keyof WeatherConfig, next: unknown): void => {
    setLastWrite('保存中…');
    form.set(field, next).then(
      (accepted) => {
        setLastWrite(accepted ? `已保存 ${field}` : `${field} 被 Host 拒绝`);
      },
      (error: unknown) => {
        setLastWrite(`${field} 保存失败：${error instanceof Error ? error.message : String(error)}`);
      },
    );
  };

  const setMode = (next: ParticleMode): void => {
    particles.set(next);
    writeStoredParticleMode(next);
    setLastWrite(`粒子：${PARTICLE_LABEL[next]}`);
  };

  const toggleField = (key: keyof PillFields, on: boolean): void => {
    const next: PillFields = { ...shown, [key]: on };
    fields.set(next);
    writeStoredFields(next);
    setLastWrite(`胶囊显示：${FIELD_OPTIONS.find(([k]) => k === key)?.[1] ?? key} ${on ? '开' : '关'}`);
  };

  const setState = (next: GlassState | ''): void => {
    state.set(next);
    writeStoredState(next);
    setLastWrite(next === '' ? '天气状态：自动' : `天气状态：${stateLabel(next)}`);
  };

  /** Put every browser-local preference back to what the plugin ships with. */
  const resetLocal = (): void => {
    const defaults: PillFields = { ...DEFAULT_FIELDS };
    fields.set(defaults);
    writeStoredFields(defaults);
    particles.set(DEFAULT_PARTICLE_MODE);
    writeStoredParticleMode(DEFAULT_PARTICLE_MODE);
    state.set('');
    writeStoredState('');
    setLastWrite('已恢复本机默认显示');
  };

  const reading = live.error !== undefined
    ? `读取失败：${live.error}`
    : [
        live.city.length > 0 ? live.city : undefined,
        live.condition,
        live.temperature === undefined ? undefined : `${live.temperature.toFixed(1)}°C`,
        live.humidity === undefined ? undefined : `湿度 ${live.humidity.toFixed(0)}%`,
        live.hi === undefined || live.lo === undefined
          ? undefined
          : `今日 ${String(Math.round(live.lo))}~${String(Math.round(live.hi))}°C`,
        live.updatedAt === undefined ? undefined : new Date(live.updatedAt).toLocaleTimeString(),
      ]
        .filter((part): part is string => part !== undefined)
        .join(' · ');

  return (
    <div className="dshwx-set">
      <div className="dshwx-set__status">{reading}</div>

      <div className="dshwx-set__preview">
        <GlassPill
          reading={live}
          fields={shown}
          particles={mode}
          enabled={live.enabled && live.manualEffect !== 'off'}
          mode={theme}
          onRefresh={onRefresh}
        />
        <span className="dshwx-set__previewNote">实时预览 · 与顶栏是同一个组件</span>
      </div>

      <section className="dshwx-set__group">
        <div className="dshwx-set__title">显示内容</div>
        {FIELD_OPTIONS.map(([key, label]) => (
          <div className="dshwx-set__row" key={key}>
            <span className="dshwx-set__rowText">
              <span className="dshwx-set__label">{label}</span>
              <span className="dshwx-set__note">{FIELD_HELP[key]}</span>
            </span>
            <input
              className="dshwx-set__switch"
              type="checkbox"
              checked={shown[key]}
              aria-label={label}
              onChange={(event) => {
                toggleField(key, event.target.checked);
              }}
            />
          </div>
        ))}
      </section>

      <section className="dshwx-set__group">
        <div className="dshwx-set__title">外观与动效</div>
        <div className="dshwx-set__field">
          <span className="dshwx-set__label">粒子动效</span>
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as ParticleMode);
            }}
          >
            {(['always', 'off'] as const).map((option) => (
              <option key={option} value={option}>
                {PARTICLE_LABEL[option]}
              </option>
            ))}
          </select>
          <span className="dshwx-set__note">
            每种天气状态自带一套粒子（雨、雪、星、沙尘、漩涡…），按设计稿参数运行。关闭后胶囊里不创建 canvas，零绘制开销。
          </span>
        </div>
        <div className="dshwx-set__field">
          <span className="dshwx-set__label">手动天气状态</span>
          <select
            value={manualState}
            onChange={(event) => {
              const next = event.target.value;
              setState(isGlassState(next) ? next : '');
            }}
          >
            <option value="">自动（按实时天气）</option>
            <optgroup label="常规天气">
              {STATE_LIST.filter((candidate) => STATES[candidate].group === 0).map((candidate) => (
                <option key={candidate} value={candidate}>
                  {stateLabel(candidate)}
                </option>
              ))}
            </optgroup>
            <optgroup label="极端天气">
              {STATE_LIST.filter((candidate) => STATES[candidate].group === 1).map((candidate) => (
                <option key={candidate} value={candidate}>
                  {stateLabel(candidate)}
                </option>
              ))}
            </optgroup>
          </select>
          <span className="dshwx-set__note">
            22 种状态能由真实天气自动判定；只有「龙卷风」全球没有公开数据源，只能在这里手动选。手动选择只改外观与粒子，不动 get_weather 的读数。
          </span>
        </div>
      </section>

      <section className="dshwx-set__group">
        <div className="dshwx-set__title">数据与位置</div>
        <div className="dshwx-set__field">
          <span className="dshwx-set__label">城市（留空自动定位）</span>
          <input
            type="text"
            value={value.city}
            placeholder="例如：南昌县"
            onChange={(event) => {
              set('city', event.target.value);
            }}
          />
          <span className="dshwx-set__note">
            留空时使用浏览器定位，并把坐标反查成真实地名（县 ＞ 市 ＞ 省）；填了就固定用它。也接受「纬度,经度」。
          </span>
        </div>
        <div className="dshwx-set__actions">
          <button type="button" onClick={onRefresh}>
            刷新天气
          </button>
          <span className="dshwx-set__note">数据来自 Open-Meteo，免密钥；每次刷新两个请求（天气 + 空气质量）。</span>
        </div>
      </section>

      <section className="dshwx-set__group">
        <div className="dshwx-set__title">高级</div>
        <div className="dshwx-set__row">
          <span className="dshwx-set__rowText">
            <span className="dshwx-set__label">允许绘制（Host 总开关）</span>
            <span className="dshwx-set__note">Host 侧配置。关掉后胶囊照常显示读数，只是粒子层不启动。</span>
          </span>
          <input
            className="dshwx-set__switch"
            type="checkbox"
            checked={value.enabled}
            aria-label="允许绘制"
            onChange={(event) => {
              set('enabled', event.target.checked);
            }}
          />
        </div>
        <div className="dshwx-set__field">
          <span className="dshwx-set__label">Host 手动特效</span>
          <select
            value={value.manualEffect}
            onChange={(event) => {
              set('manualEffect', event.target.value as EffectKind);
            }}
          >
            {EFFECT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {EFFECT_LABEL[kind]}
              </option>
            ))}
          </select>
          <span className="dshwx-set__note">
            Host 侧的粗粒度覆盖（雨 / 雪 / 雾 / 雷暴 / 关闭粒子），优先级低于上面的本机手动状态。
          </span>
        </div>
        <div className="dshwx-set__actions">
          <button type="button" onClick={resetLocal}>
            恢复本机默认显示
          </button>
          <span className="dshwx-set__note">只重置本机的 6 个显示开关、粒子策略与手动状态，不动 Host 配置。</span>
        </div>
      </section>

      <div className="dshwx-set__note">
        {snapshot.value === undefined ? '未读到设置值，界面显示的是默认值' : '设置源 weather'}
        {lastWrite.length > 0 ? ` · ${lastWrite}` : ''}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- config coercion */

/** Client-side mirror of the Config defaults, used until the Host answers. */
const DEFAULT_VALUE: WeatherConfig = {
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

/** Validate one numeric field, clamped into range. */
function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Validate one colour-ish string field. */
function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Narrow an arbitrary resolved value to an effect kind. */
function coerceEffectKind(value: unknown): EffectKind {
  return typeof value === 'string' && (EFFECT_KINDS as readonly string[]).includes(value)
    ? (value as EffectKind)
    : 'auto';
}

/**
 * Build a complete config from whatever the settings document resolved.
 *
 * A patch `config` block replaces a section wholesale, so a field the user never
 * touched can arrive absent or `null`. Every field is therefore validated on its
 * own — spreading the raw section over the defaults would let `manualEffect:
 * null` through and silently switch the override off.
 */
export function coerceConfig(raw: unknown): WeatherConfig {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    enabled: source.enabled !== false,
    city: typeof source.city === 'string' ? source.city : DEFAULT_VALUE.city,
    rainColor: stringOr(source.rainColor, DEFAULT_VALUE.rainColor),
    snowColor: stringOr(source.snowColor, DEFAULT_VALUE.snowColor),
    fogColor: stringOr(source.fogColor, DEFAULT_VALUE.fogColor),
    lightningColor: stringOr(source.lightningColor, DEFAULT_VALUE.lightningColor),
    densityScale: numberIn(source.densityScale, DEFAULT_VALUE.densityScale, 0.2, 3),
    speedScale: numberIn(source.speedScale, DEFAULT_VALUE.speedScale, 0.2, 3),
    opacity: numberIn(source.opacity, DEFAULT_VALUE.opacity, 0.1, 1),
    enableLightning: source.enableLightning !== false,
    manualEffect: coerceEffectKind(source.manualEffect),
  };
}

/* ------------------------------------------------------------- plugin face */

/** Client plugin identity (informational; the module id is the package name). */
export const name = 'dsh-glass-weather';

/** No hard service dependency: everything below is injected optionally. */
export const inject: readonly string[] = [];

declare global {
  interface Window {
    /** Desktop-shell marker. */
    dshDesktop?: unknown;
    /** Debug handle: `window.__weatherEffect.status()`. */
    __weatherEffect?: {
      refresh(): Promise<void>;
      /** Force a particle policy, exactly like the settings select. */
      setParticleMode(mode: ParticleMode): void;
      /** Force the pill's field switches, exactly like the checkboxes. */
      setFields(fields: PillFields): void;
      /** Force a weather state, exactly like the manual-state select. */
      setState(state: GlassState | ''): void;
      status(): OverlayStatus;
    };
  }
}

/** Mount the browser half. */
export function apply(ctx: Context): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const services = ctx as unknown as WeatherServices;

  const particles = createStore<ParticleMode>(readStoredParticleMode());
  const fields = createStore<PillFields>(readStoredFields());
  const manualState = createStore<GlassState | ''>(readStoredState());
  const status = createStore<OverlayStatus>({
    state: 'partly',
    condition: '读取中',
    city: '',
    temperature: undefined,
    humidity: undefined,
    hi: undefined,
    lo: undefined,
    windSpeed: undefined,
    updatedAt: undefined,
    error: undefined,
    manualEffect: 'auto',
    enabled: true,
    particleMode: particles.get(),
    fields: fields.get(),
    stateOverride: manualState.get(),
  });

  let config: WeatherConfig = { ...DEFAULT_VALUE };
  let report: Reading | undefined;
  let abort: AbortController | undefined;

  /**
   * The state to draw for the current reading.
   *
   * The local manual pick wins, then the Host's `manualEffect`, then the live
   * weather: the WMO code plus every extra reading that can tell apart a state
   * the code cannot express (cloud cover, mixed rain and snow, gusts and
   * pressure, visibility, particulates).
   */
  const resolveState = (): GlassState => {
    const local = manualState.get();
    if (local !== '') return local;
    const manual = stateForManual(config.manualEffect);
    if (manual !== undefined) return manual;
    if (report === undefined) return 'partly';
    return stateForCode(report.weathercode, {
      hour: new Date().getHours(),
      windSpeed: report.windSpeed,
      temperature: report.temperature,
      cloudCover: report.cloudCover,
      rain: report.rain,
      snowfall: report.snowfall,
      gust: report.gust,
      pressure: report.pressure,
      visibility: report.visibility,
      pm25: report.pm25,
      pm10: report.pm10,
      dust: report.dust,
    });
  };

  /** Republish the snapshot from the current config + reading. */
  const publish = (): void => {
    const state = resolveState();
    const current = status.get();
    status.set({
      state,
      condition: report === undefined ? (current.error === undefined ? '读取中' : '读取失败') : stateLabel(state),
      city: report?.location ?? current.city,
      temperature: report?.temperature ?? current.temperature,
      humidity: report?.humidity ?? current.humidity,
      hi: report?.hi ?? current.hi,
      lo: report?.lo ?? current.lo,
      windSpeed: report?.windSpeed ?? current.windSpeed,
      updatedAt: current.updatedAt,
      error: current.error,
      manualEffect: config.manualEffect,
      enabled: config.enabled,
      particleMode: particles.get(),
      fields: fields.get(),
      stateOverride: manualState.get(),
    });
  };

  const refresh = async (): Promise<void> => {
    abort?.abort();
    const controller = new AbortController();
    abort = controller;
    try {
      const { report: next, air } = await resolveWeather(config.city, controller.signal);
      if (controller.signal.aborted) return;
      const today = next.daily[0];
      report = {
        weathercode: next.weathercode,
        temperature: next.temperature,
        humidity: next.humidity,
        windSpeed: next.windSpeed,
        location: next.location,
        hi: today?.tempMax,
        lo: today?.tempMin,
        cloudCover: next.cloudCover,
        rain: next.rain,
        snowfall: next.snowfall,
        gust: next.gust,
        pressure: next.pressure,
        visibility: next.visibility,
        pm25: air?.pm25,
        pm10: air?.pm10,
        dust: air?.dust,
      };
      status.set({ ...status.get(), error: undefined, updatedAt: Date.now() });
      publish();
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      status.set({ ...status.get(), error: message });
      publish();
      services.logger.warn('dsh-weather: weather lookup failed:', message);
    }
  };

  const onConfig = (next: WeatherValue | undefined): void => {
    const merged = coerceConfig(next);
    const cityChanged = merged.city !== config.city;
    config = merged;
    publish();
    if (cityChanged) void refresh();
  };

  const bindingListeners = new Set<() => void>();
  let activeForm: ConfigForm<WeatherValue> | undefined;
  let boundNamespace: string | undefined;
  let unbindForm: (() => void) | undefined;
  let unbindDescribe: (() => void) | undefined;

  const binding: FormBinding = {
    getForm: () => activeForm,
    subscribe: (listener) => {
      bindingListeners.add(listener);
      return () => {
        bindingListeners.delete(listener);
      };
    },
  };

  /**
   * Bind the settings section.
   *
   * `configForms` is a Cordis service: it may only be read from a context that
   * declared it, so every touch of it lives inside this inject.
   */
  const bindConfigForms = (configCtx: WeatherServices): void => {
    const forms = configCtx.configForms;
    const describe = forms.describe();
    const syncNamespace = (): void => {
      const namespace = resolveNamespace(describe);
      if (namespace === boundNamespace) return;
      boundNamespace = namespace;
      unbindForm?.();
      const form = forms.get<WeatherValue>(namespace);
      activeForm = form;
      onConfig(form.getSnapshot().value);
      unbindForm = form.subscribe(() => {
        onConfig(form.getSnapshot().value);
      });
      for (const listener of [...bindingListeners]) listener();
    };
    unbindDescribe = describe.subscribe(syncNamespace);
    void describe.ensure().catch(() => undefined);
    syncNamespace();
  };

  /* Everything below is one effect: unloading the plugin reverses all of it. */
  services.effect(() => {
    const removeStyles = installStyles();
    void refresh();

    services.inject(['configForms'], (configCtx) => {
      bindConfigForms(configCtx);
    });

    // The particle policy and the field switches are part of the snapshot, so a
    // change to either republishes it.
    const unbindParticles = particles.subscribe(publish);
    const unbindFields = fields.subscribe(publish);
    const unbindState = manualState.subscribe(publish);

    // The pill, in the session header beside the shipped buttons.
    services.inject(['slots'], (slotsCtx) => {
      const slots = slotsCtx.slots;
      if (slots === undefined) return;
      slots.inject(HEADER_SLOT, () =>
        slots.register({ name: HEADER_SLOT, id: 'weather', order: 40, label: () => '天气' }, () => {
          // Subscribed inside the slot component, so a refresh or a settings
          // write repaints the pill; the slot itself knows nothing about us.
          const snapshot = useSyncExternalStore(status.subscribe, status.get);
          // The pill's composition follows the shell's own theme.
          const theme = useAppTheme();
          // `manualEffect: 'off'` is the Host-side way of saying "no particles";
          // the local policy is the other one. Either one silences the canvas.
          return (
            <GlassPill
              reading={snapshot}
              fields={snapshot.fields}
              particles={snapshot.particleMode}
              enabled={snapshot.enabled && snapshot.manualEffect !== 'off'}
              mode={theme}
              onRefresh={() => void refresh()}
            />
          );
        }),
      );
      slots.inject('settings.plugins.tab', () =>
        slots.register({ name: 'settings.plugins.tab', id: 'weather', order: 40, label: () => '天气' }, () => (
          <WeatherSettingsCard
            binding={binding}
            status={status}
            particles={particles}
            fields={fields}
            state={manualState}
            onRefresh={() => void refresh()}
          />
        )),
      );
    });

    // `/refresh_weather` as a client-side action command.
    services.inject(['commandUi'], (commandCtx) => {
      const commandUi = commandCtx.commandUi;
      if (commandUi === undefined) return;
      commandUi.register({
        name: 'refresh_weather',
        label: () => '刷新天气',
        description: () => '重新定位并查询当前天气',
        available: () => true,
        ui: { kind: 'action', run: () => void refresh() },
      });
    });

    window.__weatherEffect = {
      refresh,
      setParticleMode: (mode) => {
        particles.set(mode);
        writeStoredParticleMode(mode);
      },
      setFields: (next) => {
        fields.set(next);
        writeStoredFields(next);
      },
      setState: (next) => {
        const value: GlassState | '' = isGlassState(next) ? next : '';
        manualState.set(value);
        writeStoredState(value);
      },
      status: () => status.get(),
    };

    return () => {
      delete window.__weatherEffect;
      unbindParticles();
      unbindFields();
      unbindState();
      unbindForm?.();
      unbindDescribe?.();
      bindingListeners.clear();
      abort?.abort();
      removeStyles();
    };
  }, 'dsh-weather: header pill, settings card and command');

  services.logger.info(
    'dsh-weather: client half mounted (%s, particles: %s)',
    window.dshDesktop === undefined ? 'browser' : 'desktop shell',
    particles.get(),
  );
}

/** The settings describe face, as this half consumes it. */
type DescribeFace = ReturnType<ConfigFormsLike['describe']>;

/** Entry ids the settings document may address. */
const WEATHER_ENTRY_ID_CANDIDATES: readonly string[] = ['weather', 'include:weather'];

/**
 * Resolve the settings section this plugin owns.
 *
 * The namespace is the *live* Loader entry id, which is not always the patch id:
 * an entry inserted by a profile bundle is mounted under an include tree and
 * shows up as `include:weather`. Three levels, cheapest first:
 *   1. an exact candidate id present in the document,
 *   2. a value whose shape is unmistakably ours (survives any id rewriting),
 *   3. the first candidate.
 */
export function resolveNamespace(describe: DescribeFace): string {
  try {
    const namespaces = describe.getSnapshot().view?.namespaces ?? [];
    for (const candidate of WEATHER_ENTRY_ID_CANDIDATES) {
      if (namespaces.some((entry) => entry.ns === candidate)) return candidate;
    }
    for (const entry of namespaces) {
      const value = entry.value;
      if (typeof value !== 'object' || value === null) continue;
      const record = value as Record<string, unknown>;
      if ('manualEffect' in record && 'enableLightning' in record) return entry.ns;
    }
  } catch {
    /* the mirror is not ready yet — the fixed candidate stays authoritative */
  }
  return WEATHER_ENTRY_ID_CANDIDATES[0] ?? 'weather';
}

/* Test seams: the verification harness drives these directly. */
export {
  DEFAULT_FIELDS,
  FIELD_OPTIONS,
  GlassPill,
  coerceFields,
  type ParticleMode,
  type PillFields,
  type PillReading,
} from './pill.tsx';
export { ParticleFx, FX_PRESETS } from './widget/fx.ts';
export { artFor, LINE_ICONS } from './widget/art.ts';
export { STATES, STATE_LIST, stateForCode, stateForManual, stateLabel, stateWarn } from './widget/state.ts';
export { ALL_CSS, DARK_CSS, LAYOUT_CSS, SCOPED_CSS, installStyles } from './styles.ts';
export { readAppTheme, watchAppTheme, luminanceOf, DARK_LUMINANCE, type AppTheme } from './theme.ts';
export { cityOnly, pickPlaceName, resolveWeather, type ReverseBody } from './locate.ts';

export default { name, inject, apply };