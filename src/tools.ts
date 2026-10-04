/**
 * The `get_weather` tool: one model-facing call returning the current condition
 * plus a short daily forecast for a named place.
 */
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';
import { clampDays, reportForLocation } from './weather.ts';
import type { WeatherConfig } from './index.ts';

/** Tool name as registered and as seen by the model. */
export const GET_WEATHER = 'get_weather';

/**
 * Instruction text for the tool.
 *
 * Written as the three-part contract the harness prefers: what it does, when to
 * reach for it, and — just as importantly — when not to.
 */
export const GET_WEATHER_DESCRIPTION = [
  '查询指定城市的实时天气和短期预报，返回温度、天气代码、降水量、风速和逐日预报。',
  '当用户询问天气、温度、是否下雨/下雪、风力大小、出行天气建议时使用。',
  '不要用于查询历史天气数据（本工具只提供当前和未来预报）。',
].join(' ');

/** The model-facing projection of a report (exactly the declared output schema). */
export interface ReportView {
  location: string;
  temperature: number;
  weathercode: number;
  weatherText: string;
  precipitation: number;
  windSpeed: number;
  humidity: number;
  daily: readonly {
    date: string;
    tempMax: number;
    tempMin: number;
    weathercode: number;
    weatherText: string;
    precipitationSum: number;
  }[];
}

/** Render a report as one compact model-facing text block. */
function renderReport(report: ReportView): string {
  const lines = [
    `${report.location}：${report.weatherText}（WMO ${String(report.weathercode)}），气温 ${report.temperature.toFixed(1)}°C，相对湿度 ${report.humidity.toFixed(0)}%，降水 ${report.precipitation.toFixed(1)} mm，风速 ${report.windSpeed.toFixed(1)} km/h。`,
  ];
  if (report.daily.length > 0) {
    lines.push('逐日预报：');
    for (const day of report.daily) {
      lines.push(
        `- ${day.date}：${day.weatherText}（WMO ${String(day.weathercode)}），${day.tempMin.toFixed(1)}~${day.tempMax.toFixed(1)}°C，降水 ${day.precipitationSum.toFixed(1)} mm`,
      );
    }
  }
  return lines.join('\n');
}

/**
 * Build the tool definition bound to one config accessor.
 *
 * The accessor is called per invocation, so a settings write that changes
 * `city` takes effect on the next call without a plugin reload — and it is the
 * only correct way to read a `.volatile()` section.
 */
export function weatherTool(readConfig: () => WeatherConfig): ToolDefinition {
  return defineTool({
    name: GET_WEATHER,
    description: GET_WEATHER_DESCRIPTION,
    parameters: {
      location: {
        type: 'string',
        required: true,
        description: '城市名，例如「北京」「Shanghai」；也接受 "纬度,经度" 形式的坐标。',
      },
      days: {
        type: 'integer',
        description: '预报天数，1-7，默认 1。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          location: { type: 'string', required: true },
          temperature: { type: 'number', required: true },
          weathercode: { type: 'integer', required: true },
          weatherText: { type: 'string', required: true },
          precipitation: { type: 'number', required: true },
          windSpeed: { type: 'number', required: true },
          humidity: { type: 'number', required: true },
          daily: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                date: { type: 'string', required: true },
                tempMax: { type: 'number', required: true },
                tempMin: { type: 'number', required: true },
                weathercode: { type: 'integer', required: true },
                weatherText: { type: 'string', required: true },
                precipitationSum: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderReport(value) }],
    },
    async execute(args, exec) {
      const requested = args.location.trim();
      const fallback = readConfig().city.trim();
      const target = requested.length > 0 ? requested : fallback;
      if (target.length === 0) {
        throw new Error('get_weather needs a location; pass a city name such as "北京".');
      }
      const report = await reportForLocation(target, clampDays(args.days), exec.signal);
      // Project onto the declared output schema: the model-facing result carries
      // the place name, never the raw coordinates.
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
          precipitationSum: day.precipitationSum,
        })),
      };
    },
  });
}

/**
 * Register `get_weather` on the plugin's own fiber.
 *
 * `ctx.tools.register` returns the disposer that unregisters the tool, and the
 * fiber tracks it anyway — a hot reload or a profile disable therefore removes
 * the tool without any explicit teardown here.
 */
export function registerWeatherTool(ctx: Context, readConfig: () => WeatherConfig): () => void {
  return ctx.tools.register(weatherTool(readConfig));
}
