import z from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
/** Stable Loader identity of this plugin (the `name` field of the patch entry). */
declare const name = "dsh-glass-weather";
/**
 * Profile entry id this plugin is mounted under.
 *
 * The dsh settings document addresses one *profile entry* per plugin, not a
 * free-form namespace: the client half must ask for exactly this id. It is the
 * `id` of the entry inserted by `cordis.patch.yml`.
 */
declare const WEATHER_ENTRY_ID = "weather";
/** Services this plugin cannot run without. */
declare const inject: string[];
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
/**
 * Plugin configuration.
 *
 * `.volatile()` is what makes every field editable from the Settings surface:
 * the settings service projects only volatile fields into a form, and a
 * volatile section is re-resolved live, so an accepted write reaches both the
 * tool and the browser half without a reload. Every field carries a default,
 * because a patch entry's `config` is replaced wholesale — never deep-merged.
 */
declare const Config: z<NoInfer<Schemastery.ObjectS<NoInfer<{
  enabled: z<boolean, boolean, "defined">;
  city: z<string, string, "defined">;
  rainColor: z<string, string, "defined">;
  snowColor: z<string, string, "defined">;
  fogColor: z<string, string, "defined">;
  lightningColor: z<string, string, "defined">;
  densityScale: z<number, number, "defined">;
  speedScale: z<number, number, "defined">;
  opacity: z<number, number, "defined">;
  enableLightning: z<boolean, boolean, "defined">;
  manualEffect: z<"auto" | "rain" | "snow" | "fog" | "thunder" | "off", "auto" | "rain" | "snow" | "fog" | "thunder" | "off", "defined">;
}>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
  enabled: z<boolean, boolean, "defined">;
  city: z<string, string, "defined">;
  rainColor: z<string, string, "defined">;
  snowColor: z<string, string, "defined">;
  fogColor: z<string, string, "defined">;
  lightningColor: z<string, string, "defined">;
  densityScale: z<number, number, "defined">;
  speedScale: z<number, number, "defined">;
  opacity: z<number, number, "defined">;
  enableLightning: z<boolean, boolean, "defined">;
  manualEffect: z<"auto" | "rain" | "snow" | "fog" | "thunder" | "off", "auto" | "rain" | "snow" | "fog" | "thunder" | "off", "defined">;
}>>>, "volatile">;
/**
 * Mount the Host half.
 *
 * A `.volatile()` schema resolves to a *reference*, not a plain object: read it
 * with `config.get()`. That reference stays live across settings writes, which
 * is exactly why the tool resolves it per call instead of capturing values.
 */
declare function apply(ctx: Context, config: {
  get(): WeatherConfig;
}): void;
declare const _default: {
  name: string;
  inject: string[];
  Config: z<NoInfer<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    city: z<string, string, "defined">;
    rainColor: z<string, string, "defined">;
    snowColor: z<string, string, "defined">;
    fogColor: z<string, string, "defined">;
    lightningColor: z<string, string, "defined">;
    densityScale: z<number, number, "defined">;
    speedScale: z<number, number, "defined">;
    opacity: z<number, number, "defined">;
    enableLightning: z<boolean, boolean, "defined">;
    manualEffect: z<"auto" | "rain" | "snow" | "fog" | "thunder" | "off", "auto" | "rain" | "snow" | "fog" | "thunder" | "off", "defined">;
  }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    city: z<string, string, "defined">;
    rainColor: z<string, string, "defined">;
    snowColor: z<string, string, "defined">;
    fogColor: z<string, string, "defined">;
    lightningColor: z<string, string, "defined">;
    densityScale: z<number, number, "defined">;
    speedScale: z<number, number, "defined">;
    opacity: z<number, number, "defined">;
    enableLightning: z<boolean, boolean, "defined">;
    manualEffect: z<"auto" | "rain" | "snow" | "fog" | "thunder" | "off", "auto" | "rain" | "snow" | "fog" | "thunder" | "off", "defined">;
  }>>>, "volatile">;
  apply: typeof apply;
};
//#endregion
export { Config, EFFECT_KINDS, EffectKind, WEATHER_ENTRY_ID, WeatherConfig, apply, _default as default, inject, name };