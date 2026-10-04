window.__ModuleLoader__.load({ id: "dsh-glass-weather", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
import { ReactElement } from "react";
import { Context } from "@deepseek-ai/cordis";
import { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";
import "@deepseek-ai/schemastery";
//#region src/client/widget/state.d.ts
/**
 * The glass pill's weather vocabulary.
 *
 * The reference design speaks in 23 *states* (sunny / partly / drizzle /
 * typhoon …), each with its own glass tint, halo, particle preset and artwork.
 * Open-Meteo speaks in WMO numbers plus a few numbers of its own (temperature,
 * wind). This module is the single place where one becomes the other, so the
 * mapping can be tested without touching the DOM.
 *
 * Pure data and total functions — no DOM, no state, no imports.
 */
/** The 23 states the pill can render. */
type GlassState = 'sunny' | 'partly' | 'cloudy' | 'overcast' | 'fog' | 'haze' | 'drizzle' | 'rainy' | 'shower' | 'thunder' | 'sleet' | 'snowy' | 'windy' | 'night' | 'rainstorm' | 'blizzard' | 'hail' | 'icyrain' | 'sandstorm' | 'typhoon' | 'tornado' | 'heatwave' | 'coldwave';
/** Warning-badge levels, as the design's four colours. */
type WarnLevel = 'blue' | 'yellow' | 'orange' | 'red';
/** Everything the pill needs to know about one state. */
interface StateInfo {
  /** English label, as the design shows it. */
  readonly label: string;
  /** Chinese label. */
  readonly zh: string;
  /** `0` = ordinary weather, `1` = severe weather (the design's two groups). */
  readonly group: 0 | 1;
  /** Warning badge to draw, when the state implies one. */
  readonly warn?: WarnLevel;
}
/** The design's state table, verbatim. */
declare const STATES: Readonly<Record<GlassState, StateInfo>>;
/** Every state, in the design's own order. */
declare const STATE_LIST: readonly GlassState[];
/** Extra readings that can escalate an ordinary sky into a severe state. */
interface StateHints {
  /** Local hour, 0–23; a clear sky after dark becomes `night`. */
  readonly hour?: number;
  /** Wind speed in km/h. */
  readonly windSpeed?: number;
  /** Temperature in °C. */
  readonly temperature?: number;
  /** Total cloud cover in percent — separates 晴/多云转晴 from 多云. */
  readonly cloudCover?: number;
  /** Rain portion of the current precipitation, in mm — with snowfall, sleet. */
  readonly rain?: number;
  /** Snowfall portion of the current precipitation, in cm. */
  readonly snowfall?: number;
  /** Wind gust speed in km/h. */
  readonly gust?: number;
  /** Mean sea-level pressure in hPa — with wind, typhoon force. */
  readonly pressure?: number;
  /** Visibility in metres — keeps thick fog out of the haze rule. */
  readonly visibility?: number;
  /** PM2.5 in µg/m³ — the haze signal. */
  readonly pm25?: number;
  /** PM10 in µg/m³ — the blowing-dust signal. */
  readonly pm10?: number;
  /** Modelled dust concentration in µg/m³. */
  readonly dust?: number;
}
/**
 * Resolve the state for one reading.
 *
 * The WMO code decides first, then the extra readings refine it — because four
 * of the design's states have no WMO code at all (多云 / 雨夹雪 / 霾 / 沙尘暴)
 * and a fifth (台风级) needs wind and pressure rather than a code. Only 龙卷风
 * is left without a public source anywhere, so it stays manual.
 *
 *   1. typhoon force (sustained wind + deep low) wins over everything;
 *   2. rain and snow together is sleet;
 *   3. a code that already means something severe is never overwritten;
 *   4. on a calm sky: blowing dust, then haze, then the temperature and wind
 *      extremes, then cloud cover (晴/多云转晴 → 多云), then night;
 *   5. otherwise the code's own state.
 *
 * Every hint is optional: called with just a code, this behaves exactly as it
 * did before the extra readings existed.
 */
declare function stateForCode(code: number | undefined, hints?: StateHints): GlassState;
/** The state a `manualEffect` value forces, or `undefined` for `auto`. */
declare function stateForManual(kind: string): GlassState | undefined;
/** The design's Chinese label for a state. */
declare function stateLabel(state: GlassState): string;
/** The warning badge a state implies, if any. */
declare function stateWarn(state: GlassState): WarnLevel | undefined;
//#endregion
//#region src/client/pill.d.ts
/** How the particle layer is allowed to run. */
type ParticleMode = 'always' | 'off';
/** Which parts of the reading the pill is allowed to show. */
interface PillFields {
  /** Place name. */
  city: boolean;
  /** Chinese condition text. */
  condition: boolean;
  /** Relative humidity. */
  humidity: boolean;
  /** Today's high and low. */
  range: boolean;
  /** Wall clock. */
  clock: boolean;
  /** Warning badge for severe states. */
  warn: boolean;
}
/**
 * The shipped default: the readings, not the address.
 *
 * The place name is the longest part of the pill and the header spends that
 * width on the session title, so it starts off — one click in settings brings it
 * back (the tooltip always carries it either way).
 */
declare const DEFAULT_FIELDS: PillFields;
/** Field order, with the label the settings card shows. */
declare const FIELD_OPTIONS: readonly (readonly [keyof PillFields, string])[];
/** Narrow an arbitrary stored value to a field set. */
declare function coerceFields(raw: unknown): PillFields;
/** Everything the pill shows about the current reading. */
interface PillReading {
  /** Resolved design state. */
  state: GlassState;
  /** Chinese condition text. */
  condition: string;
  /** Place name, as resolved by the geocoder. */
  city: string;
  /** °C, or `undefined` before the first reading. */
  temperature: number | undefined;
  /** Relative humidity in percent. */
  humidity: number | undefined;
  /** Today's maximum, from the daily block. */
  hi: number | undefined;
  /** Today's minimum, from the daily block. */
  lo: number | undefined;
  /** Epoch ms of the last successful reading. */
  updatedAt: number | undefined;
  /** Last failure, cleared by the next success. */
  error: string | undefined;
}
/** The pill's props. */
interface GlassPillProps {
  reading: PillReading;
  /** Which parts of the reading to draw. */
  fields: PillFields;
  /** Particle policy, as chosen in settings. */
  particles: ParticleMode;
  /** Whether the particle layer is allowed at all (Host switch, minus `off`). */
  enabled: boolean;
  onRefresh: () => void;
}
/** The glass pill that lives in the session header. */
declare function GlassPill(props: GlassPillProps): ReactElement;
//#endregion
//#region src/index.d.ts
/** Effect kinds the browser half understands, in the order the card lists them. */
declare const EFFECT_KINDS: readonly ["auto", "rain", "snow", "fog", "thunder", "off"];
/** One selectable effect kind (`auto` follows the live weather code). */
type EffectKind = (typeof EFFECT_KINDS)[number];
/** Resolved plugin configuration. */
interface WeatherConfig {
  /** Master switch for the whole effect layer. */
  enabled: boolean;
  /** Manual city; empty means "locate automatically". */
  city: string;
  /** Rain droplet colour. */
  rainColor: string;
  /** Snowflake colour. */
  snowColor: string;
  /** Fog colour. */
  fogColor: string;
  /** Lightning bolt colour. */
  lightningColor: string;
  /** Particle density multiplier (0.2–3.0). */
  densityScale: number;
  /** Fall speed multiplier (0.2–3.0). */
  speedScale: number;
  /** Overall layer opacity (0.1–1.0). */
  opacity: number;
  /** Whether thunderstorms draw lightning. */
  enableLightning: boolean;
  /** Manual effect override; `auto` follows the observed weather code. */
  manualEffect: EffectKind;
}
//#endregion
//#region src/client/widget/fx.d.ts
/** The particle families the design draws. */
type FxKind = 'rain' | 'streak' | 'pellet' | 'snow' | 'star' | 'cloud' | 'fog' | 'mote' | 'wave' | 'swirl';
/** An `[r, g, b]` triple, 0–255, as the design's table writes colours. */
type Rgb = readonly [number, number, number];
/** One layer of the design's `FX` table. Omitted fields take the defaults. */
interface FxLayer {
  /** Particle family. */
  readonly k: FxKind;
  /** Particle count. */
  readonly n: number;
  /** Colour; default white. */
  readonly c?: Rgb;
  /** Base speed; default 6. */
  readonly sp?: number;
  /** Base length in px; default 12. */
  readonly len?: number;
  /** Slope factor: `x` drifts by `v * ang`, `y` by `l * ang`; default 0.17. */
  readonly ang?: number;
  /** Stroke width; default 1.35. */
  readonly w?: number;
  /** Base alpha; default 0.3. */
  readonly a?: number;
  /** Snow sway amplitude; default 0.6. */
  readonly drift?: number;
  /** `1` = motes fall instead of rising. */
  readonly fall?: 1;
  /** `1` = clouds paint grey instead of the layer colour. */
  readonly dark?: 1;
}
/** The design's particle layer per state, frozen. */
declare const FX_PRESETS: Readonly<Record<GlassState, readonly FxLayer[]>>;
/**
 * The canvas particle engine.
 *
 * Construction only reads the canvas, sizes it and spawns the current state's
 * particles; the animation loop starts on `start()`.
 */
declare class ParticleFx {
  private canvas;
  private ctx;
  private readonly mq;
  private layers;
  private state;
  private w;
  private h;
  private dpr;
  /** Drawn-frame counter, for the rain ripples. */
  private t;
  /** Timestamp of the last drawn frame; `-Infinity` = draw on the next frame. */
  private last;
  private raf;
  private active;
  private destroyed;
  /** Whether the canvas box currently has a non-zero size. */
  private visible;
  /** Window resize → re-read the box and DPR. */
  private readonly onResize;
  /** Reduced-motion preference change → stop for good. */
  private readonly onMotion;
  /** The rAF step: schedule, gate to 30 fps, draw. */
  private readonly frame;
  constructor(canvas: HTMLCanvasElement, state: GlassState);
  /** Whether the animation loop is live. */
  get running(): boolean;
  /** Switch presets; a running loop is not interrupted. */
  set(state: GlassState): void;
  /** Re-read the canvas box and cap the backing store at 1.5 × DPR. */
  resize(): void;
  /** Start the loop; a no-op under reduced motion, or with no 2D context. */
  start(): void;
  /** Stop the loop and clear the canvas. */
  stop(): void;
  /** Stop, unhook every listener and drop the canvas/particle references. */
  destroy(): void;
  /** Clear the drawing surface, when there is one. */
  private clear;
  /**
   * Spawn or respawn one particle in place.
   *
   * `init` spreads a new particle over the whole canvas; otherwise it enters
   * from just outside, exactly as the design's `spawn(L, false)` does. The
   * `Math.random()` calls — and therefore the look — are in the design's order.
   */
  private fill;
  /** One frame, at most 30 times a second. Allocates nothing. */
  private draw;
}
//#endregion
//#region src/client/widget/art.d.ts
/**
 * The full 64×64 SVG for one state.
 *
 * Each call gets its own `wx{n}-` defs prefix, so ids are unique per icon.
 */
declare function artFor(state: GlassState): string;
/** The 24×24 stroked icons the pill's chrome uses. */
interface LineIcons {
  readonly pin: string;
  readonly up: string;
  readonly down: string;
  readonly warn: string;
}
/** The design's line-icon table, minus `caret` (this plugin has no city menu). */
declare const LINE_ICONS: LineIcons;
//#endregion
//#region src/client/styles.d.ts
/**
 * The reference stylesheet under this plugin's own class prefix.
 *
 * `.wx__lens` → `.dshwx__lens`, `.wx[data-state]` → `.dshwx[data-state]`, while
 * `--wx-h`, `wx-spin`, `wx-bolt` and friends are untouched.
 */
declare const SCOPED_CSS: string;
/**
 * Layers the reference does not cover.
 *
 * `.dshwx--compact` — the same glass pill at header scale, carrying every part
 * of the reading the user switched on.
 */
declare const LAYOUT_CSS = "\n/* ---------- wrapper spans around the inline SVG artwork ----------\n   The reference injects its SVG directly into .wx__icon / .wx__loc / .wx__hl,\n   so its own \"… svg { … }\" rules size them. These spans keep that contract while\n   giving React one stable child to own. */\n.dshwx__glyph,\n.dshwx__drop,\n.dshwx__pin,\n.dshwx__arrow {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n}\n.dshwx__glyph {\n  width: 100%;\n  height: 100%;\n}\n.dshwx__drop {\n  width: 10px;\n  height: 10px;\n  opacity: 0.9;\n}\n.dshwx__drop svg {\n  width: 100%;\n  height: 100%;\n}\n\n/* ---------- compact pill: the whole design at header scale ---------- */\n.dshwx--compact {\n  --wx-h: 30px;\n  padding: 0 12px 0 10px;\n  gap: 0 9px;\n  cursor: pointer;\n  /* a button/div reset: the glass is painted by ::before, never by background */\n  border: 0;\n  font: inherit;\n  text-align: left;\n}\n.dshwx--compact:focus-visible {\n  outline: 2px solid rgba(255, 255, 255, 0.75);\n  outline-offset: 2px;\n}\n.dshwx--compact .dshwx__icon {\n  width: 20px;\n  height: 20px;\n}\n.dshwx--compact .dshwx__halo {\n  inset: -14%;\n  filter: blur(4px);\n}\n.dshwx--compact .dshwx__loc {\n  gap: 4px;\n  padding: 3px 6px 3px 3px;\n  font-size: 11.5px;\n  border-radius: 9px;\n}\n.dshwx--compact .dshwx__loc svg {\n  width: 10px;\n  height: 10px;\n}\n.dshwx--compact .dshwx__primary {\n  gap: 0 11px;\n}\n.dshwx--compact .dshwx__now {\n  gap: 7px;\n}\n.dshwx--compact .dshwx__temp {\n  font-size: 16px;\n  letter-spacing: -0.4px;\n}\n.dshwx--compact .dshwx__temp sup {\n  top: 0.08em;\n  font-size: 0.5em;\n}\n.dshwx--compact .dshwx__cond {\n  font-size: 12px;\n}\n.dshwx--compact .dshwx__hl {\n  gap: 9px;\n  font-size: 11.5px;\n}\n.dshwx--compact .dshwx__hl span {\n  gap: 3px;\n}\n.dshwx--compact .dshwx__hl svg {\n  width: 9px;\n  height: 9px;\n}\n.dshwx--compact .dshwx__hl::before {\n  left: -6px;\n  height: 14px;\n}\n.dshwx--compact .dshwx__clock {\n  padding-left: 8px;\n}\n.dshwx--compact .dshwx__time {\n  font-size: 12px;\n}\n.dshwx--compact .dshwx__warn {\n  width: 13px;\n  height: 13px;\n  margin-left: -2px;\n}\n.dshwx--compact .dshwx__drop {\n  width: 10px;\n  height: 10px;\n  /* the reference gives text a shadow for legibility on light glass; an inline\n     SVG cannot take text-shadow, so it gets the equivalent drop-shadow */\n  filter: drop-shadow(0 1px 3px rgba(84, 108, 148, 0.45));\n}\n";
/** Everything this plugin puts into the document. */
declare const ALL_CSS: string;
/**
 * Insert the stylesheet once and hand back the remover.
 *
 * The element is tagged, so a hot reload or a second mount cannot stack
 * duplicates: an existing tag is reused.
 */
declare function installStyles(doc?: Document): () => void;
//#endregion
//#region src/weather.d.ts
/**
 * Open-Meteo access and WMO weather-code interpretation.
 *
 * This module is deliberately free of Node-only APIs (no `node:*` imports), so
 * the browser half of the plugin reuses the same weather-code table and the
 * same request shapes as the Host tool. Both `fetch` and `URL` exist in Node 22
 * and in every supported browser.
 */
/** Realtime + short-range forecast from Open-Meteo. */
interface WeatherReport {
  /** Resolved place name (geocoder's name for the coordinate, or the query). */
  location: string;
  /** Latitude the report was read at. */
  latitude: number;
  /** Longitude the report was read at. */
  longitude: number;
  /** Current 2 m air temperature in °C. */
  temperature: number;
  /** WMO weather code describing the current condition. */
  weathercode: number;
  /** Chinese description of {@link WeatherReport.weathercode}. */
  weatherText: string;
  /** Current precipitation in mm. */
  precipitation: number;
  /** Current 10 m wind speed in km/h. */
  windSpeed: number;
  /** Current relative humidity at 2 m, in percent (0–100). */
  humidity: number;
  /** Total cloud cover in percent (0–100). */
  cloudCover: number;
  /** Rain portion of the current precipitation, in mm. */
  rain: number;
  /** Snowfall portion of the current precipitation, in cm. */
  snowfall: number;
  /** Current wind gust speed at 10 m, in km/h. */
  gust: number;
  /** Mean sea-level pressure in hPa. */
  pressure: number;
  /** Horizontal visibility in metres. */
  visibility: number;
  /** Convective available potential energy in J/kg. */
  cape: number;
  /** One entry per forecast day, oldest first. */
  daily: WeatherDay[];
}
/** One forecast day. */
interface WeatherDay {
  /** ISO date (`YYYY-MM-DD`) in the location's own timezone. */
  date: string;
  /** Daily maximum 2 m temperature in °C. */
  tempMax: number;
  /** Daily minimum 2 m temperature in °C. */
  tempMin: number;
  /** WMO weather code for the day. */
  weathercode: number;
  /** Chinese description of {@link WeatherDay.weathercode}. */
  weatherText: string;
  /** Total precipitation for the day in mm. */
  precipitationSum: number;
}
//#endregion
//#region src/client/locate.d.ts
/**
 * A short place name for the pill: the city alone, not "city, province, country".
 *
 * The header has room for a name, not for an address.
 */
declare function cityOnly(label: string | undefined): string;
/** The fields this plugin reads out of a reverse-geocode answer. */
interface ReverseBody {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  localityInfo?: {
    administrative?: {
      name?: string;
      adminLevel?: number;
    }[];
  };
}
/**
 * Pick the most specific real place name out of a reverse-geocode answer.
 *
 * Most specific wins: a county or district ("南昌县") identifies the place far
 * better than the city containing it ("南昌市") or the province, so the
 * administrative entries are walked from the deepest level outwards, after the
 * answer's own `locality` field.
 */
declare function pickPlaceName(body: ReverseBody): string | undefined;
/** The particulate readings the pill uses to tell haze and blowing dust apart. */
interface AirReading {
  /** Fine particulates in µg/m³ — the haze signal. */
  pm25: number;
  /** Coarse particulates in µg/m³ — the blowing-dust signal. */
  pm10: number;
  /** Modelled dust concentration in µg/m³. */
  dust: number;
}
/** One resolved client-side reading: the weather plus the optional air sample. */
interface ClientWeather {
  report: WeatherReport;
  air: AirReading | undefined;
}
/**
 * Full client-side weather resolution: configured city first, automatic
 * location otherwise, then one Open-Meteo read for the current condition plus
 * (in parallel) one air-quality read for the particulates.
 *
 * @param city - the `city` field of the plugin config (may be empty).
 * @param signal - aborts the in-flight requests when settings change again.
 * @returns the reading, or throws when Open-Meteo cannot be reached.
 */
declare function resolveWeather(city: string, signal?: AbortSignal): Promise<ClientWeather>;
//#endregion
//#region src/client/index.d.ts
/** Slot the pill registers into: title-adjacent session actions. */
declare const HEADER_SLOT = "conversation.session.header.actions";
/** Where the particle policy is remembered (per browser profile). */
declare const PARTICLES_STORAGE_KEY = "dsh-weather:particles";
/** Where the pill's field switches are remembered. */
declare const FIELDS_STORAGE_KEY = "dsh-weather:pill-fields";
/** Where the local manual weather state is remembered. */
declare const STATE_STORAGE_KEY = "dsh-weather:state";
/** Default particle policy: the design's layer runs in the pill. */
declare const DEFAULT_PARTICLE_MODE: ParticleMode;
interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}
/**
 * What the pill is allowed to show.
 *
 * Structurally a superset of {@link PillReading}, so the whole snapshot can be
 * handed to the pill without copying.
 */
interface OverlayStatus extends PillReading {
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
interface ConfigFormsLike {
  get<T>(entryId: string): ConfigForm<T>;
  describe(): {
    getSnapshot(): {
      status: string;
      view: {
        namespaces: readonly {
          ns: string;
          value: unknown;
        }[];
      } | undefined;
    };
    subscribe(listener: () => void): () => void;
    ensure(): Promise<void>;
  };
}
/** Settings section shape as the browser sees it. */
type WeatherValue = Partial<WeatherConfig>;
/** Binding between the settings mirror and the card. */
interface FormBinding {
  getForm(): ConfigForm<WeatherValue> | undefined;
  subscribe(listener: () => void): () => void;
}
/** Reads the particle policy from the browser. */
declare function readStoredParticleMode(): ParticleMode;
/** Persists the particle policy; a blocked storage keeps the session value. */
declare function writeStoredParticleMode(mode: ParticleMode): void;
/** Reads the pill's field switches from the browser. */
declare function readStoredFields(): PillFields;
/** Persists the field switches. */
declare function writeStoredFields(fields: PillFields): void;
/** True when a value names one of the design's 23 states. */
declare function isGlassState(value: unknown): value is GlassState;
/**
 * Reads the local manual state.
 *
 * This is what makes all 23 states reachable: four of them (haze, sandstorm,
 * typhoon, tornado) have no WMO code behind them, so nothing but a manual pick
 * can show them.
 */
declare function readStoredState(): GlassState | '';
/** Persists the local manual state. */
declare function writeStoredState(state: GlassState | ''): void;
/** The settings card contributed to `settings.plugins.tab`. */
declare function WeatherSettingsCard(props: {
  binding: FormBinding;
  status: Store<OverlayStatus>;
  particles: Store<ParticleMode>;
  fields: Store<PillFields>;
  state: Store<GlassState | ''>;
  onRefresh: () => void;
}): ReactElement;
/**
 * Build a complete config from whatever the settings document resolved.
 *
 * A patch `config` block replaces a section wholesale, so a field the user never
 * touched can arrive absent or `null`. Every field is therefore validated on its
 * own — spreading the raw section over the defaults would let `manualEffect:
 * null` through and silently switch the override off.
 */
declare function coerceConfig(raw: unknown): WeatherConfig;
/** Client plugin identity (informational; the module id is the package name). */
declare const name = "dsh-glass-weather";
/** No hard service dependency: everything below is injected optionally. */
declare const inject: readonly string[];
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
declare function apply(ctx: Context): void;
/** The settings describe face, as this half consumes it. */
type DescribeFace = ReturnType<ConfigFormsLike['describe']>;
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
declare function resolveNamespace(describe: DescribeFace): string;
declare const _default: {
  name: string;
  inject: readonly string[];
  apply: typeof apply;
};
//#endregion
export { ALL_CSS, DEFAULT_FIELDS, DEFAULT_PARTICLE_MODE, FIELDS_STORAGE_KEY, FIELD_OPTIONS, FX_PRESETS, FormBinding, GlassPill, HEADER_SLOT, LAYOUT_CSS, LINE_ICONS, OverlayStatus, PARTICLES_STORAGE_KEY, ParticleFx, type ParticleMode, type PillFields, type PillReading, type ReverseBody, SCOPED_CSS, STATES, STATE_LIST, STATE_STORAGE_KEY, WeatherSettingsCard, apply, artFor, cityOnly, coerceConfig, coerceFields, _default as default, inject, installStyles, isGlassState, name, pickPlaceName, readStoredFields, readStoredParticleMode, readStoredState, resolveNamespace, resolveWeather, stateForCode, stateForManual, stateLabel, stateWarn, writeStoredFields, writeStoredParticleMode, writeStoredState };
return module.exports; } });