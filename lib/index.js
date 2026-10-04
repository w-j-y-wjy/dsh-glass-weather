import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
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
/**
* Resolve one user-facing location argument into a report.
*
* A numeric `lat,lon` argument is used verbatim; anything else is geocoded.
*/
async function reportForLocation(location, days, signal) {
	const query = location.trim();
	if (query.length === 0) throw new Error("get_weather requires a non-empty location; pass a city name such as \"北京\".");
	const pair = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(query);
	if (pair !== null) {
		const latitude = Number(pair[1]);
		const longitude = Number(pair[2]);
		if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error(`get_weather received out-of-range coordinates "${query}".`);
		return fetchWeather(latitude, longitude, days, signal, query);
	}
	const hit = await geocodeWithFallback(query, signal);
	if (hit === void 0) throw new Error(`get_weather could not resolve "${query}" to a place. Use a city name such as "北京" or "Shanghai", or pass "lat,lon".`);
	const label = [
		hit.name,
		hit.admin1,
		hit.country
	].filter((part) => typeof part === "string" && part.length > 0).join(", ");
	return fetchWeather(hit.latitude, hit.longitude, days, signal, label);
}
//#endregion
//#region src/tools.ts
/**
* The `get_weather` tool: one model-facing call returning the current condition
* plus a short daily forecast for a named place.
*/
/** Tool name as registered and as seen by the model. */
const GET_WEATHER = "get_weather";
/**
* Instruction text for the tool.
*
* Written as the three-part contract the harness prefers: what it does, when to
* reach for it, and — just as importantly — when not to.
*/
const GET_WEATHER_DESCRIPTION = [
	"查询指定城市的实时天气和短期预报，返回温度、天气代码、降水量、风速和逐日预报。",
	"当用户询问天气、温度、是否下雨/下雪、风力大小、出行天气建议时使用。",
	"不要用于查询历史天气数据（本工具只提供当前和未来预报）。"
].join(" ");
/** Render a report as one compact model-facing text block. */
function renderReport(report) {
	const lines = [`${report.location}：${report.weatherText}（WMO ${String(report.weathercode)}），气温 ${report.temperature.toFixed(1)}°C，相对湿度 ${report.humidity.toFixed(0)}%，降水 ${report.precipitation.toFixed(1)} mm，风速 ${report.windSpeed.toFixed(1)} km/h。`];
	if (report.daily.length > 0) {
		lines.push("逐日预报：");
		for (const day of report.daily) lines.push(`- ${day.date}：${day.weatherText}（WMO ${String(day.weathercode)}），${day.tempMin.toFixed(1)}~${day.tempMax.toFixed(1)}°C，降水 ${day.precipitationSum.toFixed(1)} mm`);
	}
	return lines.join("\n");
}
/**
* Build the tool definition bound to one config accessor.
*
* The accessor is called per invocation, so a settings write that changes
* `city` takes effect on the next call without a plugin reload — and it is the
* only correct way to read a `.volatile()` section.
*/
function weatherTool(readConfig) {
	return defineTool({
		name: GET_WEATHER,
		description: GET_WEATHER_DESCRIPTION,
		parameters: {
			location: {
				type: "string",
				required: true,
				description: "城市名，例如「北京」「Shanghai」；也接受 \"纬度,经度\" 形式的坐标。"
			},
			days: {
				type: "integer",
				description: "预报天数，1-7，默认 1。"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					location: {
						type: "string",
						required: true
					},
					temperature: {
						type: "number",
						required: true
					},
					weathercode: {
						type: "integer",
						required: true
					},
					weatherText: {
						type: "string",
						required: true
					},
					precipitation: {
						type: "number",
						required: true
					},
					windSpeed: {
						type: "number",
						required: true
					},
					humidity: {
						type: "number",
						required: true
					},
					daily: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								date: {
									type: "string",
									required: true
								},
								tempMax: {
									type: "number",
									required: true
								},
								tempMin: {
									type: "number",
									required: true
								},
								weathercode: {
									type: "integer",
									required: true
								},
								weatherText: {
									type: "string",
									required: true
								},
								precipitationSum: {
									type: "number",
									required: true
								}
							}
						}
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: renderReport(value)
			}]
		},
		async execute(args, exec) {
			const requested = args.location.trim();
			const fallback = readConfig().city.trim();
			const target = requested.length > 0 ? requested : fallback;
			if (target.length === 0) throw new Error("get_weather needs a location; pass a city name such as \"北京\".");
			const report = await reportForLocation(target, clampDays(args.days), exec.signal);
			return {
				location: report.location,
				temperature: report.temperature,
				weathercode: report.weathercode,
				weatherText: report.weatherText,
				precipitation: report.precipitation,
				windSpeed: report.windSpeed,
				humidity: report.humidity,
				daily: report.daily.map((day) => ({
					date: day.date,
					tempMax: day.tempMax,
					tempMin: day.tempMin,
					weathercode: day.weathercode,
					weatherText: day.weatherText,
					precipitationSum: day.precipitationSum
				}))
			};
		}
	});
}
/**
* Register `get_weather` on the plugin's own fiber.
*
* `ctx.tools.register` returns the disposer that unregisters the tool, and the
* fiber tracks it anyway — a hot reload or a profile disable therefore removes
* the tool without any explicit teardown here.
*/
function registerWeatherTool(ctx, readConfig) {
	return ctx.tools.register(weatherTool(readConfig));
}
//#endregion
//#region src/index.ts
/**
* dsh-glass-weather — Host half.
*
* Two responsibilities, both model/host facing:
*   1. register the `get_weather` tool (`ctx.tools`), and
*   2. declare the plugin's configuration as a *volatile* schema, so the
*      Settings surface may edit it live and the values the browser half reads
*      through the settings document always match what the tool uses.
*
* Every resource is registered on this plugin's own fiber: `dsh web` (or the
* desktop shell) unloading or hot-reloading the plugin reverses both by itself.
*/
/** Stable Loader identity of this plugin (the `name` field of the patch entry). */
const name = "dsh-glass-weather";
/**
* Profile entry id this plugin is mounted under.
*
* The dsh settings document addresses one *profile entry* per plugin, not a
* free-form namespace: the client half must ask for exactly this id. It is the
* `id` of the entry inserted by `cordis.patch.yml`.
*/
const WEATHER_ENTRY_ID = "weather";
/** Services this plugin cannot run without. */
const inject = ["tools"];
/** Effect kinds the browser half understands, in the order the card lists them. */
const EFFECT_KINDS = [
	"auto",
	"rain",
	"snow",
	"fog",
	"thunder",
	"off"
];
/**
* Plugin configuration.
*
* `.volatile()` is what makes every field editable from the Settings surface:
* the settings service projects only volatile fields into a form, and a
* volatile section is re-resolved live, so an accepted write reaches both the
* tool and the browser half without a reload. Every field carries a default,
* because a patch entry's `config` is replaced wholesale — never deep-merged.
*/
const Config = z.object({
	enabled: z.boolean().default(true).description("特效总开关"),
	city: z.string().default("").description("手动指定城市，留空则自动定位"),
	rainColor: z.string().default("#aedbf0").description("雨滴颜色"),
	snowColor: z.string().default("#ffffff").description("雪花颜色"),
	fogColor: z.string().default("#c8d8e8").description("雾颜色"),
	lightningColor: z.string().default("#ffffff").description("闪电颜色"),
	densityScale: z.number().min(.2).max(3).default(1).description("粒子密度倍率"),
	speedScale: z.number().min(.2).max(3).default(1).description("下落速度倍率"),
	opacity: z.number().min(.1).max(1).default(.7).description("整体不透明度"),
	enableLightning: z.boolean().default(true).description("是否启用雷暴闪电"),
	manualEffect: z.union(EFFECT_KINDS.map((kind) => z.const(kind))).default("auto").description("手动特效：auto / rain / snow / fog / thunder / off")
}).volatile();
/**
* Mount the Host half.
*
* A `.volatile()` schema resolves to a *reference*, not a plain object: read it
* with `config.get()`. That reference stays live across settings writes, which
* is exactly why the tool resolves it per call instead of capturing values.
*/
function apply(ctx, config) {
	registerWeatherTool(ctx, () => config.get());
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber), "dsh-weather: settings page policy");
		ctx.logger.info("dsh-weather: settings exposed on entry \"%s\"", WEATHER_ENTRY_ID);
	});
}
var src_default = {
	name,
	inject,
	Config,
	apply
};
//#endregion
export { Config, EFFECT_KINDS, WEATHER_ENTRY_ID, apply, src_default as default, inject, name };
