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
import z from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
// Loads the `ctx.settings` service augmentation (SettingsForms) into this
// program; the value itself is provided by the profile at mount time.
import type {} from '@deepseek-ai/dsh-settings';
import { registerWeatherTool } from './tools.ts';

/** Stable Loader identity of this plugin (the `name` field of the patch entry). */
export const name = 'dsh-glass-weather';

/**
 * Profile entry id this plugin is mounted under.
 *
 * The dsh settings document addresses one *profile entry* per plugin, not a
 * free-form namespace: the client half must ask for exactly this id. It is the
 * `id` of the entry inserted by `cordis.patch.yml`.
 */
export const WEATHER_ENTRY_ID = 'weather';

/** Services this plugin cannot run without. */
export const inject = ['tools'];

/** Effect kinds the browser half understands, in the order the card lists them. */
export const EFFECT_KINDS = ['auto', 'rain', 'snow', 'fog', 'thunder', 'off'] as const;

/** One selectable effect kind (`auto` follows the live weather code). */
export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Resolved plugin configuration. */
export interface WeatherConfig {
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

/**
 * Plugin configuration.
 *
 * `.volatile()` is what makes every field editable from the Settings surface:
 * the settings service projects only volatile fields into a form, and a
 * volatile section is re-resolved live, so an accepted write reaches both the
 * tool and the browser half without a reload. Every field carries a default,
 * because a patch entry's `config` is replaced wholesale — never deep-merged.
 */
export const Config = z
  .object({
    enabled: z.boolean().default(true).description('特效总开关'),
    city: z.string().default('').description('手动指定城市，留空则自动定位'),
    rainColor: z.string().default('#aedbf0').description('雨滴颜色'),
    snowColor: z.string().default('#ffffff').description('雪花颜色'),
    fogColor: z.string().default('#c8d8e8').description('雾颜色'),
    lightningColor: z.string().default('#ffffff').description('闪电颜色'),
    densityScale: z.number().min(0.2).max(3).default(1).description('粒子密度倍率'),
    speedScale: z.number().min(0.2).max(3).default(1).description('下落速度倍率'),
    opacity: z.number().min(0.1).max(1).default(0.7).description('整体不透明度'),
    enableLightning: z.boolean().default(true).description('是否启用雷暴闪电'),
    manualEffect: z
      .union(EFFECT_KINDS.map((kind) => z.const(kind)))
      .default('auto')
      .description('手动特效：auto / rain / snow / fog / thunder / off'),
  })
  .volatile();

/**
 * Mount the Host half.
 *
 * A `.volatile()` schema resolves to a *reference*, not a plain object: read it
 * with `config.get()`. That reference stays live across settings writes, which
 * is exactly why the tool resolves it per call instead of capturing values.
 */
export function apply(ctx: Context, config: { get(): WeatherConfig }): void {
  registerWeatherTool(ctx, () => config.get());

  // This plugin ships its own settings card, so the automatic schema page for
  // the entry is turned off. Optional injection keeps the plugin working in
  // compositions that do not mount `@deepseek-ai/dsh-settings`.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'dsh-weather: settings page policy',
    );
    ctx.logger.info('dsh-weather: settings exposed on entry "%s"', WEATHER_ENTRY_ID);
  });
}

export default { name, inject, Config, apply };
