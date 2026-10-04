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
export type GlassState =
  | 'sunny'
  | 'partly'
  | 'cloudy'
  | 'overcast'
  | 'fog'
  | 'haze'
  | 'drizzle'
  | 'rainy'
  | 'shower'
  | 'thunder'
  | 'sleet'
  | 'snowy'
  | 'windy'
  | 'night'
  | 'rainstorm'
  | 'blizzard'
  | 'hail'
  | 'icyrain'
  | 'sandstorm'
  | 'typhoon'
  | 'tornado'
  | 'heatwave'
  | 'coldwave';

/** Warning-badge levels, as the design's four colours. */
export type WarnLevel = 'blue' | 'yellow' | 'orange' | 'red';

/** Everything the pill needs to know about one state. */
export interface StateInfo {
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
export const STATES: Readonly<Record<GlassState, StateInfo>> = Object.freeze({
  sunny: { label: 'Sunny', zh: '晴', group: 0 },
  partly: { label: 'Partly Cloudy', zh: '多云转晴', group: 0 },
  cloudy: { label: 'Cloudy', zh: '多云', group: 0 },
  overcast: { label: 'Overcast', zh: '阴', group: 0 },
  fog: { label: 'Fog', zh: '雾', group: 0, warn: 'yellow' },
  haze: { label: 'Haze', zh: '霾', group: 0, warn: 'yellow' },
  drizzle: { label: 'Drizzle', zh: '毛毛雨', group: 0 },
  rainy: { label: 'Rainy', zh: '雨', group: 0 },
  shower: { label: 'Showers', zh: '阵雨', group: 0, warn: 'blue' },
  thunder: { label: 'Thunderstorm', zh: '雷雨', group: 0, warn: 'yellow' },
  sleet: { label: 'Sleet', zh: '雨夹雪', group: 0, warn: 'blue' },
  snowy: { label: 'Snowy', zh: '雪', group: 0 },
  windy: { label: 'Windy', zh: '大风', group: 0, warn: 'blue' },
  night: { label: 'Clear Night', zh: '晴夜', group: 0 },

  rainstorm: { label: 'Rainstorm', zh: '暴雨', group: 1, warn: 'red' },
  blizzard: { label: 'Blizzard', zh: '暴雪', group: 1, warn: 'orange' },
  hail: { label: 'Hail', zh: '冰雹', group: 1, warn: 'orange' },
  icyrain: { label: 'Freezing Rain', zh: '冻雨', group: 1, warn: 'orange' },
  sandstorm: { label: 'Sandstorm', zh: '沙尘暴', group: 1, warn: 'orange' },
  typhoon: { label: 'Typhoon', zh: '台风', group: 1, warn: 'red' },
  tornado: { label: 'Tornado', zh: '龙卷风', group: 1, warn: 'red' },
  heatwave: { label: 'Heatwave', zh: '高温', group: 1, warn: 'red' },
  coldwave: { label: 'Cold Wave', zh: '寒潮', group: 1, warn: 'orange' },
});

/** Every state, in the design's own order. */
export const STATE_LIST: readonly GlassState[] = Object.freeze(Object.keys(STATES) as GlassState[]);

/** WMO weather code → state. Codes outside the table are `undefined`. */
export const STATE_BY_CODE: Readonly<Record<number, GlassState>> = Object.freeze({
  0: 'sunny',
  1: 'partly',
  2: 'partly',
  3: 'overcast',
  45: 'fog',
  48: 'fog',
  51: 'drizzle',
  53: 'drizzle',
  55: 'rainy',
  56: 'icyrain',
  57: 'icyrain',
  61: 'rainy',
  63: 'rainy',
  65: 'rainstorm',
  66: 'icyrain',
  67: 'icyrain',
  71: 'snowy',
  73: 'snowy',
  75: 'blizzard',
  77: 'snowy',
  80: 'shower',
  81: 'shower',
  82: 'rainstorm',
  85: 'snowy',
  86: 'blizzard',
  95: 'thunder',
  96: 'hail',
  99: 'hail',
});

/** The plugin's existing `manualEffect` values, mapped onto states. */
export const MANUAL_STATE: Readonly<Record<string, GlassState>> = Object.freeze({
  rain: 'rainy',
  snow: 'snowy',
  fog: 'fog',
  thunder: 'thunder',
});

/** Extra readings that can escalate an ordinary sky into a severe state. */
export interface StateHints {
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

/** States a temperature or wind extreme is allowed to replace. */
const CALM_STATES: readonly GlassState[] = Object.freeze(['sunny', 'partly', 'cloudy', 'overcast', 'fog', 'haze']);

/** States that turn into sleet when snow and rain fall together. */
const SLEET_STATES: readonly GlassState[] = Object.freeze(['drizzle', 'rainy', 'shower', 'snowy']);

/** °C at which the pill starts calling it a heatwave. */
export const HEATWAVE_C = 35;
/** °C at which the pill starts calling it a cold wave. */
export const COLDWAVE_C = -15;
/** km/h at which a dry sky becomes `windy`. */
export const WINDY_KMH = 39;
/** Sustained km/h at which wind is typhoon force (Beaufort 12). */
export const TYPHOON_KMH = 118;
/** hPa at or below which a deep low counts as a typhoon centre. */
export const TYPHOON_HPA = 995;
/** Cloud cover in percent from which a clear sky becomes `cloudy`. */
export const CLOUDY_PERCENT = 60;
/** PM2.5 in µg/m³ from which the pill calls the air hazy. */
export const HAZE_PM25 = 75;
/** PM10 in µg/m³ that only a dust storm reaches. */
export const SANDSTORM_PM10 = 420;
/** Dust concentration in µg/m³ that is unambiguous on its own. */
export const SANDSTORM_DUST = 200;
/** km/h of wind required before coarse dust counts as a dust storm. */
export const SANDSTORM_KMH = 20;
/** mm of rain from which mixed rain-and-snow is reported as sleet. */
export const SLEET_MM = 0.1;
/** Visibility in metres below which it is fog, not haze. */
export const FOG_VISIBILITY_M = 1000;
/** Local hours considered night. */
export const NIGHT_HOURS: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 5, 22, 23]);

