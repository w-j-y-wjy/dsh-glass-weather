/**
 * Browser-side location resolution and weather lookup.
 *
 * Three-level fallback, cheapest and most accurate first:
 *   1. `navigator.geolocation` (5 s timeout),
 *   2. `https://ipapi.co/json/` (IP-based city coarse fix),
 *   3. Beijing as the last resort.
 *
 * A successful coordinate is cached in `localStorage` for 30 minutes so a page
 * reload does not re-prompt the browser for permission.
 */
import { fetchWeather, geocodeWithFallback, type WeatherReport } from '../weather.ts';

/** A resolved place. */
export interface Coordinate {
  latitude: number;
  longitude: number;
  /** Display name when known. */
  label?: string;
  /** How the coordinate was obtained (diagnostics only). */
  source: 'geolocation' | 'ip' | 'default' | 'city' | 'cache';
}

/** Last-resort coordinate: Beijing. */
export const FALLBACK_COORDINATE: Coordinate = Object.freeze({
  latitude: 39.9042,
  longitude: 116.4074,
  label: '北京',
  source: 'default',
});

/** Ceiling on how long a cached fix is trusted. */
export const CACHE_TTL_MS = 30 * 60 * 1000;

const CACHE_KEY = 'dsh-weather:coordinate';

/** Read a non-expired cached fix. */
export function readCachedCoordinate(now: number = Date.now()): Coordinate | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return undefined;
    const parsed = JSON.parse(raw) as { at?: number; latitude?: number; longitude?: number; label?: string };
    if (
      typeof parsed.at !== 'number' ||
      typeof parsed.latitude !== 'number' ||
      typeof parsed.longitude !== 'number' ||
      now - parsed.at > CACHE_TTL_MS
    ) {
      return undefined;
    }
    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      label: parsed.label,
      source: 'cache',
    };
  } catch {
    return undefined;
  }
}

/** Persist a fix for the next {@link CACHE_TTL_MS} window. */
export function writeCachedCoordinate(coordinate: Coordinate, now: number = Date.now()): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        at: now,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        label: coordinate.label,
      }),
    );
  } catch {
    /* private mode / quota — the cache is an optimisation, never a requirement */
  }
}

/** Level 1: the browser's own positioning. */
export function locateByGeolocation(timeoutMs = 5000): Promise<Coordinate> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      reject(new Error('geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'geolocation',
        });
      },
      (error) => {
        reject(new Error(`geolocation failed: ${error.message}`));
      },
      { timeout: timeoutMs, maximumAge: CACHE_TTL_MS, enableHighAccuracy: false },
    );
  });
}

/** Level 2: coarse IP geolocation. */
export async function locateByIp(signal?: AbortSignal): Promise<Coordinate> {
  const response = await fetch('https://ipapi.co/json/', { signal });
  if (!response.ok) throw new Error(`ipapi responded ${String(response.status)}`);
  const body = (await response.json()) as {
    latitude?: number;
    longitude?: number;
    city?: string;
    region?: string;
  };
  if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
    throw new Error('ipapi answer carried no coordinates');
  }
  return {
    latitude: body.latitude,
    longitude: body.longitude,
    label: [body.city, body.region].filter((part): part is string => typeof part === 'string' && part.length > 0).join(', '),
    source: 'ip',
  };
}

/** Run the three-level fallback. Never rejects: the last level is a constant. */
export async function locate(signal?: AbortSignal): Promise<Coordinate> {
  const cached = readCachedCoordinate();
  if (cached !== undefined) return cached;
  try {
    const precise = await locateByGeolocation();
    writeCachedCoordinate(precise);
    return precise;
  } catch {
    /* fall through */
  }
  try {
    const coarse = await locateByIp(signal);
    writeCachedCoordinate(coarse);
    return coarse;
  } catch {
    /* fall through */
  }
  return { ...FALLBACK_COORDINATE };
}

/** Resolve a city name (or `lat,lon`) into a coordinate. */
export async function coordinateForCity(city: string, signal?: AbortSignal): Promise<Coordinate | undefined> {
  const query = city.trim();
  if (query.length === 0) return undefined;
  const pair = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(query);
  if (pair !== null) {
    return {
      latitude: Number(pair[1]),
      longitude: Number(pair[2]),
      label: query,
      source: 'city',
    };
  }
  const hit = await geocodeWithFallback(query, signal);
  if (hit === undefined) return undefined;
  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    label: [hit.name, hit.admin1, hit.country].filter((part): part is string => typeof part === 'string' && part.length > 0).join(', '),
    source: 'city',
  };
}

/**
 * A short place name for the pill: the city alone, not "city, province, country".
 *
 * The header has room for a name, not for an address.
 */
export function cityOnly(label: string | undefined): string {
  const raw = (label ?? '').trim();
  if (raw.length === 0) return '';
  const first = raw.split(',')[0]?.trim() ?? '';
  return first.length > 0 ? first : raw;
}

/** True when a label is really just "28.6882, 116.0119". */
function looksLikeCoordinates(label: string): boolean {
  return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(label);
}

