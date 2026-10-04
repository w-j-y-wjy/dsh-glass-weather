/**
 * Open-Meteo access and WMO weather-code interpretation.
 *
 * This module is deliberately free of Node-only APIs (no `node:*` imports), so
 * the browser half of the plugin reuses the same weather-code table and the
 * same request shapes as the Host tool. Both `fetch` and `URL` exist in Node 22
 * and in every supported browser.
 */

/** Realtime + short-range forecast from Open-Meteo. */
export interface WeatherReport {
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
export interface WeatherDay {
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

/** One geocoder hit. */
export interface GeocodeHit {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

/** WMO 4677 weather-code wording used by Open-Meteo. */
export const WMO_TEXT: Readonly<Record<number, string>> = Object.freeze({
  0: '晴',
  1: '晴间多云',
  2: '局部多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  56: '轻度冻毛毛雨',
  57: '强冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '轻度冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '阵雨',
  82: '强阵雨',
  85: '小阵雪',
  86: '强阵雪',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹',
});

/** Chinese description for a WMO weather code. */
export function describeWeather(code: number): string {
  return WMO_TEXT[code] ?? `未知天气(${String(code)})`;
}

/** Endpoint of the forecast API (keyless). */
export const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

/** Endpoint of the geocoding API (keyless). */
export const GEOCODE_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';

/** Timeout applied to every Open-Meteo request. */
export const REQUEST_TIMEOUT_MS = 8000;

/** Clamp a requested forecast length into Open-Meteo's supported 1–7 range. */
export function clampDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return 1;
  return Math.min(7, Math.max(1, Math.trunc(days)));
}

/** Compose a request timeout that also honours an optional outer signal. */
function timeoutSignal(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Open-Meteo request timed out after ${String(ms)} ms`));
  }, ms);
  const forward = (): void => {
    controller.abort(signal?.reason);
  };
  if (signal !== undefined) {
    if (signal.aborted) forward();
    else signal.addEventListener('abort', forward, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    },
  };
}

/** Resolve a city name to coordinates through Open-Meteo's geocoder. */
export async function geocode(city: string, signal?: AbortSignal): Promise<GeocodeHit | undefined> {
  const query = city.trim();
  if (query.length === 0) return undefined;
  const url = new URL(GEOCODE_ENDPOINT);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'zh');
  url.searchParams.set('format', 'json');
  const guard = timeoutSignal(signal, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: guard.signal });
    if (!response.ok) throw new Error(`Open-Meteo geocoding responded ${String(response.status)} ${response.statusText}`);
    const body = (await response.json()) as { results?: GeocodeHit[] };
    return body.results?.[0];
  } finally {
    guard.done();
  }
}

/** Read the current condition and the next `days` days for one coordinate. */
export async function fetchWeather(
  latitude: number,
  longitude: number,
  days: number,
  signal?: AbortSignal,
  locationLabel?: string,
): Promise<WeatherReport> {
  const wanted = clampDays(days);
  const url = new URL(FORECAST_ENDPOINT);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'weather_code',
      'precipitation',
      'wind_speed_10m',
      // The extra readings the pill needs to tell states apart that a WMO code
      // cannot express: cloud cover (多云), rain+snow together (雨夹雪), gusts
      // and pressure (台风级), visibility (沙尘/霾).
      'cloud_cover',
      'rain',
      'snowfall',
      'wind_gusts_10m',
      'pressure_msl',
      'visibility',
      'cape',
    ].join(','),
  );
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum');
  url.searchParams.set('forecast_days', String(wanted));
  url.searchParams.set('timezone', 'auto');
  const guard = timeoutSignal(signal, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: guard.signal });
    if (!response.ok) throw new Error(`Open-Meteo forecast responded ${String(response.status)} ${response.statusText}`);
    const body = (await response.json()) as {
      latitude?: number;
      longitude?: number;
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        weather_code?: number;
        precipitation?: number;
        wind_speed_10m?: number;
        cloud_cover?: number;
        rain?: number;
        snowfall?: number;
        wind_gusts_10m?: number;
        pressure_msl?: number;
        visibility?: number;
        cape?: number;
      };
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        weather_code?: number[];
        precipitation_sum?: number[];
      };
    };
    const current = body.current ?? {};
    const daily = body.daily ?? {};
    const dates = daily.time ?? [];
    const code = Number(current.weather_code ?? 0);
    return {
      location: locationLabel ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      latitude: body.latitude ?? latitude,
      longitude: body.longitude ?? longitude,
      temperature: Number(current.temperature_2m ?? 0),
      weathercode: code,
      weatherText: describeWeather(code),
      precipitation: Number(current.precipitation ?? 0),
      windSpeed: Number(current.wind_speed_10m ?? 0),
      humidity: Number(current.relative_humidity_2m ?? 0),
      cloudCover: Number(current.cloud_cover ?? 0),
      rain: Number(current.rain ?? 0),
      snowfall: Number(current.snowfall ?? 0),
      gust: Number(current.wind_gusts_10m ?? 0),
      pressure: Number(current.pressure_msl ?? 0),
      visibility: Number(current.visibility ?? 0),
      cape: Number(current.cape ?? 0),
      daily: dates.map((date, index) => {
        const dayCode = Number(daily.weather_code?.[index] ?? 0);
        return {
          date,
          tempMax: Number(daily.temperature_2m_max?.[index] ?? 0),
          tempMin: Number(daily.temperature_2m_min?.[index] ?? 0),
          weathercode: dayCode,
          weatherText: describeWeather(dayCode),
          precipitationSum: Number(daily.precipitation_sum?.[index] ?? 0),
        };
      }),
    };
  } finally {
    guard.done();
  }
}

/** Administrative suffixes the geocoder is picky about. */
const ADMIN_SUFFIX = /[县市省区镇乡盟旗]$/;

/**
 * Resolve a city name, retrying without a trailing administrative suffix.
 *
 * Open-Meteo's gazetteer knows `南昌` but not `南昌县`, so a query ending in
 * 县/市/区/… is retried once with that character removed. Users type their own
 * administrative division, and failing on it would be a needless dead end.
 */
export async function geocodeWithFallback(city: string, signal?: AbortSignal): Promise<GeocodeHit | undefined> {
  const query = city.trim();
  if (query.length === 0) return undefined;
  const first = await geocode(query, signal);
  if (first !== undefined) return first;
  if (ADMIN_SUFFIX.test(query) && query.length > 1) {
    return geocode(query.slice(0, -1), signal);
  }
  return undefined;
}

/**
 * Resolve one user-facing location argument into a report.
 *
 * A numeric `lat,lon` argument is used verbatim; anything else is geocoded.
 */
export async function reportForLocation(
  location: string,
  days: number,
  signal?: AbortSignal,
): Promise<WeatherReport> {
  const query = location.trim();
  if (query.length === 0) {
    throw new Error('get_weather requires a non-empty location; pass a city name such as "北京".');
  }
  const pair = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(query);
  if (pair !== null) {
    const latitude = Number(pair[1]);
    const longitude = Number(pair[2]);
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new Error(`get_weather received out-of-range coordinates "${query}".`);
    }
    return fetchWeather(latitude, longitude, days, signal, query);
  }
  const hit = await geocodeWithFallback(query, signal);
  if (hit === undefined) {
    throw new Error(
      `get_weather could not resolve "${query}" to a place. Use a city name such as "北京" or "Shanghai", or pass "lat,lon".`,
    );
  }
  const label = [hit.name, hit.admin1, hit.country].filter((part): part is string => typeof part === 'string' && part.length > 0).join(', ');
  return fetchWeather(hit.latitude, hit.longitude, days, signal, label);
}