/** Wind and pressure together: a tropical-cyclone-grade low. */
function isTyphoonForce(hints: StateHints): boolean {
  const pressure = hints.pressure;
  return (hints.windSpeed ?? 0) >= TYPHOON_KMH && pressure !== undefined && pressure > 0 && pressure <= TYPHOON_HPA;
}

/** Rain and snow falling in the same reading is sleet by definition. */
function isSleet(hints: StateHints): boolean {
  return (hints.rain ?? 0) >= SLEET_MM && (hints.snowfall ?? 0) > 0;
}

/** Blowing dust: either unambiguous dust, or coarse dust carried by wind. */
function isSandstorm(hints: StateHints): boolean {
  if ((hints.dust ?? 0) >= SANDSTORM_DUST) return true;
  return (hints.pm10 ?? 0) >= SANDSTORM_PM10 && (hints.windSpeed ?? 0) >= SANDSTORM_KMH;
}

/** Haze needs fine particulates, and never claims a reading that is really fog. */
function isHazy(hints: StateHints): boolean {
  if ((hints.pm25 ?? 0) < HAZE_PM25) return false;
  const visibility = hints.visibility;
  return visibility === undefined || visibility >= FOG_VISIBILITY_M;
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
export function stateForCode(code: number | undefined, hints: StateHints = {}): GlassState {
  const base = code === undefined ? undefined : STATE_BY_CODE[code];
  const sky = base ?? 'partly';

  if (isTyphoonForce(hints)) return 'typhoon';
  if (SLEET_STATES.includes(sky) && isSleet(hints)) return 'sleet';
  if (!CALM_STATES.includes(sky)) return sky;

  if (isSandstorm(hints)) return 'sandstorm';
  if (sky !== 'fog' && isHazy(hints)) return 'haze';

  const { temperature, windSpeed, cloudCover, hour } = hints;
  if (temperature !== undefined && temperature >= HEATWAVE_C) return 'heatwave';
  if (temperature !== undefined && temperature <= COLDWAVE_C) return 'coldwave';
  if ((sky === 'sunny' || sky === 'partly') && windSpeed !== undefined && windSpeed >= WINDY_KMH) return 'windy';
  if ((sky === 'sunny' || sky === 'partly') && (cloudCover ?? 0) >= CLOUDY_PERCENT) return 'cloudy';
  if (sky === 'sunny' && hour !== undefined && NIGHT_HOURS.includes(hour)) return 'night';
  return sky;
}

/** The state a `manualEffect` value forces, or `undefined` for `auto`. */
export function stateForManual(kind: string): GlassState | undefined {
  return MANUAL_STATE[kind];
}

/** The design's Chinese label for a state. */
export function stateLabel(state: GlassState): string {
  return STATES[state].zh;
}

/** The design's English label for a state. */
export function stateEnglish(state: GlassState): string {
  return STATES[state].label;
}

/** The warning badge a state implies, if any. */
export function stateWarn(state: GlassState): WarnLevel | undefined {
  return STATES[state].warn;
}