/** Keyless reverse geocoder; Open-Meteo itself has no reverse endpoint. */
export const REVERSE_ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

/** The fields this plugin reads out of a reverse-geocode answer. */
export interface ReverseBody {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  localityInfo?: { administrative?: { name?: string; adminLevel?: number }[] };
}

/**
 * Pick the most specific real place name out of a reverse-geocode answer.
 *
 * Most specific wins: a county or district ("南昌县") identifies the place far
 * better than the city containing it ("南昌市") or the province, so the
 * administrative entries are walked from the deepest level outwards, after the
 * answer's own `locality` field.
 */
export function pickPlaceName(body: ReverseBody): string | undefined {
  const admin = (body.localityInfo?.administrative ?? [])
    .filter((entry): entry is { name: string; adminLevel?: number } => typeof entry.name === 'string')
    .filter((entry) => (entry.adminLevel ?? 0) >= 5)
    .sort((a, b) => (b.adminLevel ?? 0) - (a.adminLevel ?? 0));
  const candidates: (string | undefined)[] = [
    body.locality,
    ...admin.map((entry) => entry.name),
    body.city,
    body.principalSubdivision,
  ];
  for (const candidate of candidates) {
    const name = cityOnly(candidate);
    if (name.length > 0) return name;
  }
  return undefined;
}

/** Ask the keyless reverse geocoder for a name; `undefined` when it cannot say. */
async function reverseGeocode(coordinate: Coordinate, signal?: AbortSignal): Promise<string | undefined> {
  const url = new URL(REVERSE_ENDPOINT);
  url.searchParams.set('latitude', String(coordinate.latitude));
  url.searchParams.set('longitude', String(coordinate.longitude));
  url.searchParams.set('localityLanguage', 'zh');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`reverse geocoder responded ${String(response.status)}`);
  return pickPlaceName((await response.json()) as ReverseBody);
}

/**
 * Resolve the name to show for a coordinate.
 *
 * `navigator.geolocation` hands back numbers with no name attached, so a bare
 * coordinate goes through the reverse geocoder first and the IP-level city
 * second; whatever comes out is cached *with* the coordinate, so the lookup
 * happens once per cache window rather than once per refresh. When neither
 * source can name the place the label stays empty and the pill simply omits the
 * place — it never prints a placeholder such as "当前位置".
 */
async function displayLabel(coordinate: Coordinate, signal?: AbortSignal): Promise<string> {
  const raw = (coordinate.label ?? '').trim();
  if (raw.length > 0 && !looksLikeCoordinates(raw)) return cityOnly(raw);
  try {
    const named = await reverseGeocode(coordinate, signal);
    if (named !== undefined) {
      writeCachedCoordinate({ ...coordinate, label: named });
      return named;
    }
  } catch {
    /* offline, blocked or rate-limited: fall through to the coarser source */
  }
  try {
    const coarse = await locateByIp(signal);
    const name = cityOnly(coarse.label);
    if (name.length > 0) {
      writeCachedCoordinate({ ...coordinate, label: name });
      return name;
    }
  } catch {
    /* nothing left to ask: the pill then shows no place at all */
  }
  return '';
}

/** Air-quality endpoint; the same keyless provider as the forecast. */
export const AIR_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/** The particulate readings the pill uses to tell haze and blowing dust apart. */
export interface AirReading {
  /** Fine particulates in µg/m³ — the haze signal. */
  pm25: number;
  /** Coarse particulates in µg/m³ — the blowing-dust signal. */
  pm10: number;
  /** Modelled dust concentration in µg/m³. */
  dust: number;
}

/**
 * Read the current particulate levels.
 *
 * Air quality is a *bonus* signal: the forecast alone already answers every
 * ordinary question, so a blocked, slow or rate-limited air service degrades to
 * `undefined` and the pill keeps working from the weather code.
 */
export async function fetchAirQuality(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<AirReading | undefined> {
  try {
    const url = new URL(AIR_ENDPOINT);
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', 'pm2_5,pm10,dust');
    url.searchParams.set('timezone', 'auto');
    const response = await fetch(url, { signal });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { current?: { pm2_5?: number; pm10?: number; dust?: number } };
    const current = body.current ?? {};
    return {
      pm25: Number(current.pm2_5 ?? 0),
      pm10: Number(current.pm10 ?? 0),
      dust: Number(current.dust ?? 0),
    };
  } catch {
    return undefined;
  }
}

/** One resolved client-side reading: the weather plus the optional air sample. */
export interface ClientWeather {
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
export async function resolveWeather(city: string, signal?: AbortSignal): Promise<ClientWeather> {
  const manual = await coordinateForCity(city, signal).catch(() => undefined);
  const coordinate = manual ?? (await locate(signal));
  const label = await displayLabel(coordinate, signal);
  const [report, air] = await Promise.all([
    fetchWeather(coordinate.latitude, coordinate.longitude, 1, signal, label),
    fetchAirQuality(coordinate.latitude, coordinate.longitude, signal),
  ]);
  return { report, air };
}
