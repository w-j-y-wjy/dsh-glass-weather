window.__ModuleLoader__.load({ id: "dsh-glass-weather", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
Object.defineProperties(exports, {
	__esModule: { value: true },
	[Symbol.toStringTag]: { value: "Module" }
});
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
//#region src/weather.ts
/** WMO 4677 weather-code wording used by Open-Meteo. */
const WMO_TEXT = Object.freeze({
	0: "晴",
	1: "晴间多云",
	2: "局部多云",
	3: "阴",
	45: "雾",
	48: "雾凇",
	51: "小毛毛雨",
	53: "毛毛雨",
	55: "大毛毛雨",
	56: "轻度冻毛毛雨",
	57: "强冻毛毛雨",
	61: "小雨",
	63: "中雨",
	65: "大雨",
	66: "轻度冻雨",
	67: "强冻雨",
	71: "小雪",
	73: "中雪",
	75: "大雪",
	77: "雪粒",
	80: "小阵雨",
	81: "阵雨",
	82: "强阵雨",
	85: "小阵雪",
	86: "强阵雪",
	95: "雷暴",
	96: "雷暴伴小冰雹",
	99: "雷暴伴大冰雹"
});
/** Chinese description for a WMO weather code. */
function describeWeather(code) {
	return WMO_TEXT[code] ?? `未知天气(${String(code)})`;
}
/** Endpoint of the forecast API (keyless). */
const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
/** Endpoint of the geocoding API (keyless). */
const GEOCODE_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
/** Timeout applied to every Open-Meteo request. */
const REQUEST_TIMEOUT_MS = 8e3;
/** Clamp a requested forecast length into Open-Meteo's supported 1–7 range. */
function clampDays(days) {
	if (days === void 0 || !Number.isFinite(days)) return 1;
	return Math.min(7, Math.max(1, Math.trunc(days)));
}
/** Compose a request timeout that also honours an optional outer signal. */
function timeoutSignal(signal, ms) {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort(/* @__PURE__ */ new Error(`Open-Meteo request timed out after ${String(ms)} ms`));
	}, ms);
	const forward = () => {
		controller.abort(signal?.reason);
	};
	if (signal !== void 0) {
		if (signal.aborted) forward();
		else signal.addEventListener("abort", forward, { once: true });
	}
	return {
		signal: controller.signal,
		done: () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", forward);
		}
	};
}
/** Resolve a city name to coordinates through Open-Meteo's geocoder. */
async function geocode(city, signal) {
	const query = city.trim();
	if (query.length === 0) return void 0;
	const url = new URL(GEOCODE_ENDPOINT);
	url.searchParams.set("name", query);
	url.searchParams.set("count", "1");
	url.searchParams.set("language", "zh");
	url.searchParams.set("format", "json");
	const guard = timeoutSignal(signal, REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, { signal: guard.signal });
		if (!response.ok) throw new Error(`Open-Meteo geocoding responded ${String(response.status)} ${response.statusText}`);
		return (await response.json()).results?.[0];
	} finally {
		guard.done();
	}
}
/** Read the current condition and the next `days` days for one coordinate. */
async function fetchWeather(latitude, longitude, days, signal, locationLabel) {
	const wanted = clampDays(days);
	const url = new URL(FORECAST_ENDPOINT);
	url.searchParams.set("latitude", String(latitude));
	url.searchParams.set("longitude", String(longitude));
	url.searchParams.set("current", [
		"temperature_2m",
		"relative_humidity_2m",
		"weather_code",
		"precipitation",
		"wind_speed_10m",
		"cloud_cover",
		"rain",
		"snowfall",
		"wind_gusts_10m",
		"pressure_msl",
		"visibility",
		"cape"
	].join(","));
	url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum");
	url.searchParams.set("forecast_days", String(wanted));
	url.searchParams.set("timezone", "auto");
	const guard = timeoutSignal(signal, REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, { signal: guard.signal });
		if (!response.ok) throw new Error(`Open-Meteo forecast responded ${String(response.status)} ${response.statusText}`);
		const body = await response.json();
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
					precipitationSum: Number(daily.precipitation_sum?.[index] ?? 0)
				};
			})
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
async function geocodeWithFallback(city, signal) {
	const query = city.trim();
	if (query.length === 0) return void 0;
	const first = await geocode(query, signal);
	if (first !== void 0) return first;
	if (ADMIN_SUFFIX.test(query) && query.length > 1) return geocode(query.slice(0, -1), signal);
}
//#endregion
//#region src/client/locate.ts
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
/** Last-resort coordinate: Beijing. */
const FALLBACK_COORDINATE = Object.freeze({
	latitude: 39.9042,
	longitude: 116.4074,
	label: "北京",
	source: "default"
});
/** Ceiling on how long a cached fix is trusted. */
const CACHE_TTL_MS = 18e5;
const CACHE_KEY = "dsh-weather:coordinate";
/** Read a non-expired cached fix. */
function readCachedCoordinate(now = Date.now()) {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (raw === null) return void 0;
		const parsed = JSON.parse(raw);
		if (typeof parsed.at !== "number" || typeof parsed.latitude !== "number" || typeof parsed.longitude !== "number" || now - parsed.at > 18e5) return;
		return {
			latitude: parsed.latitude,
			longitude: parsed.longitude,
			label: parsed.label,
			source: "cache"
		};
	} catch {
		return;
	}
}
/** Persist a fix for the next {@link CACHE_TTL_MS} window. */
function writeCachedCoordinate(coordinate, now = Date.now()) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({
			at: now,
			latitude: coordinate.latitude,
			longitude: coordinate.longitude,
			label: coordinate.label
		}));
	} catch {}
}
/** Level 1: the browser's own positioning. */
function locateByGeolocation(timeoutMs = 5e3) {
	return new Promise((resolve, reject) => {
		if (typeof navigator === "undefined" || navigator.geolocation === void 0) {
			reject(/* @__PURE__ */ new Error("geolocation unavailable"));
			return;
		}
		navigator.geolocation.getCurrentPosition((position) => {
			resolve({
				latitude: position.coords.latitude,
				longitude: position.coords.longitude,
				source: "geolocation"
			});
		}, (error) => {
			reject(/* @__PURE__ */ new Error(`geolocation failed: ${error.message}`));
		}, {
			timeout: timeoutMs,
			maximumAge: CACHE_TTL_MS,
			enableHighAccuracy: false
		});
	});
}
/** Level 2: coarse IP geolocation. */
async function locateByIp(signal) {
	const response = await fetch("https://ipapi.co/json/", { signal });
	if (!response.ok) throw new Error(`ipapi responded ${String(response.status)}`);
	const body = await response.json();
	if (typeof body.latitude !== "number" || typeof body.longitude !== "number") throw new Error("ipapi answer carried no coordinates");
	return {
		latitude: body.latitude,
		longitude: body.longitude,
		label: [body.city, body.region].filter((part) => typeof part === "string" && part.length > 0).join(", "),
		source: "ip"
	};
}
/** Run the three-level fallback. Never rejects: the last level is a constant. */
async function locate(signal) {
	const cached = readCachedCoordinate();
	if (cached !== void 0) return cached;
	try {
		const precise = await locateByGeolocation();
		writeCachedCoordinate(precise);
		return precise;
	} catch {}
	try {
		const coarse = await locateByIp(signal);
		writeCachedCoordinate(coarse);
		return coarse;
	} catch {}
	return { ...FALLBACK_COORDINATE };
}
/** Resolve a city name (or `lat,lon`) into a coordinate. */
async function coordinateForCity(city, signal) {
	const query = city.trim();
	if (query.length === 0) return void 0;
	const pair = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(query);
	if (pair !== null) return {
		latitude: Number(pair[1]),
		longitude: Number(pair[2]),
		label: query,
		source: "city"
	};
	const hit = await geocodeWithFallback(query, signal);
	if (hit === void 0) return void 0;
	return {
		latitude: hit.latitude,
		longitude: hit.longitude,
		label: [
			hit.name,
			hit.admin1,
			hit.country
		].filter((part) => typeof part === "string" && part.length > 0).join(", "),
		source: "city"
	};
}
/**
* A short place name for the pill: the city alone, not "city, province, country".
*
* The header has room for a name, not for an address.
*/
function cityOnly(label) {
	const raw = (label ?? "").trim();
	if (raw.length === 0) return "";
	const first = raw.split(",")[0]?.trim() ?? "";
	return first.length > 0 ? first : raw;
}
/** True when a label is really just "28.6882, 116.0119". */
function looksLikeCoordinates(label) {
	return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(label);
}
/** Keyless reverse geocoder; Open-Meteo itself has no reverse endpoint. */
const REVERSE_ENDPOINT = "https://api.bigdatacloud.net/data/reverse-geocode-client";
/**
* Pick the most specific real place name out of a reverse-geocode answer.
*
* Most specific wins: a county or district ("南昌县") identifies the place far
* better than the city containing it ("南昌市") or the province, so the
* administrative entries are walked from the deepest level outwards, after the
* answer's own `locality` field.
*/
function pickPlaceName(body) {
	const admin = (body.localityInfo?.administrative ?? []).filter((entry) => typeof entry.name === "string").filter((entry) => (entry.adminLevel ?? 0) >= 5).sort((a, b) => (b.adminLevel ?? 0) - (a.adminLevel ?? 0));
	const candidates = [
		body.locality,
		...admin.map((entry) => entry.name),
		body.city,
		body.principalSubdivision
	];
	for (const candidate of candidates) {
		const name = cityOnly(candidate);
		if (name.length > 0) return name;
	}
}
/** Ask the keyless reverse geocoder for a name; `undefined` when it cannot say. */
async function reverseGeocode(coordinate, signal) {
	const url = new URL(REVERSE_ENDPOINT);
	url.searchParams.set("latitude", String(coordinate.latitude));
	url.searchParams.set("longitude", String(coordinate.longitude));
	url.searchParams.set("localityLanguage", "zh");
	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error(`reverse geocoder responded ${String(response.status)}`);
	return pickPlaceName(await response.json());
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
async function displayLabel(coordinate, signal) {
	const raw = (coordinate.label ?? "").trim();
	if (raw.length > 0 && !looksLikeCoordinates(raw)) return cityOnly(raw);
	try {
		const named = await reverseGeocode(coordinate, signal);
		if (named !== void 0) {
			writeCachedCoordinate({
				...coordinate,
				label: named
			});
			return named;
		}
	} catch {}
	try {
		const name = cityOnly((await locateByIp(signal)).label);
		if (name.length > 0) {
			writeCachedCoordinate({
				...coordinate,
				label: name
			});
			return name;
		}
	} catch {}
	return "";
}
/** Air-quality endpoint; the same keyless provider as the forecast. */
const AIR_ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";
/**
* Read the current particulate levels.
*
* Air quality is a *bonus* signal: the forecast alone already answers every
* ordinary question, so a blocked, slow or rate-limited air service degrades to
* `undefined` and the pill keeps working from the weather code.
*/
async function fetchAirQuality(latitude, longitude, signal) {
	try {
		const url = new URL(AIR_ENDPOINT);
		url.searchParams.set("latitude", String(latitude));
		url.searchParams.set("longitude", String(longitude));
		url.searchParams.set("current", "pm2_5,pm10,dust");
		url.searchParams.set("timezone", "auto");
		const response = await fetch(url, { signal });
		if (!response.ok) return void 0;
		const current = (await response.json()).current ?? {};
		return {
			pm25: Number(current.pm2_5 ?? 0),
			pm10: Number(current.pm10 ?? 0),
			dust: Number(current.dust ?? 0)
		};
	} catch {
		return;
	}
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
async function resolveWeather(city, signal) {
	const coordinate = await coordinateForCity(city, signal).catch(() => void 0) ?? await locate(signal);
	const label = await displayLabel(coordinate, signal);
	const [report, air] = await Promise.all([fetchWeather(coordinate.latitude, coordinate.longitude, 1, signal, label), fetchAirQuality(coordinate.latitude, coordinate.longitude, signal)]);
	return {
		report,
		air
	};
}
//#endregion
//#region src/client/widget/art.ts
/** Monotonic counter behind the per-call `wx{n}-` defs prefix. */
let uid = 0;
const lg = (id, stops, x2 = .35, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}%" stop-color="${c}"/>`).join("")}</linearGradient>`;
const rg = (id, stops) => `<radialGradient id="${id}" cx="38%" cy="28%" r="78%">${stops.map(([o, c]) => `<stop offset="${o}%" stop-color="${c}"/>`).join("")}</radialGradient>`;
const DEFS = (p) => `
    <defs>
      ${rg(p + "sun", [
	[0, "#FFF6C2"],
	[45, "#FFCE54"],
	[100, "#FCA83D"]
])}
      ${lg(p + "ray", [[0, "#FFE58A"], [100, "#FFC45E"]])}
      ${lg(p + "cloud", [
	[0, "#FFFFFF"],
	[55, "#F1F6FF"],
	[100, "#C8D8F0"]
])}
      ${lg(p + "cloudDark", [
	[0, "#EEF3FB"],
	[50, "#C4D0E4"],
	[100, "#8D9CBA"]
])}
      ${lg(p + "cloudStorm", [
	[0, "#C9D2E4"],
	[50, "#8D9AB6"],
	[100, "#56627E"]
])}
      ${lg(p + "drop", [[0, "#BFE6FF"], [100, "#5AA9E8"]])}
      ${lg(p + "ice", [[0, "#EAFBFF"], [100, "#7FD3F0"]])}
      ${lg(p + "bolt", [[0, "#FFF0A8"], [100, "#F5B62B"]])}
      ${lg(p + "heat", [[0, "#FFD98A"], [100, "#FF7A45"]])}
      ${lg(p + "dust", [[0, "#F6D9A8"], [100, "#C98A45"]])}
      ${rg(p + "moon", [
	[0, "#FFF7DA"],
	[55, "#FFDE7A"],
	[100, "#E9A93C"]
])}
    </defs>`;
const CLOUD_PATH = "M20 46c-7.2 0-13-5.6-13-12.4C7 27.2 12.4 22 19 22c1.6-6.8 7.6-11.6 14.6-11.67.6 0 14 5.2 15.4 12.2 6 .5 10.6 5.2 10.6 10.8C60.2 40.6 55 46 48.2 46Z";
const sun = (p, dim) => `
    <g${dim ? " opacity=\".55\"" : ""}>
      ${[
	0,
	45,
	90,
	135,
	180,
	225,
	270,
	315
].map((a) => `<path d="M32 5 L35 13 H29 Z" fill="url(#${p}${dim ? "dust" : "ray"})" transform="rotate(${a} 32 30)"/>`).join("")}
      <circle cx="32" cy="30" r="15" fill="url(#${p}${dim ? "dust" : "sun"})"/>
      <circle cx="32" cy="30" r="15" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/>
      <ellipse cx="27" cy="24" rx="6" ry="4" fill="rgba(255,255,255,.5)"/>
    </g>`;
const cloud = (p, x = 0, y = 0, s = 1, tone = "cloud") => `
    <g transform="translate(${x} ${y}) scale(${s})">
      <path d="${CLOUD_PATH}" fill="url(#${p}${tone})"/>
      <path d="${CLOUD_PATH.slice(0, 96)}" fill="none" stroke="rgba(255,255,255,.8)"
            stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="27" cy="21" rx="9" ry="4.6" fill="rgba(255,255,255,.66)"/>
    </g>`;
const drops = (p, xs = [
	20,
	32,
	44
], y = 50, dur = 2) => `
    <g>${xs.map((x, i) => {
	const b = (i * dur / xs.length).toFixed(2);
	return `<path d="M${x} ${y}s4.6 5.6 4.6 8.4a4.6 4.6 0 0 1-9.2 0C${x - 4.6} ${y + 5.6} ${x} ${y} ${x} ${y}Z" fill="url(#${p}drop)">
          <animateTransform attributeName="transform" type="translate" values="0 0;0 8;0 0"
            dur="${dur}s" begin="${b}s" repeatCount="indefinite" calcMode="spline"
            keySplines=".4 0 .6 1;.4 0 .6 1"/>
          <animate attributeName="opacity" values="0;1;1;0" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>
        </path>`;
}).join("")}</g>`;
const dots = (p, xs = [
	20,
	30,
	40,
	50
]) => `
    <g fill="url(#${p}drop)">${xs.map((x, i) => `<circle cx="${x}" cy="52" r="2.1">
          <animate attributeName="cy" values="50;60;50" dur="1.6s" begin="${(i * .34).toFixed(2)}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="${(i * .34).toFixed(2)}s" repeatCount="indefinite"/>
        </circle>`).join("")}</g>`;
const flakes = (pts = [
	[
		20,
		52,
		0
	],
	[
		32,
		55,
		.9
	],
	[
		44,
		52,
		1.7
	]
]) => `
    <g fill="#fff">${pts.map(([x, y, d]) => `<circle cx="${x}" cy="${y}" r="3.1">
          <animate attributeName="cy" values="${y};${y + 9};${y}" dur="3s" begin="${d}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0;1;1;0" dur="3s" begin="${d}s" repeatCount="indefinite"/>
        </circle>`).join("")}</g>`;
const flakeGlyph = (cx, cy, r, stroke = "#eaf4ff", w = 2.4) => {
	let arms = "";
	for (let i = 0; i < 6; i++) {
		const a = i * 60 * Math.PI / 180;
		const tip = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
		const mid = [cx + Math.cos(a) * r * .55, cy + Math.sin(a) * r * .55];
		arms += `<path d="M${cx} ${cy}L${tip[0].toFixed(1)} ${tip[1].toFixed(1)}"/>`;
		for (const s of [1, -1]) {
			const b = a + s * .9;
			arms += `<path d="M${mid[0].toFixed(1)} ${mid[1].toFixed(1)}l${(Math.cos(b) * r * .26).toFixed(1)} ${(Math.sin(b) * r * .26).toFixed(1)}"/>`;
		}
	}
	return `<g stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" fill="none">${arms}</g>`;
};
/** Hail pellet starts: `[x, y, delaySeconds]`. */
const PELLETS = [
	[
		20,
		52,
		0
	],
	[
		32,
		56,
		.5
	],
	[
		44,
		52,
		1
	]
];
const pellets = (p) => `
    <g>${PELLETS.map(([x, y, d]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="url(#${p}ice)"
             stroke="rgba(255,255,255,.9)" stroke-width="1">
          <animate attributeName="cy" values="${y - 3};${y + 6};${y - 3}" dur="1.5s" begin="${d}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;1;0" dur="1.5s" begin="${d}s" repeatCount="indefinite"/>
        </circle>`).join("")}</g>`;
const bolt = (p) => `
    <path d="M37 34 23 52h8l-3.5 10 15-19h-9l5-9Z" fill="url(#${p}bolt)"
          stroke="rgba(255,255,255,.85)" stroke-width="1.1" stroke-linejoin="round"
          style="filter:drop-shadow(0 0 4px rgba(255,224,130,.95))">
      <animate attributeName="opacity" values="1;.3;1;1;.45;1" dur="3.2s" repeatCount="indefinite"/>
    </path>`;
const moon = (p) => `
    <g>
      <mask id="${p}cres">
        <rect x="0" y="0" width="64" height="64" fill="#fff"/>
        <circle cx="41" cy="25" r="17" fill="#000"/>
      </mask>
      <circle cx="33" cy="32" r="19" fill="url(#${p}moon)" mask="url(#${p}cres)"/>
      <circle cx="33" cy="32" r="19" fill="none" stroke="rgba(255,255,255,.45)"
              stroke-width="1" mask="url(#${p}cres)"/>
      <ellipse cx="24" cy="38" rx="3.4" ry="5" fill="rgba(255,255,255,.35)" mask="url(#${p}cres)"/>
    </g>`;
const stars = () => {
	const star = (x, y, r, d) => `<path d="M${x} ${y - r * 2.7}L${x + r * .75} ${y - r * .75}L${x + r * 2.7} ${y}L${x + r * .75} ${y + r * .75}L${x} ${y + r * 2.7}L${x - r * .75} ${y + r * .75}L${x - r * 2.7} ${y}L${x - r * .75} ${y - r * .75}Z" fill="#fff">
        <animate attributeName="opacity" values=".2;1;.2" dur="2.9s" begin="${d}s" repeatCount="indefinite"/>
      </path>`;
	return `<g>${star(55, 13, 1.8, 0)}${star(12, 21, 1.3, .8)}${star(57, 42, 1.5, 1.5)}${star(9, 45, 1.1, 2.2)}</g>`;
};
const fogLines = (tone = "#dbe6f5", n = 4) => {
	let out = `<g stroke="${tone}" stroke-width="4.4" stroke-linecap="round" fill="none">`;
	for (let i = 0; i < n; i++) {
		const y = 40 + i * 6.5, inset = i % 2 ? 6 : 0;
		out += `<path d="M${12 + inset} ${y}H${52 - inset}">
        <animate attributeName="opacity" values=".45;1;.45" dur="${(2.4 + i * .4).toFixed(1)}s" repeatCount="indefinite"/>
      </path>`;
	}
	return out + "</g>";
};
const swirls = (tone = "#eaf3ff", w = 3.6) => `
    <g stroke="${tone}" stroke-width="${w}" stroke-linecap="round" fill="none">
      <path d="M6 24h26a6.5 6.5 0 1 0-6.4-7.6">
        <animate attributeName="stroke-dasharray" values="0 96;66 30;0 96" dur="3.6s" repeatCount="indefinite"/>
      </path>
      <path d="M6 38h34a7.5 7.5 0 1 1-7.4 8.6">
        <animate attributeName="stroke-dasharray" values="66 30;0 96;66 30" dur="3.6s" repeatCount="indefinite"/>
      </path>
      <path d="M10 52h18a5 5 0 1 1-4.8 6.2" opacity=".75"/>
    </g>`;
const spiral = (p) => `
    <g fill="none" stroke-linecap="round" stroke-width="5.4">
      <g>
        <path d="M32 26c6-16 26-13 26 2-6-9-17-6-20 2" stroke="url(#${p}ice)"/>
        <path d="M32 38c-6 16-26 13-26-2 6 9 17 6 20-2" stroke="url(#${p}drop)"/>
        <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32"
          dur="9s" repeatCount="indefinite"/>
      </g>
      <circle cx="32" cy="32" r="4.6" fill="#fff" stroke="none"/>
    </g>`;
const funnel = (p) => `
    <g stroke="url(#${p}cloudStorm)" stroke-width="5" stroke-linecap="round" fill="none">
      <path d="M13 33h38"/>
      <path d="M18 42h28" opacity=".92"/>
      <path d="M23 50h19" opacity=".82"/>
      <path d="M28 58h10" opacity=".7"/>
      <animateTransform attributeName="transform" type="skewX" values="0;5;0;-5;0"
        dur="4.2s" repeatCount="indefinite"/>
    </g>`;
const waves = (p) => `
    <g stroke="url(#${p}heat)" stroke-width="3.6" stroke-linecap="round" fill="none">
      <path d="M12 52q5-6 10 0t10 0 10 0">
        <animate attributeName="opacity" values=".5;1;.5" dur="2.2s" repeatCount="indefinite"/>
      </path>
      <path d="M17 60q5-6 10 0t10 0" opacity=".7">
        <animate attributeName="opacity" values="1;.4;1" dur="2.2s" repeatCount="indefinite"/>
      </path>
    </g>`;
const downArrows = (tone = "#dceaff") => `
    <g stroke="${tone}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none">
      ${[
	16,
	32,
	48
].map((x, i) => `<path d="M${x} 44v13m0 0-4.4-4.4M${x} 57l4.4-4.4">
          <animate attributeName="opacity" values=".35;1;.35" dur="2.4s" begin="${(i * .5).toFixed(1)}s" repeatCount="indefinite"/>
        </path>`).join("")}
    </g>`;
const iceShard = (p) => `
    <path d="M45 47l5.5 8-5.5 8-5.5-8Z" fill="url(#${p}ice)" stroke="rgba(255,255,255,.85)" stroke-width="1">
      <animate attributeName="opacity" values="1;.45;1" dur="2.6s" repeatCount="indefinite"/>
    </path>`;
/**
* The full 64×64 SVG for one state.
*
* Each call gets its own `wx{n}-` defs prefix, so ids are unique per icon.
*/
function artFor(state) {
	const p = `wx${++uid}-`;
	let body;
	switch (state) {
		case "sunny":
			body = sun(p);
			break;
		case "partly":
			body = sun(p) + cloud(p, 9, 13, .8);
			break;
		case "cloudy":
			body = `<g opacity=".5" transform="translate(-4 4) scale(.72)">${cloud(p, 0, 0, 1, "cloudDark")}</g>` + cloud(p, 5, 7, .95);
			break;
		case "overcast":
			body = `<g opacity=".7" transform="translate(4 -3) scale(.82)">${cloud(p, 0, 0, 1, "cloudDark")}</g>` + cloud(p, -1, 9, .96, "cloudStorm");
			break;
		case "fog":
			body = `<g opacity=".5">${cloud(p, 3, -9, .9, "cloudDark")}</g>` + fogLines();
			break;
		case "haze":
			body = sun(p, true) + `<g opacity=".8">${cloud(p, 3, -7, .86, "cloudDark")}</g>` + fogLines("#e8d4b2", 3);
			break;
		case "drizzle":
			body = cloud(p, 3, -4, .92) + dots(p);
			break;
		case "rainy":
			body = cloud(p, 3, 0, .94, "cloudDark") + drops(p);
			break;
		case "shower":
			body = sun(p) + cloud(p, 6, -2, .9, "cloudDark") + drops(p, [
				22,
				34,
				46
			], 52, 1.7);
			break;
		case "thunder":
			body = cloud(p, 3, -6, .94, "cloudDark") + bolt(p);
			break;
		case "sleet":
			body = cloud(p, 3, -4, .92, "cloudDark") + drops(p, [20, 44], 52, 2.2) + `<g fill="#fff"><circle cx="32" cy="55" r="3.2"><animate attributeName="cy" values="53;60;53" dur="2.6s" repeatCount="indefinite"/></circle></g>`;
			break;
		case "snowy":
			body = cloud(p, 3, 0, .94) + flakes();
			break;
		case "windy":
			body = swirls();
			break;
		case "night":
			body = moon(p) + stars();
			break;
		case "rainstorm":
			body = cloud(p, 3, -4, .96, "cloudStorm") + drops(p, [
				16,
				26,
				36,
				46
			], 50, 1.35) + drops(p, [
				21,
				31,
				41
			], 56, 1.35);
			break;
		case "blizzard":
			body = cloud(p, 3, -6, .94, "cloudStorm") + flakes([
				[
					16,
					48,
					0
				],
				[
					28,
					54,
					.5
				],
				[
					40,
					47,
					1
				],
				[
					50,
					56,
					1.5
				]
			]) + `<g stroke="rgba(255,255,255,.8)" stroke-width="2.6" stroke-linecap="round" fill="none">
             <path d="M5 36h16M42 41h17"><animate attributeName="opacity" values=".3;1;.3" dur="1.8s" repeatCount="indefinite"/></path>
           </g>`;
			break;
		case "hail":
			body = cloud(p, 3, -4, .94, "cloudStorm") + pellets(p);
			break;
		case "icyrain":
			body = cloud(p, 3, -4, .92, "cloudDark") + drops(p, [20, 32], 52, 2.4) + iceShard(p);
			break;
		case "sandstorm":
			body = `<g opacity=".4">${sun(p, true)}</g>` + swirls("#f2dcb4", 4.4);
			break;
		case "typhoon":
			body = spiral(p);
			break;
		case "tornado":
			body = `<g opacity=".92">${cloud(p, 3, -11, .9, "cloudStorm")}</g>` + funnel(p);
			break;
		case "heatwave":
			body = sun(p) + waves(p);
			break;
		case "coldwave":
			body = flakeGlyph(32, 25, 15) + downArrows();
			break;
		default: body = sun(p) + cloud(p, 9, 13, .8);
	}
	return `<svg viewBox="0 0 64 64" aria-hidden="true">${DEFS(p)}${body}</svg>`;
}
/** The design's line-icon table, minus `caret` (this plugin has no city menu). */
const LINE_ICONS = Object.freeze({
	pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>`,
	up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg>`,
	down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14m0 0 6-6m-6 6-6-6"/></svg>`,
	warn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 22.4 21H1.6Z" fill="currentColor" stroke="rgba(255,255,255,.92)" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9.6v5.2" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.4" fill="#fff"/></svg>`
});
//#endregion
//#region src/client/widget/fx.ts
/** 30 fps frame budget, in ms. */
const FRAME_MS = 1e3 / 30;
/** `devicePixelRatio` ceiling for the backing store. */
const MAX_DPR = 1.5;
/** The design's default layer values. */
const DEFAULT_COLOR = [
	255,
	255,
	255
];
const DEFAULT_SPEED = 6;
const DEFAULT_LENGTH = 12;
const DEFAULT_ANGLE = .17;
const DEFAULT_WIDTH = 1.35;
const DEFAULT_ALPHA = .3;
const DEFAULT_DRIFT = .6;
/** The grey overcast clouds use instead of the layer colour. */
const DARK_COLOR = [
	206,
	212,
	224
];
/** The reduced-motion query the engine respects. */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** The design's particle layer per state, frozen. */
const FX_PRESETS = Object.freeze({
	sunny: [{
		k: "mote",
		n: 26,
		c: [
			255,
			240,
			190
		]
	}],
	partly: [{
		k: "cloud",
		n: 12
	}, {
		k: "mote",
		n: 10,
		c: [
			255,
			240,
			190
		]
	}],
	cloudy: [{
		k: "cloud",
		n: 8
	}],
	overcast: [{
		k: "cloud",
		n: 16,
		dark: 1,
		a: .09
	}],
	fog: [{
		k: "fog",
		n: 8,
		a: .16
	}, {
		k: "cloud",
		n: 4
	}],
	haze: [{
		k: "fog",
		n: 9,
		c: [
			216,
			190,
			152
		],
		a: .15
	}, {
		k: "mote",
		n: 14,
		c: [
			226,
			202,
			168
		],
		sp: .3
	}],
	drizzle: [{
		k: "rain",
		n: 66,
		sp: 3.4,
		len: 6,
		w: 1,
		a: .34
	}],
	rainy: [{
		k: "rain",
		n: 78,
		sp: 7,
		len: 13
	}],
	shower: [{
		k: "rain",
		n: 96,
		sp: 8.5,
		len: 15,
		ang: .26
	}, {
		k: "mote",
		n: 8,
		c: [
			255,
			238,
			190
		]
	}],
	thunder: [{
		k: "rain",
		n: 96,
		sp: 9,
		len: 15,
		ang: .2,
		c: [
			226,
			216,
			255
		]
	}],
	sleet: [{
		k: "rain",
		n: 52,
		sp: 6,
		len: 8
	}, {
		k: "snow",
		n: 28,
		sp: 1.1
	}],
	snowy: [{
		k: "snow",
		n: 52,
		sp: .9
	}],
	windy: [{
		k: "streak",
		n: 46,
		sp: 7.5,
		len: 44,
		ang: .02,
		a: .22
	}],
	night: [{
		k: "star",
		n: 38
	}],
	rainstorm: [{
		k: "rain",
		n: 150,
		sp: 12.5,
		len: 22,
		ang: .5,
		w: 1.7,
		a: .44
	}, {
		k: "streak",
		n: 16,
		sp: 9,
		len: 40,
		ang: .5,
		a: .12
	}],
	blizzard: [{
		k: "snow",
		n: 120,
		sp: 2.6,
		drift: 3.2,
		a: .5
	}, {
		k: "streak",
		n: 24,
		sp: 10,
		len: 38,
		ang: .05,
		a: .16
	}],
	hail: [{
		k: "pellet",
		n: 56,
		sp: 9,
		a: .5
	}, {
		k: "rain",
		n: 34,
		sp: 7.5,
		len: 12
	}],
	icyrain: [{
		k: "rain",
		n: 48,
		sp: 4.4,
		len: 8,
		c: [
			214,
			240,
			255
		]
	}, {
		k: "mote",
		n: 12,
		sp: .4,
		c: [
			226,
			244,
			255
		]
	}],
	sandstorm: [{
		k: "streak",
		n: 96,
		sp: 13,
		len: 58,
		ang: .07,
		c: [
			238,
			202,
			150
		],
		a: .32
	}, {
		k: "mote",
		n: 26,
		sp: 1.2,
		c: [
			226,
			188,
			136
		]
	}],
	typhoon: [{
		k: "streak",
		n: 130,
		sp: 16,
		len: 52,
		ang: .34,
		a: .28
	}, {
		k: "rain",
		n: 62,
		sp: 11,
		len: 16,
		ang: .46
	}],
	tornado: [{
		k: "swirl",
		n: 44,
		sp: 2.4
	}, {
		k: "streak",
		n: 26,
		sp: 7,
		len: 30,
		ang: .05,
		a: .14
	}],
	heatwave: [{
		k: "wave",
		n: 16
	}, {
		k: "mote",
		n: 22,
		sp: .6,
		c: [
			255,
			214,
			170
		]
	}],
	coldwave: [{
		k: "mote",
		n: 34,
		sp: .9,
		fall: 1,
		c: [
			226,
			240,
			255
		]
	}, {
		k: "snow",
		n: 20,
		sp: .5
	}]
});
/** The design's colour helper. */
function rgba(c, a) {
	return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
/** A zeroed particle; every field is a number so respawns never allocate. */
function createParticle() {
	return {
		x: 0,
		y: 0,
		v: 0,
		vy: 0,
		l: 0,
		r: 0,
		a: 0,
		ph: 0,
		sw: 0,
		sp: 0,
		amp: 0,
		cx: 0,
		s: 0
	};
}
/**
* The canvas particle engine.
*
* Construction only reads the canvas, sizes it and spawns the current state's
* particles; the animation loop starts on `start()`.
*/
var ParticleFx = class {
	canvas;
	ctx;
	mq;
	layers = [];
	state;
	w = 1;
	h = 1;
	dpr = 1;
	/** Drawn-frame counter, for the rain ripples. */
	t = 0;
	/** Timestamp of the last drawn frame; `-Infinity` = draw on the next frame. */
	last = -Infinity;
	raf = 0;
	active = false;
	destroyed = false;
	/** Whether the canvas box currently has a non-zero size. */
	visible = false;
	/** Window resize → re-read the box and DPR. */
	onResize = () => {
		this.resize();
	};
	/** Reduced-motion preference change → stop for good. */
	onMotion = () => {
		if (this.mq !== null && this.mq.matches) this.stop();
	};
	/** The rAF step: schedule, gate to 30 fps, draw. */
	frame = (now) => {
		if (!this.active) return;
		this.raf = requestAnimationFrame(this.frame);
		if (document.hidden || !this.visible) {
			this.last = -Infinity;
			return;
		}
		if (now - this.last < FRAME_MS) return;
		this.last = now;
		this.draw();
	};
	constructor(canvas, state) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.state = state;
		this.mq = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION) : null;
		this.resize();
		this.set(state);
		window.addEventListener("resize", this.onResize);
		if (this.mq !== null) this.mq.addEventListener("change", this.onMotion);
	}
	/** Whether the animation loop is live. */
	get running() {
		return this.active;
	}
	/** Switch presets; a running loop is not interrupted. */
	set(state) {
		if (this.destroyed) return;
		this.state = state;
		const preset = FX_PRESETS[state];
		const layers = [];
		for (const cfg of preset) {
			const layer = {
				k: cfg.k,
				n: cfg.n,
				c: cfg.c ?? DEFAULT_COLOR,
				sp: cfg.sp ?? DEFAULT_SPEED,
				len: cfg.len ?? DEFAULT_LENGTH,
				ang: cfg.ang ?? DEFAULT_ANGLE,
				w: cfg.w ?? DEFAULT_WIDTH,
				a: cfg.a ?? DEFAULT_ALPHA,
				drift: cfg.drift ?? DEFAULT_DRIFT,
				fall: cfg.fall ?? 0,
				dark: cfg.dark ?? 0,
				parts: []
			};
			for (let i = 0; i < layer.n; i++) {
				const p = createParticle();
				this.fill(layer, p, true);
				layer.parts.push(p);
			}
			layers.push(layer);
		}
		this.layers = layers;
	}
	/** Re-read the canvas box and cap the backing store at 1.5 × DPR. */
	resize() {
		const canvas = this.canvas;
		if (canvas === null) return;
		const rect = canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
		this.dpr = dpr;
		this.visible = rect.width > 0 && rect.height > 0;
		this.w = rect.width || 1;
		this.h = rect.height || 1;
		canvas.width = Math.max(1, Math.round(this.w * dpr));
		canvas.height = Math.max(1, Math.round(this.h * dpr));
		if (this.ctx !== null) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}
	/** Start the loop; a no-op under reduced motion, or with no 2D context. */
	start() {
		if (this.destroyed || this.active || this.ctx === null) return;
		if (this.mq !== null && this.mq.matches) return;
		this.active = true;
		this.last = -Infinity;
		this.raf = requestAnimationFrame(this.frame);
	}
	/** Stop the loop and clear the canvas. */
	stop() {
		if (this.active) {
			this.active = false;
			cancelAnimationFrame(this.raf);
			this.raf = 0;
		}
		this.clear();
	}
	/** Stop, unhook every listener and drop the canvas/particle references. */
	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.stop();
		window.removeEventListener("resize", this.onResize);
		if (this.mq !== null) this.mq.removeEventListener("change", this.onMotion);
		this.layers = [];
		this.ctx = null;
		this.canvas = null;
	}
	/** Clear the drawing surface, when there is one. */
	clear() {
		const ctx = this.ctx;
		if (ctx === null) return;
		ctx.clearRect(0, 0, this.w, this.h);
	}
	/**
	* Spawn or respawn one particle in place.
	*
	* `init` spreads a new particle over the whole canvas; otherwise it enters
	* from just outside, exactly as the design's `spawn(L, false)` does. The
	* `Math.random()` calls — and therefore the look — are in the design's order.
	*/
	fill(L, p, init) {
		const w = this.w;
		const h = this.h;
		const R = Math.random;
		p.x = 0;
		p.y = 0;
		p.v = 0;
		p.vy = 0;
		p.l = 0;
		p.r = 0;
		p.a = 0;
		p.ph = 0;
		p.sw = 0;
		p.sp = 0;
		p.amp = 0;
		p.cx = 0;
		p.s = 0;
		switch (L.k) {
			case "rain":
			case "pellet":
				p.x = R() * w * 1.3 - w * .15;
				p.y = init ? R() * h : -14;
				p.v = L.sp * (.75 + R() * .55);
				p.vy = L.k === "pellet" ? -L.sp * .35 : 0;
				p.l = L.len * (.7 + R() * .6);
				p.r = L.k === "pellet" ? 1.5 + R() * 1.7 : 0;
				p.a = L.a * (.55 + R() * .8);
				return;
			case "streak":
				p.x = init ? R() * w : -L.len;
				p.y = R() * h;
				p.v = L.sp * (.7 + R() * .7);
				p.l = L.len * (.55 + R() * .8);
				p.a = L.a * (.4 + R() * .9);
				return;
			case "snow":
				p.x = R() * w;
				p.y = init ? R() * h : -6;
				p.v = L.sp * (.5 + R());
				p.r = 1 + R() * 2.4;
				p.ph = R() * 6.28;
				p.sw = L.drift * (.5 + R());
				p.a = L.a * (.6 + R() * 1.2);
				return;
			case "star":
				p.x = R() * w;
				p.y = R() * h;
				p.r = .6 + R() * 1.4;
				p.ph = R() * 6.28;
				p.sp = .012 + R() * .03;
				return;
			case "cloud":
			case "fog":
				p.x = R() * w;
				p.y = h * (L.k === "fog" ? .18 + R() * .72 : .1 + R() * .8);
				p.r = L.k === "fog" ? 34 + R() * 54 : 26 + R() * 48;
				p.v = (L.k === "fog" ? .14 : .08) + R() * .24;
				p.a = L.a * (.55 + R() * .9);
				return;
			case "mote":
				p.x = R() * w;
				p.y = init ? R() * h : L.fall ? -8 : h + 8;
				p.v = L.sp * (.5 + R());
				p.r = .9 + R() * 2.2;
				p.ph = R() * 6.28;
				p.a = L.a * (.5 + R() * 1.1);
				return;
			case "wave":
				p.x = R() * w;
				p.y = h * (.25 + R() * .7);
				p.ph = R() * 6.28;
				p.amp = 2 + R() * 3.4;
				p.v = .35 + R() * .5;
				p.a = .1 + R() * .16;
				return;
			case "swirl":
				p.cx = w * (.25 + R() * .5);
				p.y = h * (.15 + R() * .7);
				p.r = 10 + R() * 30;
				p.ph = R() * 6.28;
				p.v = .03 + R() * .05;
				p.a = .14 + R() * .3;
				p.s = R() < .5 ? 1 : -1;
				return;
		}
	}
	/** One frame, at most 30 times a second. Allocates nothing. */
	draw() {
		const ctx = this.ctx;
		if (ctx === null) return;
		const w = this.w;
		const h = this.h;
		this.t++;
		ctx.clearRect(0, 0, w, h);
		const layers = this.layers;
		for (let li = 0; li < layers.length; li++) {
			const L = layers[li];
			const c = L.c;
			const parts = L.parts;
			for (let pi = 0; pi < parts.length; pi++) {
				const p = parts[pi];
				switch (L.k) {
					case "rain":
						p.y += p.v;
						p.x += p.v * L.ang;
						if (p.y - p.l > h) this.fill(L, p, false);
						ctx.strokeStyle = rgba(c, p.a);
						ctx.lineWidth = L.w;
						ctx.lineCap = "round";
						ctx.beginPath();
						ctx.moveTo(p.x, p.y);
						ctx.lineTo(p.x - p.l * L.ang, p.y - p.l);
						ctx.stroke();
						break;
					case "streak":
						p.x += p.v;
						p.y += p.v * L.ang;
						if (p.x - p.l > w) {
							const old = p.l;
							this.fill(L, p, false);
							p.x = -old;
						}
						ctx.strokeStyle = rgba(c, p.a);
						ctx.lineWidth = L.w;
						ctx.lineCap = "round";
						ctx.beginPath();
						ctx.moveTo(p.x, p.y);
						ctx.lineTo(p.x - p.l, p.y - p.l * L.ang);
						ctx.stroke();
						break;
					case "pellet":
						p.vy += .42;
						p.y += p.vy + p.v * .3;
						p.x += p.v * .12;
						if (p.y > h - 3) {
							p.y = h - 3;
							p.vy = -Math.abs(p.vy) * .45;
							if (Math.abs(p.vy) < 1.2) {
								this.fill(L, p, false);
								p.y = -6;
							}
						}
						ctx.fillStyle = rgba(c, Math.min(.95, p.a + .35));
						ctx.beginPath();
						ctx.arc(p.x, p.y, p.r, 0, 6.2832);
						ctx.fill();
						break;
					case "snow":
						p.y += p.v;
						p.ph += .022;
						p.x += Math.sin(p.ph) * p.sw + p.v * L.ang * .5;
						if (p.y > h + 4 || p.x < -10 || p.x > w + 10) this.fill(L, p, false);
						ctx.fillStyle = rgba(c, p.a);
						ctx.beginPath();
						ctx.arc(p.x, p.y, p.r, 0, 6.2832);
						ctx.fill();
						break;
					case "star":
						p.ph += p.sp;
						ctx.fillStyle = rgba(c, .25 + Math.abs(Math.sin(p.ph)) * .7);
						ctx.beginPath();
						ctx.arc(p.x, p.y, p.r, 0, 6.2832);
						ctx.fill();
						break;
					case "cloud":
					case "fog": {
						p.x += p.v;
						if (p.x - p.r > w) p.x = -p.r;
						const col = L.dark ? DARK_COLOR : c;
						const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
						gr.addColorStop(0, rgba(col, p.a));
						gr.addColorStop(1, rgba(col, 0));
						ctx.fillStyle = gr;
						ctx.beginPath();
						if (L.k === "fog") ctx.ellipse(p.x, p.y, p.r, p.r * .34, 0, 0, 6.2832);
						else ctx.arc(p.x, p.y, p.r, 0, 6.2832);
						ctx.fill();
						break;
					}
					case "mote": {
						p.y += L.fall ? p.v : -p.v;
						p.ph += .02;
						p.x += Math.sin(p.ph) * .3;
						if (p.y < -10 || p.y > h + 10) this.fill(L, p, false);
						const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.6);
						gr.addColorStop(0, rgba(c, p.a * (.5 + .5 * Math.sin(p.ph * 1.7))));
						gr.addColorStop(1, rgba(c, 0));
						ctx.fillStyle = gr;
						ctx.beginPath();
						ctx.arc(p.x, p.y, p.r * 3.6, 0, 6.2832);
						ctx.fill();
						break;
					}
					case "wave":
						p.y -= p.v;
						p.ph += .06;
						if (p.y < -12) {
							this.fill(L, p, false);
							p.y = h + 12;
						}
						ctx.strokeStyle = rgba(c, p.a * (.5 + .5 * Math.sin(p.ph)));
						ctx.lineWidth = 1.6;
						ctx.beginPath();
						for (let s = 0; s <= 20; s += 2) {
							const xx = p.x + Math.sin(p.ph + s * .32) * p.amp;
							if (s === 0) ctx.moveTo(xx, p.y + s);
							else ctx.lineTo(xx, p.y + s);
						}
						ctx.stroke();
						break;
					case "swirl": {
						p.ph += p.v * p.s;
						const rr = p.r * (.55 + .45 * Math.sin(p.ph * .6));
						ctx.fillStyle = rgba(c, p.a);
						ctx.beginPath();
						ctx.arc(p.cx + Math.cos(p.ph) * rr * 1.7, p.y + Math.sin(p.ph * 1.3) * rr * .4, 1.7, 0, 6.2832);
						ctx.fill();
						break;
					}
				}
			}
			if (L.k === "rain" && L.n >= 70 || L.k === "pellet") {
				const k = this.t % 96 / 96;
				ctx.strokeStyle = rgba(c, .18 * (1 - k));
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.ellipse(w * .36, h - 4, 6 + k * 38, 1.4 + k * 4.2, 0, 0, 6.2832);
				ctx.stroke();
			}
		}
	}
};
//#endregion
//#region src/client/widget/state.ts
/** The design's state table, verbatim. */
const STATES = Object.freeze({
	sunny: {
		label: "Sunny",
		zh: "晴",
		group: 0
	},
	partly: {
		label: "Partly Cloudy",
		zh: "多云转晴",
		group: 0
	},
	cloudy: {
		label: "Cloudy",
		zh: "多云",
		group: 0
	},
	overcast: {
		label: "Overcast",
		zh: "阴",
		group: 0
	},
	fog: {
		label: "Fog",
		zh: "雾",
		group: 0,
		warn: "yellow"
	},
	haze: {
		label: "Haze",
		zh: "霾",
		group: 0,
		warn: "yellow"
	},
	drizzle: {
		label: "Drizzle",
		zh: "毛毛雨",
		group: 0
	},
	rainy: {
		label: "Rainy",
		zh: "雨",
		group: 0
	},
	shower: {
		label: "Showers",
		zh: "阵雨",
		group: 0,
		warn: "blue"
	},
	thunder: {
		label: "Thunderstorm",
		zh: "雷雨",
		group: 0,
		warn: "yellow"
	},
	sleet: {
		label: "Sleet",
		zh: "雨夹雪",
		group: 0,
		warn: "blue"
	},
	snowy: {
		label: "Snowy",
		zh: "雪",
		group: 0
	},
	windy: {
		label: "Windy",
		zh: "大风",
		group: 0,
		warn: "blue"
	},
	night: {
		label: "Clear Night",
		zh: "晴夜",
		group: 0
	},
	rainstorm: {
		label: "Rainstorm",
		zh: "暴雨",
		group: 1,
		warn: "red"
	},
	blizzard: {
		label: "Blizzard",
		zh: "暴雪",
		group: 1,
		warn: "orange"
	},
	hail: {
		label: "Hail",
		zh: "冰雹",
		group: 1,
		warn: "orange"
	},
	icyrain: {
		label: "Freezing Rain",
		zh: "冻雨",
		group: 1,
		warn: "orange"
	},
	sandstorm: {
		label: "Sandstorm",
		zh: "沙尘暴",
		group: 1,
		warn: "orange"
	},
	typhoon: {
		label: "Typhoon",
		zh: "台风",
		group: 1,
		warn: "red"
	},
	tornado: {
		label: "Tornado",
		zh: "龙卷风",
		group: 1,
		warn: "red"
	},
	heatwave: {
		label: "Heatwave",
		zh: "高温",
		group: 1,
		warn: "red"
	},
	coldwave: {
		label: "Cold Wave",
		zh: "寒潮",
		group: 1,
		warn: "orange"
	}
});
/** Every state, in the design's own order. */
const STATE_LIST = Object.freeze(Object.keys(STATES));
/** WMO weather code → state. Codes outside the table are `undefined`. */
const STATE_BY_CODE = Object.freeze({
	0: "sunny",
	1: "partly",
	2: "partly",
	3: "overcast",
	45: "fog",
	48: "fog",
	51: "drizzle",
	53: "drizzle",
	55: "rainy",
	56: "icyrain",
	57: "icyrain",
	61: "rainy",
	63: "rainy",
	65: "rainstorm",
	66: "icyrain",
	67: "icyrain",
	71: "snowy",
	73: "snowy",
	75: "blizzard",
	77: "snowy",
	80: "shower",
	81: "shower",
	82: "rainstorm",
	85: "snowy",
	86: "blizzard",
	95: "thunder",
	96: "hail",
	99: "hail"
});
/** The plugin's existing `manualEffect` values, mapped onto states. */
const MANUAL_STATE = Object.freeze({
	rain: "rainy",
	snow: "snowy",
	fog: "fog",
	thunder: "thunder"
});
/** States a temperature or wind extreme is allowed to replace. */
const CALM_STATES = Object.freeze([
	"sunny",
	"partly",
	"cloudy",
	"overcast",
	"fog",
	"haze"
]);
/** States that turn into sleet when snow and rain fall together. */
const SLEET_STATES = Object.freeze([
	"drizzle",
	"rainy",
	"shower",
	"snowy"
]);
/** Local hours considered night. */
const NIGHT_HOURS = Object.freeze([
	0,
	1,
	2,
	3,
	4,
	5,
	22,
	23
]);
/** Wind and pressure together: a tropical-cyclone-grade low. */
function isTyphoonForce(hints) {
	const pressure = hints.pressure;
	return (hints.windSpeed ?? 0) >= 118 && pressure !== void 0 && pressure > 0 && pressure <= 995;
}
/** Rain and snow falling in the same reading is sleet by definition. */
function isSleet(hints) {
	return (hints.rain ?? 0) >= .1 && (hints.snowfall ?? 0) > 0;
}
/** Blowing dust: either unambiguous dust, or coarse dust carried by wind. */
function isSandstorm(hints) {
	if ((hints.dust ?? 0) >= 200) return true;
	return (hints.pm10 ?? 0) >= 420 && (hints.windSpeed ?? 0) >= 20;
}
/** Haze needs fine particulates, and never claims a reading that is really fog. */
function isHazy(hints) {
	if ((hints.pm25 ?? 0) < 75) return false;
	const visibility = hints.visibility;
	return visibility === void 0 || visibility >= 1e3;
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
function stateForCode(code, hints = {}) {
	const sky = (code === void 0 ? void 0 : STATE_BY_CODE[code]) ?? "partly";
	if (isTyphoonForce(hints)) return "typhoon";
	if (SLEET_STATES.includes(sky) && isSleet(hints)) return "sleet";
	if (!CALM_STATES.includes(sky)) return sky;
	if (isSandstorm(hints)) return "sandstorm";
	if (sky !== "fog" && isHazy(hints)) return "haze";
	const { temperature, windSpeed, cloudCover, hour } = hints;
	if (temperature !== void 0 && temperature >= 35) return "heatwave";
	if (temperature !== void 0 && temperature <= -15) return "coldwave";
	if ((sky === "sunny" || sky === "partly") && windSpeed !== void 0 && windSpeed >= 39) return "windy";
	if ((sky === "sunny" || sky === "partly") && (cloudCover ?? 0) >= 60) return "cloudy";
	if (sky === "sunny" && hour !== void 0 && NIGHT_HOURS.includes(hour)) return "night";
	return sky;
}
/** The state a `manualEffect` value forces, or `undefined` for `auto`. */
function stateForManual(kind) {
	return MANUAL_STATE[kind];
}
/** The design's Chinese label for a state. */
function stateLabel(state) {
	return STATES[state].zh;
}
/** The warning badge a state implies, if any. */
function stateWarn(state) {
	return STATES[state].warn;
}
//#endregion
//#region src/client/pill.tsx
/**
* The glass weather pill.
*
* One element, everything in it: the design's glass capsule rendered at header
* scale, carrying the weather glyph, the place, the temperature, the condition,
* the daily range, the humidity, the clock and — for severe weather — the
* warning badge. Which of those parts appear is the user's choice; see
* {@link PillFields}.
*
* There is deliberately no hover expansion: the pill is the whole surface, so it
* never covers the neighbouring header buttons and never needs a portal to
* escape their clipping.
*/
/**
* The shipped default: the readings, not the address.
*
* The place name is the longest part of the pill and the header spends that
* width on the session title, so it starts off — one click in settings brings it
* back (the tooltip always carries it either way).
*/
const DEFAULT_FIELDS = Object.freeze({
	city: false,
	condition: true,
	humidity: true,
	range: true,
	clock: false,
	warn: true
});
/** Field order, with the label the settings card shows. */
const FIELD_OPTIONS = Object.freeze([
	["city", "城市"],
	["condition", "天气文字"],
	["humidity", "湿度"],
	["range", "今日最高/最低"],
	["clock", "时间"],
	["warn", "预警角标"]
]);
/** Narrow an arbitrary stored value to a field set. */
function coerceFields(raw) {
	const source = typeof raw === "object" && raw !== null ? raw : {};
	const pick = (key) => typeof source[key] === "boolean" ? source[key] : DEFAULT_FIELDS[key];
	return {
		city: pick("city"),
		condition: pick("condition"),
		humidity: pick("humidity"),
		range: pick("range"),
		clock: pick("clock"),
		warn: pick("warn")
	};
}
/** Humidity mark; the reference has no droplet in its line-icon set. */
const DROP_ICON = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3.2c3.1 3.9 5.4 7 5.4 9.9a5.4 5.4 0 0 1-10.8 0c0-2.9 2.3-6 5.4-9.9Z\" fill=\"currentColor\"/></svg>";
/** `HH:MM`, refreshed on the design's own 15-second cadence. */
function useClock(active) {
	const read = () => {
		const now = /* @__PURE__ */ new Date();
		return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
	};
	const [text, setText] = (0, react.useState)(read);
	(0, react.useEffect)(() => {
		if (!active) return void 0;
		setText(read());
		const timer = window.setInterval(() => {
			setText(read());
		}, 15e3);
		return () => {
			window.clearInterval(timer);
		};
	}, [active]);
	return text;
}
/**
* Run the design's particle layer inside the pill's canvas.
*
* The loop exists only while the policy says so: `off` costs nothing at all.
*/
function useParticles(ref, state, active) {
	(0, react.useEffect)(() => {
		const canvas = ref.current;
		if (!active || canvas === null) return void 0;
		let fx;
		try {
			fx = new ParticleFx(canvas, state);
		} catch {
			return;
		}
		fx.resize();
		fx.start();
		const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
			fx?.resize();
		}) : void 0;
		observer?.observe(canvas);
		const onResize = () => {
			fx?.resize();
		};
		window.addEventListener("resize", onResize);
		return () => {
			window.removeEventListener("resize", onResize);
			observer?.disconnect();
			fx?.destroy();
		};
	}, [
		ref,
		state,
		active
	]);
}
/** The design shows whole degrees; the exact value lives in the tooltip. */
function degrees(value) {
	return value === void 0 ? "--" : String(Math.round(value));
}
/** Precise reading line for `title`. */
function tooltip(reading) {
	const lines = [];
	if (reading.error !== void 0) lines.push(`天气读取失败：${reading.error}`);
	else {
		lines.push(reading.city.length > 0 ? `${reading.city} · ${reading.condition}` : reading.condition);
		if (reading.temperature !== void 0) lines.push(`温度 ${reading.temperature.toFixed(1)}°C`);
		if (reading.humidity !== void 0) lines.push(`湿度 ${reading.humidity.toFixed(0)}%`);
		if (reading.hi !== void 0 && reading.lo !== void 0) lines.push(`今日 ${degrees(reading.lo)} ~ ${degrees(reading.hi)}°C`);
		if (reading.updatedAt !== void 0) lines.push(`更新于 ${new Date(reading.updatedAt).toLocaleTimeString()}`);
	}
	lines.push("单击刷新");
	return lines.join("\n");
}
/** One weather glyph, with the design's gradient ids freshly minted. */
function Glyph(props) {
	const { state } = props;
	const markup = (0, react.useMemo)(() => artFor(state), [state]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: "dshwx__glyph",
		dangerouslySetInnerHTML: { __html: markup }
	});
}
/** The glass pill that lives in the session header. */
function GlassPill(props) {
	const { reading, fields, particles, enabled, onRefresh } = props;
	const canvas = (0, react.useRef)(null);
	const warn = stateWarn(reading.state);
	const clock = useClock(fields.clock);
	const title = (0, react.useMemo)(() => tooltip(reading), [reading]);
	const live = particles === "always" && enabled;
	useParticles(canvas, reading.state, live);
	const activate = () => {
		onRefresh();
	};
	const showRange = fields.range && (reading.hi !== void 0 || reading.lo !== void 0);
	const showHumidity = fields.humidity;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dshwx dshwx--compact",
		"data-state": reading.state,
		role: "button",
		tabIndex: 0,
		title,
		"aria-label": `天气：${reading.condition} ${degrees(reading.temperature)} 度`,
		onClick: activate,
		onKeyDown: (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				activate();
			}
		},
		children: [
			live ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
				ref: canvas,
				className: "dshwx__fx"
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dshwx__bloom" }),
			reading.state === "thunder" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dshwx__bolt" }) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "dshwx__icon",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dshwx__halo" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Glyph, { state: reading.state })]
			}),
			fields.warn && warn !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dshwx__warn",
				"data-lv": warn,
				title: `${warn} alert`,
				dangerouslySetInnerHTML: { __html: LINE_ICONS.warn }
			}) : null,
			fields.city && reading.city.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "dshwx__loc",
				title: `${reading.city}（单击刷新）`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dshwx__pin",
					dangerouslySetInnerHTML: { __html: LINE_ICONS.pin }
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dshwx__city",
					children: reading.city
				})]
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "dshwx__primary",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dshwx__now",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dshwx__temp",
						children: [degrees(reading.temperature), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("sup", { children: "°" })]
					}), fields.condition ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dshwx__cond",
						children: reading.condition
					}) : null]
				}), showRange || showHumidity ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dshwx__hl",
					children: [showRange ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						title: "今日最高",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx__arrow",
								dangerouslySetInnerHTML: { __html: LINE_ICONS.up }
							}),
							degrees(reading.hi),
							"°"
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						title: "今日最低",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx__arrow",
								dangerouslySetInnerHTML: { __html: LINE_ICONS.down }
							}),
							degrees(reading.lo),
							"°"
						]
					})] }) : null, showHumidity ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						title: "相对湿度",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx__drop",
								dangerouslySetInnerHTML: { __html: DROP_ICON }
							}),
							degrees(reading.humidity),
							"%"
						]
					}) : null]
				}) : null]
			}),
			fields.clock ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dshwx__clock",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dshwx__time",
					children: clock
				})
			}) : null
		]
	});
}
/**
* The reference stylesheet under this plugin's own class prefix.
*
* `.wx__lens` → `.dshwx__lens`, `.wx[data-state]` → `.dshwx[data-state]`, while
* `--wx-h`, `wx-spin`, `wx-bolt` and friends are untouched.
*/
const SCOPED_CSS = String.raw`/* ============================================================
   WeatherWidget — glass weather pill
   states: sunny | partly | cloudy | rainy | thunder | snowy | night
   ============================================================ */

.wx {
  --wx-h: 76px;
  --wx-lens: 118px;
  --wx-tint: 168, 205, 246;
  --wx-tint-a: 0.5;
  --wx-edge: rgba(255, 255, 255, 0.85);
  --wx-glow: rgba(255, 255, 255, 0.55);
  --wx-ink: #ffffff;
  --wx-ts: 0 1px 12px rgba(84, 108, 148, 0.45);
  --wx-shadow: 0 18px 44px rgba(90, 110, 150, 0.22);

  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: 0 12px;
  box-sizing: border-box;
  height: var(--wx-h);
  padding: 0 24px 0 20px;
  border-radius: calc(var(--wx-h) / 2);
  color: var(--wx-ink);
  font-family: var(--wx-font, inherit);
  overflow: hidden;
  -webkit-backdrop-filter: blur(18px) saturate(165%);
  backdrop-filter: blur(18px) saturate(165%);
  box-shadow: var(--wx-shadow);
}

/* tinted glass body */
.wx::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -3;
  border-radius: inherit;
  background: linear-gradient(
    100deg,
    rgba(var(--wx-tint), calc(var(--wx-tint-a) + 0.16)) 0%,
    rgba(var(--wx-tint), var(--wx-tint-a)) 46%,
    rgba(255, 255, 255, 0.14) 100%
  );
}

/* top sheen + inner rim + cursor-tracked gloss */
.wx::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(
      190px 130px at var(--lx, 50%) var(--ly, 50%),
      rgba(255, 255, 255, 0.26),
      rgba(255, 255, 255, 0) 68%
    ),
    linear-gradient(180deg, rgba(255, 255, 255, 0.48) 0%, rgba(255, 255, 255, 0) 46%),
    radial-gradient(120% 150% at 6% -34%, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0) 50%);
  box-shadow: inset 0 0 0 1.4px var(--wx-edge),
    inset 0 -12px 22px rgba(255, 255, 255, 0.24),
    inset 0 9px 18px rgba(255, 255, 255, 0.3);
}

/* ---------- glass bubble lens that trails the cursor ---------- */
.wx__lens {
  position: absolute;
  left: 0;
  top: 0;
  width: var(--wx-lens);
  height: var(--wx-lens);
  translate: calc(var(--lx, -999px) - var(--wx-lens) / 2)
    calc(var(--ly, -999px) - var(--wx-lens) / 2);
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  scale: 0.5;
  transition: opacity 0.3s ease, scale 0.55s cubic-bezier(0.2, 0.9, 0.25, 1.12),
    translate 0.13s linear;
  /* thicker glass under the bead — only composited while hovered */
  background: radial-gradient(
      44% 44% at 30% 26%,
      rgba(255, 255, 255, 0.5),
      rgba(255, 255, 255, 0) 70%
    ),
    radial-gradient(28% 28% at 68% 74%, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0) 72%),
    radial-gradient(100% 100% at 50% 62%, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0) 72%),
    radial-gradient(
      closest-side,
      rgba(255, 255, 255, 0) 80%,
      rgba(255, 255, 255, 0.3) 93%,
      rgba(255, 255, 255, 0) 100%
    );
  box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.45),
    inset -2px -7px 14px rgba(112, 142, 184, 0.22),
    0 10px 22px rgba(66, 90, 128, 0.16), 0 2px 6px rgba(66, 90, 128, 0.12);
}
/* chromatic rim, the dispersion the reference fakes with feDisplacementMap */
.wx__lens::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: 50%;
  background: conic-gradient(
    from 205deg,
    rgba(255, 96, 96, 0.3),
    rgba(96, 214, 255, 0.3) 34%,
    rgba(140, 255, 190, 0.22) 58%,
    rgba(255, 96, 96, 0) 84%
  );
  filter: blur(3.5px);
  mix-blend-mode: screen;
  -webkit-mask: radial-gradient(closest-side, transparent 72%, #000 92%);
  mask: radial-gradient(closest-side, transparent 72%, #000 92%);
}
/* light the bead throws onto the glass */
.wx__lens::after {
  content: "";
  position: absolute;
  inset: 12% 6% -18% 18%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0) 72%);
  filter: blur(6px);
}
.wx:hover .wx__lens,
.wx:focus-within .wx__lens {
  opacity: 0.72;
  scale: 1;
  backdrop-filter: blur(1.6px) saturate(1.55) brightness(1.05);
  -webkit-backdrop-filter: blur(1.6px) saturate(1.55) brightness(1.05);
}

.wx__fx {
  position: absolute;
  inset: 0;
  z-index: -2;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* mood bloom on the edges */
.wx__bloom {
  position: absolute;
  inset: -1px;
  z-index: -2;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(70% 130% at 100% 50%, var(--wx-glow) 0%, rgba(255, 255, 255, 0) 62%),
    radial-gradient(56% 120% at 0% 42%, rgba(255, 255, 255, 0.4), rgba(255, 255, 255, 0) 60%);
  mix-blend-mode: screen;
}

/* keep white type legible over light glass */
.wx__loc,
.wx__temp,
.wx__cond,
.wx__hl,
.wx__time {
  text-shadow: var(--wx-ts);
}

/* ---------- icon ---------- */
.wx__icon {
  position: relative;
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
}
.wx__icon svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.wx__halo {
  position: absolute;
  inset: -26%;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(255, 246, 210, 0) 0deg,
    rgba(255, 246, 210, 0.8) 34deg,
    rgba(255, 255, 255, 0) 80deg,
    rgba(255, 232, 180, 0.55) 172deg,
    rgba(255, 255, 255, 0) 228deg,
    rgba(255, 246, 210, 0.6) 318deg,
    rgba(255, 255, 255, 0) 360deg
  );
  filter: blur(6px);
  opacity: 0;
  animation: wx-spin 20s linear infinite;
}
.wx[data-state="sunny"] .wx__halo,
.wx[data-state="partly"] .wx__halo,
.wx[data-state="snowy"] .wx__halo,
.wx[data-state="heatwave"] .wx__halo {
  opacity: 0.9;
}
.wx[data-state="heatwave"] .wx__halo {
  background: conic-gradient(
    from 0deg,
    rgba(255, 214, 160, 0) 0deg,
    rgba(255, 196, 130, 0.85) 34deg,
    rgba(255, 255, 255, 0) 82deg,
    rgba(255, 170, 110, 0.6) 176deg,
    rgba(255, 255, 255, 0) 232deg,
    rgba(255, 205, 140, 0.65) 320deg,
    rgba(255, 255, 255, 0) 360deg
  );
}
.wx[data-state="night"] .wx__halo,
.wx[data-state="thunder"] .wx__halo {
  background: conic-gradient(
    from 0deg,
    rgba(214, 224, 255, 0) 0deg,
    rgba(224, 232, 255, 0.7) 40deg,
    rgba(255, 255, 255, 0) 98deg,
    rgba(196, 176, 255, 0.5) 214deg,
    rgba(255, 255, 255, 0) 300deg
  );
  opacity: 0.8;
}
@keyframes wx-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- location ---------- */
.wx__loc {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 4px;
  border: 0;
  background: none;
  color: var(--wx-ink);
  font: inherit;
  font-size: 15.5px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 14px;
  transition: background 0.25s ease;
}
.wx__loc:hover {
  background: rgba(255, 255, 255, 0.18);
}
.wx__loc svg {
  width: 13px;
  height: 13px;
  opacity: 0.95;
}

/* ---------- temperature block ---------- */
.wx__primary {
  flex: 0 1 auto;
  display: flex;
  align-items: center;
  gap: 0 14px;
  min-width: 0;
}
.wx__now {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.wx__temp {
  position: relative;
  font-size: 29px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.9px;
}
.wx__temp sup {
  position: absolute;
  top: 0.16em;
  font-size: 0.4em;
  font-weight: 500;
  margin-left: 1px;
}
.wx__cond {
  font-size: 15.5px;
  font-weight: 500;
  letter-spacing: 0.2px;
  white-space: nowrap;
  opacity: 0.97;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wx__hl {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 11px;
  font-size: 15.5px;
  font-weight: 500;
}
.wx__hl span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.wx__hl svg {
  width: 10px;
  height: 10px;
  opacity: 0.92;
}
.wx__hl::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 26px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.55) 50%,
    rgba(255, 255, 255, 0) 100%
  );
}

/* ---------- clock ---------- */
.wx__clock {
  flex: 0 0 auto;
  margin-left: auto;
  padding-left: 10px;
}
.wx__time {
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.3px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ---------- state moods ---------- */
.wx[data-state="sunny"] {
  --wx-tint: 255, 213, 146;
  --wx-tint-a: 0.56;
  --wx-glow: rgba(255, 224, 145, 0.8);
}
.wx[data-state="partly"] {
  --wx-tint: 168, 205, 246;
  --wx-tint-a: 0.5;
  --wx-glow: rgba(255, 240, 208, 0.5);
}
.wx[data-state="cloudy"] {
  --wx-tint: 152, 178, 213;
  --wx-tint-a: 0.64;
  --wx-glow: rgba(255, 255, 255, 0.5);
}
.wx[data-state="rainy"] {
  --wx-tint: 122, 162, 212;
  --wx-tint-a: 0.6;
  --wx-glow: rgba(176, 214, 255, 0.6);
  --wx-shadow: 0 20px 46px rgba(58, 92, 140, 0.34);
}
.wx[data-state="thunder"] {
  --wx-tint: 106, 94, 184;
  --wx-tint-a: 0.66;
  --wx-edge: rgba(226, 216, 255, 0.7);
  --wx-glow: rgba(186, 146, 255, 0.8);
  --wx-shadow: 0 22px 52px rgba(48, 34, 104, 0.44);
}
.wx[data-state="snowy"] {
  --wx-tint: 148, 184, 221;
  --wx-tint-a: 0.64;
  --wx-glow: rgba(255, 255, 255, 0.8);
  --wx-shadow: 0 18px 44px rgba(120, 148, 182, 0.28);
}
.wx[data-state="night"] {
  --wx-tint: 58, 70, 144;
  --wx-tint-a: 0.78;
  --wx-edge: rgba(198, 208, 255, 0.5);
  --wx-glow: rgba(148, 166, 255, 0.55);
  --wx-shadow: 0 24px 56px rgba(24, 30, 74, 0.5);
}

/* ---- extended states ---- */
.wx[data-state="overcast"] {
  --wx-tint: 120, 136, 160; --wx-tint-a: 0.66; --wx-glow: rgba(255, 255, 255, 0.4);
}
.wx[data-state="fog"] {
  --wx-tint: 168, 182, 198; --wx-tint-a: 0.62; --wx-glow: rgba(255, 255, 255, 0.55);
}
.wx[data-state="haze"] {
  --wx-tint: 196, 172, 140; --wx-tint-a: 0.62; --wx-glow: rgba(232, 204, 160, 0.6);
  --wx-shadow: 0 18px 44px rgba(140, 118, 88, 0.26);
}
.wx[data-state="drizzle"] {
  --wx-tint: 150, 178, 208; --wx-tint-a: 0.58; --wx-glow: rgba(210, 232, 255, 0.5);
}
.wx[data-state="shower"] {
  --wx-tint: 138, 176, 218; --wx-tint-a: 0.58; --wx-glow: rgba(255, 240, 200, 0.45);
}
.wx[data-state="sleet"] {
  --wx-tint: 156, 180, 206; --wx-tint-a: 0.6; --wx-glow: rgba(230, 244, 255, 0.6);
}
.wx[data-state="windy"] {
  --wx-tint: 150, 196, 214; --wx-tint-a: 0.54; --wx-glow: rgba(200, 240, 255, 0.6);
}
.wx[data-state="rainstorm"] {
  --wx-tint: 46, 76, 120; --wx-tint-a: 0.8; --wx-edge: rgba(190, 215, 245, 0.5);
  --wx-glow: rgba(120, 170, 225, 0.5); --wx-shadow: 0 22px 52px rgba(20, 44, 78, 0.46);
}
.wx[data-state="blizzard"] {
  --wx-tint: 172, 196, 222; --wx-tint-a: 0.66; --wx-glow: rgba(255, 255, 255, 0.85);
  --wx-shadow: 0 18px 44px rgba(112, 140, 176, 0.3);
}
.wx[data-state="hail"] {
  --wx-tint: 140, 162, 192; --wx-tint-a: 0.66; --wx-glow: rgba(220, 240, 255, 0.6);
}
.wx[data-state="icyrain"] {
  --wx-tint: 122, 158, 190; --wx-tint-a: 0.66; --wx-glow: rgba(200, 238, 255, 0.65);
}
.wx[data-state="sandstorm"] {
  --wx-tint: 200, 150, 90; --wx-tint-a: 0.68; --wx-glow: rgba(244, 196, 120, 0.75);
  --wx-shadow: 0 20px 48px rgba(138, 92, 44, 0.34);
}
.wx[data-state="typhoon"] {
  --wx-tint: 40, 68, 100; --wx-tint-a: 0.82; --wx-edge: rgba(180, 210, 240, 0.5);
  --wx-glow: rgba(90, 190, 220, 0.55); --wx-shadow: 0 22px 52px rgba(14, 38, 60, 0.48);
}
.wx[data-state="tornado"] {
  --wx-tint: 104, 112, 126; --wx-tint-a: 0.76; --wx-edge: rgba(220, 226, 236, 0.5);
  --wx-glow: rgba(180, 196, 214, 0.5); --wx-shadow: 0 22px 50px rgba(48, 54, 66, 0.42);
}
.wx[data-state="heatwave"] {
  --wx-tint: 255, 138, 84; --wx-tint-a: 0.6; --wx-glow: rgba(255, 170, 90, 0.85);
  --wx-shadow: 0 20px 48px rgba(178, 88, 40, 0.34);
}
.wx[data-state="coldwave"] {
  --wx-tint: 84, 130, 190; --wx-tint-a: 0.72; --wx-glow: rgba(190, 226, 255, 0.65);
  --wx-shadow: 0 20px 48px rgba(38, 70, 116, 0.38);
}

/* ---- warning badge ---- */
.wx__warn {
  flex: 0 0 auto;
  width: 19px;
  height: 19px;
  margin-left: -4px;
  display: grid;
  place-items: center;
  color: var(--wx-warn);
  filter: drop-shadow(0 2px 7px rgba(40, 50, 70, 0.4));
  animation: wx-pulse 2.6s ease-in-out infinite;
}
.wx__warn svg {
  width: 100%;
  height: 100%;
}
.wx__warn[data-lv="blue"] { --wx-warn: #4aa3ff; }
.wx__warn[data-lv="yellow"] { --wx-warn: #ffd24a; }
.wx__warn[data-lv="orange"] { --wx-warn: #ff9f43; }
.wx__warn[data-lv="red"] { --wx-warn: #ff5b5b; }
@keyframes wx-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.14); opacity: 0.82; }
}

/* thunder flash */
.wx__bolt {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(
    58% 130% at 86% 50%,
    rgba(255, 255, 255, 0.95),
    rgba(214, 190, 255, 0.35) 42%,
    rgba(255, 255, 255, 0) 72%
  );
  animation: wx-bolt 6.5s ease-in-out infinite;
}
@keyframes wx-bolt {
  0%, 86%, 100% { opacity: 0; }
  89% { opacity: 0.95; }
  91% { opacity: 0.12; }
  93% { opacity: 0.8; }
  97% { opacity: 0; }
}
.wx[data-state="thunder"] .wx__bloom {
  animation: wx-flash 6.5s ease-in-out infinite;
}
@keyframes wx-flash {
  0%, 88%, 100% { opacity: 0.85; }
  90% { opacity: 1; }
  92% { opacity: 0.6; }
  94% { opacity: 1; }
}

/* ---------- responsive ---------- */
@media (max-width: 640px) {
  .wx {
    --wx-h: 66px;
    gap: 0 10px;
    padding: 0 16px 0 12px;
  }
  .wx__hl {
    display: none;
  }
  .wx__icon {
    width: 38px;
    height: 38px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .wx *,
  .wx::after {
    animation-duration: 0.001s !important;
    animation-iteration-count: 1 !important;
  }
}
`.replaceAll(".wx", ".dshwx");
/**
* Layers the reference does not cover.
*
* `.dshwx--compact` — the same glass pill at header scale, carrying every part
* of the reading the user switched on.
*/
const LAYOUT_CSS = `
/* ---------- wrapper spans around the inline SVG artwork ----------
   The reference injects its SVG directly into .wx__icon / .wx__loc / .wx__hl,
   so its own "… svg { … }" rules size them. These spans keep that contract while
   giving React one stable child to own. */
.dshwx__glyph,
.dshwx__drop,
.dshwx__pin,
.dshwx__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dshwx__glyph {
  width: 100%;
  height: 100%;
}
.dshwx__drop {
  width: 10px;
  height: 10px;
  opacity: 0.9;
}
.dshwx__drop svg {
  width: 100%;
  height: 100%;
}

/* ---------- compact pill: the whole design at header scale ---------- */
.dshwx--compact {
  --wx-h: 30px;
  padding: 0 12px 0 10px;
  gap: 0 9px;
  cursor: pointer;
  /* a button/div reset: the glass is painted by ::before, never by background */
  border: 0;
  font: inherit;
  text-align: left;
}
.dshwx--compact:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.75);
  outline-offset: 2px;
}
.dshwx--compact .dshwx__icon {
  width: 20px;
  height: 20px;
}
.dshwx--compact .dshwx__halo {
  inset: -14%;
  filter: blur(4px);
}
.dshwx--compact .dshwx__loc {
  gap: 4px;
  padding: 3px 6px 3px 3px;
  font-size: 11.5px;
  border-radius: 9px;
}
.dshwx--compact .dshwx__loc svg {
  width: 10px;
  height: 10px;
}
.dshwx--compact .dshwx__primary {
  gap: 0 11px;
}
.dshwx--compact .dshwx__now {
  gap: 7px;
}
.dshwx--compact .dshwx__temp {
  font-size: 16px;
  letter-spacing: -0.4px;
}
.dshwx--compact .dshwx__temp sup {
  top: 0.08em;
  font-size: 0.5em;
}
.dshwx--compact .dshwx__cond {
  font-size: 12px;
}
.dshwx--compact .dshwx__hl {
  gap: 9px;
  font-size: 11.5px;
}
.dshwx--compact .dshwx__hl span {
  gap: 3px;
}
.dshwx--compact .dshwx__hl svg {
  width: 9px;
  height: 9px;
}
.dshwx--compact .dshwx__hl::before {
  left: -6px;
  height: 14px;
}
.dshwx--compact .dshwx__clock {
  padding-left: 8px;
}
.dshwx--compact .dshwx__time {
  font-size: 12px;
}
.dshwx--compact .dshwx__warn {
  width: 13px;
  height: 13px;
  margin-left: -2px;
}
.dshwx--compact .dshwx__drop {
  width: 10px;
  height: 10px;
  /* the reference gives text a shadow for legibility on light glass; an inline
     SVG cannot take text-shadow, so it gets the equivalent drop-shadow */
  filter: drop-shadow(0 1px 3px rgba(84, 108, 148, 0.45));
}
`;
/** Everything this plugin puts into the document. */
const ALL_CSS = `${SCOPED_CSS}\n${LAYOUT_CSS}\n
.dshwx-set {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 12px;
  min-width: 0;
}
.dshwx-set__status {
  opacity: 0.75;
  line-height: 1.6;
  word-break: break-word;
}
.dshwx-set__group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(127, 127, 127, 0.2);
  border-radius: 14px;
  background: rgba(127, 127, 127, 0.06);
}
.dshwx-set__title {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.9;
  letter-spacing: 0.02em;
}
.dshwx-set__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.dshwx-set__rowText {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.dshwx-set__label {
  font-size: 12px;
}
.dshwx-set__note {
  font-size: 11px;
  opacity: 0.55;
  line-height: 1.5;
}
.dshwx-set__switch {
  appearance: none;
  -webkit-appearance: none;
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  margin: 0;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.32);
  position: relative;
  cursor: pointer;
  transition: background 0.18s ease;
}
.dshwx-set__switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.18s ease;
}
.dshwx-set__switch:checked {
  background: #4090ff;
}
.dshwx-set__switch:checked::after {
  transform: translateX(16px);
}
.dshwx-set__switch:focus-visible {
  outline: 2px solid rgba(64, 144, 255, 0.7);
  outline-offset: 2px;
}
.dshwx-set__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.dshwx-set select,
.dshwx-set input[type='text'] {
  box-sizing: border-box;
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(127, 127, 127, 0.3));
  border-radius: 10px;
  background-color: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.08));
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  font-size: 12px;
}
.dshwx-set select {
  cursor: pointer;
}
/*
 * The dropdown popup is painted by the OS, not by us: "color: inherit" made the
 * option labels white on the OS's white popup, so they only showed up while
 * hovered. Option rows need an *opaque* surface and its own text colour — the
 * theme's overlay token is exactly the popover surface, and the system colours
 * are the fallback when a token is missing.
 */
.dshwx-set select option,
.dshwx-set select optgroup {
  background-color: var(--dsw-alias-bg-overlay, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
}
.dshwx-set__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.dshwx-set button {
  padding: 7px 13px;
  border: 1px solid rgba(127, 127, 127, 0.3);
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.1);
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.18s ease;
}
.dshwx-set button:hover {
  background: rgba(127, 127, 127, 0.2);
}
.dshwx-set__preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 14px 12px;
  border-radius: 14px;
  /* the design's own showcase sky, so the pill is judged as designed */
  background: linear-gradient(155deg, #a9c8ef 0%, #c9d9f2 30%, #e3d9ea 62%, #f6d9c6 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
}
.dshwx-set__preview .dshwx--compact {
  --wx-h: 34px;
  padding: 0 14px 0 11px;
  gap: 0 10px;
}
.dshwx-set__preview .dshwx--compact .dshwx__icon {
  width: 24px;
  height: 24px;
}
.dshwx-set__preview .dshwx--compact .dshwx__temp {
  font-size: 17px;
}
.dshwx-set__previewNote {
  font-size: 11px;
  color: #4b5876;
  opacity: 0.9;
}
`;
/**
* Insert the stylesheet once and hand back the remover.
*
* The element is tagged, so a hot reload or a second mount cannot stack
* duplicates: an existing tag is reused.
*/
function installStyles(doc = document) {
	const existing = doc.head.querySelector("style[data-dsh-glass-weather-styles]");
	if (existing !== null) {
		if (existing.textContent !== ALL_CSS) existing.textContent = ALL_CSS;
		return () => void 0;
	}
	const style = doc.createElement("style");
	style.setAttribute("data-dsh-glass-weather-styles", "");
	style.textContent = ALL_CSS;
	doc.head.appendChild(style);
	return () => {
		style.remove();
	};
}
//#endregion
//#region src/client/index.tsx
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
/** Slot the pill registers into: title-adjacent session actions. */
const HEADER_SLOT = "conversation.session.header.actions";
/** Where the particle policy is remembered (per browser profile). */
const PARTICLES_STORAGE_KEY = "dsh-weather:particles";
/** Where the pill's field switches are remembered. */
const FIELDS_STORAGE_KEY = "dsh-weather:pill-fields";
/** Where the local manual weather state is remembered. */
const STATE_STORAGE_KEY = "dsh-weather:state";
/** Default particle policy: the design's layer runs in the pill. */
const DEFAULT_PARTICLE_MODE = "always";
/** Minimal external store for `useSyncExternalStore`. */
function createStore(initial) {
	let value = initial;
	const listeners = /* @__PURE__ */ new Set();
	return {
		get: () => value,
		set: (next) => {
			if (Object.is(next, value)) return;
			value = next;
			for (const listener of [...listeners]) listener();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
	};
}
/** One line of plain-language help per pill field. */
const FIELD_HELP = Object.freeze({
	city: "在胶囊里显示地名（如「南昌县」）。地名最长，会占用会话标题的宽度。",
	condition: "显示「阴 / 小雨」这类状态词。",
	humidity: "显示相对湿度百分比。",
	range: "显示今天的最高与最低温度。",
	clock: "显示当前时间。系统任务栏已有时间，所以默认关闭。",
	warn: "恶劣天气（霾、沙尘暴、台风等）时，在图标旁显示对应颜色的三角预警标。"
});
/** Human labels for the particle policies. */
const PARTICLE_LABEL = Object.freeze({
	always: "常驻（胶囊里跑）",
	off: "关闭"
});
/** Effect kind → the card's option label. */
const EFFECT_LABEL = Object.freeze({
	auto: "自动（按实时天气）",
	rain: "雨",
	snow: "雪",
	fog: "雾",
	thunder: "雷暴",
	off: "关闭粒子（Host）"
});
/** Every selectable effect kind, in the order the card lists them. */
const EFFECT_KINDS = Object.freeze([
	"auto",
	"rain",
	"snow",
	"fog",
	"thunder",
	"off"
]);
/** Reads the particle policy from the browser. */
function readStoredParticleMode() {
	try {
		if (typeof window === "undefined") return DEFAULT_PARTICLE_MODE;
		const stored = window.localStorage.getItem(PARTICLES_STORAGE_KEY);
		if (stored === "always" || stored === "off") return stored;
	} catch {}
	return DEFAULT_PARTICLE_MODE;
}
/** Persists the particle policy; a blocked storage keeps the session value. */
function writeStoredParticleMode(mode) {
	try {
		window.localStorage.setItem(PARTICLES_STORAGE_KEY, mode);
	} catch {}
}
/** Reads the pill's field switches from the browser. */
function readStoredFields() {
	try {
		if (typeof window === "undefined") return { ...DEFAULT_FIELDS };
		const stored = window.localStorage.getItem(FIELDS_STORAGE_KEY);
		if (stored === null) return { ...DEFAULT_FIELDS };
		return coerceFields(JSON.parse(stored));
	} catch {}
	return { ...DEFAULT_FIELDS };
}
/** Persists the field switches. */
function writeStoredFields(fields) {
	try {
		window.localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(fields));
	} catch {}
}
/** True when a value names one of the design's 23 states. */
function isGlassState(value) {
	return typeof value === "string" && Object.prototype.hasOwnProperty.call(STATES, value);
}
/**
* Reads the local manual state.
*
* This is what makes all 23 states reachable: four of them (haze, sandstorm,
* typhoon, tornado) have no WMO code behind them, so nothing but a manual pick
* can show them.
*/
function readStoredState() {
	try {
		if (typeof window === "undefined") return "";
		const stored = window.localStorage.getItem(STATE_STORAGE_KEY);
		return isGlassState(stored) ? stored : "";
	} catch {}
	return "";
}
/** Persists the local manual state. */
function writeStoredState(state) {
	try {
		if (state === "") window.localStorage.removeItem(STATE_STORAGE_KEY);
		else window.localStorage.setItem(STATE_STORAGE_KEY, state);
	} catch {}
}
/** The settings card contributed to `settings.plugins.tab`. */
function WeatherSettingsCard(props) {
	const { binding, status, particles, fields, state, onRefresh } = props;
	const getForm = (0, react.useCallback)(() => binding.getForm(), [binding]);
	const form = (0, react.useSyncExternalStore)(binding.subscribe, getForm);
	if (form === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "dshwx-set",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "dshwx-set__status",
			children: "正在读取设置…"
		})
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WeatherFields, {
		form,
		status,
		particles,
		fields,
		state,
		onRefresh
	});
}
/** The controls, once a form exists. */
function WeatherFields(props) {
	const { form, status, particles, fields, state, onRefresh } = props;
	const subscribe = (0, react.useMemo)(() => form.subscribe.bind(form), [form]);
	const readSnapshot = (0, react.useMemo)(() => form.getSnapshot.bind(form), [form]);
	const snapshot = (0, react.useSyncExternalStore)(subscribe, readSnapshot);
	const live = (0, react.useSyncExternalStore)(status.subscribe, status.get);
	const mode = (0, react.useSyncExternalStore)(particles.subscribe, particles.get);
	const shown = (0, react.useSyncExternalStore)(fields.subscribe, fields.get);
	const manualState = (0, react.useSyncExternalStore)(state.subscribe, state.get);
	const [lastWrite, setLastWrite] = (0, react.useState)("");
	const value = coerceConfig(snapshot.value);
	const set = (field, next) => {
		setLastWrite("保存中…");
		form.set(field, next).then((accepted) => {
			setLastWrite(accepted ? `已保存 ${field}` : `${field} 被 Host 拒绝`);
		}, (error) => {
			setLastWrite(`${field} 保存失败：${error instanceof Error ? error.message : String(error)}`);
		});
	};
	const setMode = (next) => {
		particles.set(next);
		writeStoredParticleMode(next);
		setLastWrite(`粒子：${PARTICLE_LABEL[next]}`);
	};
	const toggleField = (key, on) => {
		const next = {
			...shown,
			[key]: on
		};
		fields.set(next);
		writeStoredFields(next);
		setLastWrite(`胶囊显示：${FIELD_OPTIONS.find(([k]) => k === key)?.[1] ?? key} ${on ? "开" : "关"}`);
	};
	const setState = (next) => {
		state.set(next);
		writeStoredState(next);
		setLastWrite(next === "" ? "天气状态：自动" : `天气状态：${stateLabel(next)}`);
	};
	/** Put every browser-local preference back to what the plugin ships with. */
	const resetLocal = () => {
		const defaults = { ...DEFAULT_FIELDS };
		fields.set(defaults);
		writeStoredFields(defaults);
		particles.set(DEFAULT_PARTICLE_MODE);
		writeStoredParticleMode(DEFAULT_PARTICLE_MODE);
		state.set("");
		writeStoredState("");
		setLastWrite("已恢复本机默认显示");
	};
	const reading = live.error !== void 0 ? `读取失败：${live.error}` : [
		live.city.length > 0 ? live.city : void 0,
		live.condition,
		live.temperature === void 0 ? void 0 : `${live.temperature.toFixed(1)}°C`,
		live.humidity === void 0 ? void 0 : `湿度 ${live.humidity.toFixed(0)}%`,
		live.hi === void 0 || live.lo === void 0 ? void 0 : `今日 ${String(Math.round(live.lo))}~${String(Math.round(live.hi))}°C`,
		live.updatedAt === void 0 ? void 0 : new Date(live.updatedAt).toLocaleTimeString()
	].filter((part) => part !== void 0).join(" · ");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dshwx-set",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshwx-set__status",
				children: reading
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshwx-set__preview",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GlassPill, {
					reading: live,
					fields: shown,
					particles: mode,
					enabled: live.enabled && live.manualEffect !== "off",
					onRefresh
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dshwx-set__previewNote",
					children: "实时预览 · 与顶栏是同一个组件"
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dshwx-set__group",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dshwx-set__title",
					children: "显示内容"
				}), FIELD_OPTIONS.map(([key, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dshwx-set__row",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dshwx-set__rowText",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dshwx-set__label",
							children: label
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dshwx-set__note",
							children: FIELD_HELP[key]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: "dshwx-set__switch",
						type: "checkbox",
						checked: shown[key],
						"aria-label": label,
						onChange: (event) => {
							toggleField(key, event.target.checked);
						}
					})]
				}, key))]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dshwx-set__group",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshwx-set__title",
						children: "外观与动效"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshwx-set__field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__label",
								children: "粒子动效"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								value: mode,
								onChange: (event) => {
									setMode(event.target.value);
								},
								children: ["always", "off"].map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: option,
									children: PARTICLE_LABEL[option]
								}, option))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__note",
								children: "每种天气状态自带一套粒子（雨、雪、星、沙尘、漩涡…），按设计稿参数运行。关闭后胶囊里不创建 canvas，零绘制开销。"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshwx-set__field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__label",
								children: "手动天气状态"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: manualState,
								onChange: (event) => {
									const next = event.target.value;
									setState(isGlassState(next) ? next : "");
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: "自动（按实时天气）"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("optgroup", {
										label: "常规天气",
										children: STATE_LIST.filter((candidate) => STATES[candidate].group === 0).map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: candidate,
											children: stateLabel(candidate)
										}, candidate))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("optgroup", {
										label: "极端天气",
										children: STATE_LIST.filter((candidate) => STATES[candidate].group === 1).map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: candidate,
											children: stateLabel(candidate)
										}, candidate))
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__note",
								children: "22 种状态能由真实天气自动判定；只有「龙卷风」全球没有公开数据源，只能在这里手动选。手动选择只改外观与粒子，不动 get_weather 的读数。"
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dshwx-set__group",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshwx-set__title",
						children: "数据与位置"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshwx-set__field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__label",
								children: "城市（留空自动定位）"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "text",
								value: value.city,
								placeholder: "例如：南昌县",
								onChange: (event) => {
									set("city", event.target.value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__note",
								children: "留空时使用浏览器定位，并把坐标反查成真实地名（县 ＞ 市 ＞ 省）；填了就固定用它。也接受「纬度,经度」。"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshwx-set__actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: onRefresh,
							children: "刷新天气"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dshwx-set__note",
							children: "数据来自 Open-Meteo，免密钥；每次刷新两个请求（天气 + 空气质量）。"
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dshwx-set__group",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshwx-set__title",
						children: "高级"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshwx-set__row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dshwx-set__rowText",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__label",
								children: "允许绘制（Host 总开关）"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__note",
								children: "Host 侧配置。关掉后胶囊照常显示读数，只是粒子层不启动。"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "dshwx-set__switch",
							type: "checkbox",
							checked: value.enabled,
							"aria-label": "允许绘制",
							onChange: (event) => {
								set("enabled", event.target.checked);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshwx-set__field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__label",
								children: "Host 手动特效"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
								value: value.manualEffect,
								onChange: (event) => {
									set("manualEffect", event.target.value);
								},
								children: EFFECT_KINDS.map((kind) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: kind,
									children: EFFECT_LABEL[kind]
								}, kind))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dshwx-set__note",
								children: "Host 侧的粗粒度覆盖（雨 / 雪 / 雾 / 雷暴 / 关闭粒子），优先级低于上面的本机手动状态。"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dshwx-set__actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: resetLocal,
							children: "恢复本机默认显示"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dshwx-set__note",
							children: "只重置本机的 6 个显示开关、粒子策略与手动状态，不动 Host 配置。"
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dshwx-set__note",
				children: [snapshot.value === void 0 ? "未读到设置值，界面显示的是默认值" : "设置源 weather", lastWrite.length > 0 ? ` · ${lastWrite}` : ""]
			})
		]
	});
}
/** Client-side mirror of the Config defaults, used until the Host answers. */
const DEFAULT_VALUE = {
	enabled: true,
	city: "",
	rainColor: "#aedbf0",
	snowColor: "#ffffff",
	fogColor: "#c8d8e8",
	lightningColor: "#ffffff",
	densityScale: 1,
	speedScale: 1,
	opacity: .7,
	enableLightning: true,
	manualEffect: "auto"
};
/** Validate one numeric field, clamped into range. */
function numberIn(value, fallback, min, max) {
	return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
/** Validate one colour-ish string field. */
function stringOr(value, fallback) {
	return typeof value === "string" && value.length > 0 ? value : fallback;
}
/** Narrow an arbitrary resolved value to an effect kind. */
function coerceEffectKind(value) {
	return typeof value === "string" && EFFECT_KINDS.includes(value) ? value : "auto";
}
/**
* Build a complete config from whatever the settings document resolved.
*
* A patch `config` block replaces a section wholesale, so a field the user never
* touched can arrive absent or `null`. Every field is therefore validated on its
* own — spreading the raw section over the defaults would let `manualEffect:
* null` through and silently switch the override off.
*/
function coerceConfig(raw) {
	const source = typeof raw === "object" && raw !== null ? raw : {};
	return {
		enabled: source.enabled !== false,
		city: typeof source.city === "string" ? source.city : DEFAULT_VALUE.city,
		rainColor: stringOr(source.rainColor, DEFAULT_VALUE.rainColor),
		snowColor: stringOr(source.snowColor, DEFAULT_VALUE.snowColor),
		fogColor: stringOr(source.fogColor, DEFAULT_VALUE.fogColor),
		lightningColor: stringOr(source.lightningColor, DEFAULT_VALUE.lightningColor),
		densityScale: numberIn(source.densityScale, DEFAULT_VALUE.densityScale, .2, 3),
		speedScale: numberIn(source.speedScale, DEFAULT_VALUE.speedScale, .2, 3),
		opacity: numberIn(source.opacity, DEFAULT_VALUE.opacity, .1, 1),
		enableLightning: source.enableLightning !== false,
		manualEffect: coerceEffectKind(source.manualEffect)
	};
}
/** Client plugin identity (informational; the module id is the package name). */
const name = "dsh-glass-weather";
/** No hard service dependency: everything below is injected optionally. */
const inject = [];
/** Mount the browser half. */
function apply(ctx) {
	if (typeof document === "undefined" || typeof window === "undefined") return;
	const services = ctx;
	const particles = createStore(readStoredParticleMode());
	const fields = createStore(readStoredFields());
	const manualState = createStore(readStoredState());
	const status = createStore({
		state: "partly",
		condition: "读取中",
		city: "",
		temperature: void 0,
		humidity: void 0,
		hi: void 0,
		lo: void 0,
		windSpeed: void 0,
		updatedAt: void 0,
		error: void 0,
		manualEffect: "auto",
		enabled: true,
		particleMode: particles.get(),
		fields: fields.get(),
		stateOverride: manualState.get()
	});
	let config = { ...DEFAULT_VALUE };
	let report;
	let abort;
	/**
	* The state to draw for the current reading.
	*
	* The local manual pick wins, then the Host's `manualEffect`, then the live
	* weather: the WMO code plus every extra reading that can tell apart a state
	* the code cannot express (cloud cover, mixed rain and snow, gusts and
	* pressure, visibility, particulates).
	*/
	const resolveState = () => {
		const local = manualState.get();
		if (local !== "") return local;
		const manual = stateForManual(config.manualEffect);
		if (manual !== void 0) return manual;
		if (report === void 0) return "partly";
		return stateForCode(report.weathercode, {
			hour: (/* @__PURE__ */ new Date()).getHours(),
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
			dust: report.dust
		});
	};
	/** Republish the snapshot from the current config + reading. */
	const publish = () => {
		const state = resolveState();
		const current = status.get();
		status.set({
			state,
			condition: report === void 0 ? current.error === void 0 ? "读取中" : "读取失败" : stateLabel(state),
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
			stateOverride: manualState.get()
		});
	};
	const refresh = async () => {
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
				dust: air?.dust
			};
			status.set({
				...status.get(),
				error: void 0,
				updatedAt: Date.now()
			});
			publish();
		} catch (error) {
			if (controller.signal.aborted) return;
			const message = error instanceof Error ? error.message : String(error);
			status.set({
				...status.get(),
				error: message
			});
			publish();
			services.logger.warn("dsh-weather: weather lookup failed:", message);
		}
	};
	const onConfig = (next) => {
		const merged = coerceConfig(next);
		const cityChanged = merged.city !== config.city;
		config = merged;
		publish();
		if (cityChanged) refresh();
	};
	const bindingListeners = /* @__PURE__ */ new Set();
	let activeForm;
	let boundNamespace;
	let unbindForm;
	let unbindDescribe;
	const binding = {
		getForm: () => activeForm,
		subscribe: (listener) => {
			bindingListeners.add(listener);
			return () => {
				bindingListeners.delete(listener);
			};
		}
	};
	/**
	* Bind the settings section.
	*
	* `configForms` is a Cordis service: it may only be read from a context that
	* declared it, so every touch of it lives inside this inject.
	*/
	const bindConfigForms = (configCtx) => {
		const forms = configCtx.configForms;
		const describe = forms.describe();
		const syncNamespace = () => {
			const namespace = resolveNamespace(describe);
			if (namespace === boundNamespace) return;
			boundNamespace = namespace;
			unbindForm?.();
			const form = forms.get(namespace);
			activeForm = form;
			onConfig(form.getSnapshot().value);
			unbindForm = form.subscribe(() => {
				onConfig(form.getSnapshot().value);
			});
			for (const listener of [...bindingListeners]) listener();
		};
		unbindDescribe = describe.subscribe(syncNamespace);
		describe.ensure().catch(() => void 0);
		syncNamespace();
	};
	services.effect(() => {
		const removeStyles = installStyles();
		refresh();
		services.inject(["configForms"], (configCtx) => {
			bindConfigForms(configCtx);
		});
		const unbindParticles = particles.subscribe(publish);
		const unbindFields = fields.subscribe(publish);
		const unbindState = manualState.subscribe(publish);
		services.inject(["slots"], (slotsCtx) => {
			const slots = slotsCtx.slots;
			if (slots === void 0) return;
			slots.inject(HEADER_SLOT, () => slots.register({
				name: HEADER_SLOT,
				id: "weather",
				order: 40,
				label: () => "天气"
			}, () => {
				const snapshot = (0, react.useSyncExternalStore)(status.subscribe, status.get);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GlassPill, {
					reading: snapshot,
					fields: snapshot.fields,
					particles: snapshot.particleMode,
					enabled: snapshot.enabled && snapshot.manualEffect !== "off",
					onRefresh: () => void refresh()
				});
			}));
			slots.inject("settings.plugins.tab", () => slots.register({
				name: "settings.plugins.tab",
				id: "weather",
				order: 40,
				label: () => "天气"
			}, () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WeatherSettingsCard, {
				binding,
				status,
				particles,
				fields,
				state: manualState,
				onRefresh: () => void refresh()
			})));
		});
		services.inject(["commandUi"], (commandCtx) => {
			const commandUi = commandCtx.commandUi;
			if (commandUi === void 0) return;
			commandUi.register({
				name: "refresh_weather",
				label: () => "刷新天气",
				description: () => "重新定位并查询当前天气",
				available: () => true,
				ui: {
					kind: "action",
					run: () => void refresh()
				}
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
				const value = isGlassState(next) ? next : "";
				manualState.set(value);
				writeStoredState(value);
			},
			status: () => status.get()
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
	}, "dsh-weather: header pill, settings card and command");
	services.logger.info("dsh-weather: client half mounted (%s, particles: %s)", window.dshDesktop === void 0 ? "browser" : "desktop shell", particles.get());
}
/** Entry ids the settings document may address. */
const WEATHER_ENTRY_ID_CANDIDATES = ["weather", "include:weather"];
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
function resolveNamespace(describe) {
	try {
		const namespaces = describe.getSnapshot().view?.namespaces ?? [];
		for (const candidate of WEATHER_ENTRY_ID_CANDIDATES) if (namespaces.some((entry) => entry.ns === candidate)) return candidate;
		for (const entry of namespaces) {
			const value = entry.value;
			if (typeof value !== "object" || value === null) continue;
			const record = value;
			if ("manualEffect" in record && "enableLightning" in record) return entry.ns;
		}
	} catch {}
	return WEATHER_ENTRY_ID_CANDIDATES[0] ?? "weather";
}
var client_default = {
	name,
	inject,
	apply
};
//#endregion
exports.ALL_CSS = ALL_CSS;
exports.DEFAULT_FIELDS = DEFAULT_FIELDS;
exports.DEFAULT_PARTICLE_MODE = DEFAULT_PARTICLE_MODE;
exports.FIELDS_STORAGE_KEY = FIELDS_STORAGE_KEY;
exports.FIELD_OPTIONS = FIELD_OPTIONS;
exports.FX_PRESETS = FX_PRESETS;
exports.GlassPill = GlassPill;
exports.HEADER_SLOT = HEADER_SLOT;
exports.LAYOUT_CSS = LAYOUT_CSS;
exports.LINE_ICONS = LINE_ICONS;
exports.PARTICLES_STORAGE_KEY = PARTICLES_STORAGE_KEY;
exports.ParticleFx = ParticleFx;
exports.SCOPED_CSS = SCOPED_CSS;
exports.STATES = STATES;
exports.STATE_LIST = STATE_LIST;
exports.STATE_STORAGE_KEY = STATE_STORAGE_KEY;
exports.WeatherSettingsCard = WeatherSettingsCard;
exports.apply = apply;
exports.artFor = artFor;
exports.cityOnly = cityOnly;
exports.coerceConfig = coerceConfig;
exports.coerceFields = coerceFields;
exports.default = client_default;
exports.inject = inject;
exports.installStyles = installStyles;
exports.isGlassState = isGlassState;
exports.name = name;
exports.pickPlaceName = pickPlaceName;
exports.readStoredFields = readStoredFields;
exports.readStoredParticleMode = readStoredParticleMode;
exports.readStoredState = readStoredState;
exports.resolveNamespace = resolveNamespace;
exports.resolveWeather = resolveWeather;
exports.stateForCode = stateForCode;
exports.stateForManual = stateForManual;
exports.stateLabel = stateLabel;
exports.stateWarn = stateWarn;
exports.writeStoredFields = writeStoredFields;
exports.writeStoredParticleMode = writeStoredParticleMode;
exports.writeStoredState = writeStoredState;

return module.exports; } });