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
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppTheme } from './theme.ts';
import type { ReactElement, RefObject } from 'react';
import { artFor, LINE_ICONS } from './widget/art.ts';
import { ParticleFx } from './widget/fx.ts';
import { stateWarn, type GlassState } from './widget/state.ts';

/** How the particle layer is allowed to run. */
export type ParticleMode = 'always' | 'off';

/** Which parts of the reading the pill is allowed to show. */
export interface PillFields {
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
export const DEFAULT_FIELDS: PillFields = Object.freeze({
  city: false,
  condition: true,
  humidity: true,
  range: true,
  clock: false,
  warn: true,
});

/** Field order, with the label the settings card shows. */
export const FIELD_OPTIONS: readonly (readonly [keyof PillFields, string])[] = Object.freeze([
  ['city', '城市'],
  ['condition', '天气文字'],
  ['humidity', '湿度'],
  ['range', '今日最高/最低'],
  ['clock', '时间'],
  ['warn', '预警角标'],
]);

/** Narrow an arbitrary stored value to a field set. */
export function coerceFields(raw: unknown): PillFields {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof PillFields): boolean =>
    typeof source[key] === 'boolean' ? (source[key] as boolean) : DEFAULT_FIELDS[key];
  return {
    city: pick('city'),
    condition: pick('condition'),
    humidity: pick('humidity'),
    range: pick('range'),
    clock: pick('clock'),
    warn: pick('warn'),
  };
}

/** Everything the pill shows about the current reading. */
export interface PillReading {
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
export interface GlassPillProps {
  reading: PillReading;
  /** Which parts of the reading to draw. */
  fields: PillFields;
  /** Particle policy, as chosen in settings. */
  particles: ParticleMode;
  /** Whether the particle layer is allowed at all (Host switch, minus `off`). */
  enabled: boolean;
  /**
   * The shell's theme. The ported stylesheet is the design's light composition;
   * `dark` swaps in the dark one (same tint and glow, the white sheen dropped).
   */
  mode?: AppTheme;
  onRefresh: () => void;
}

/* ------------------------------------------------------------------ icons */

/** Humidity mark; the reference has no droplet in its line-icon set. */
const DROP_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2c3.1 3.9 5.4 7 5.4 9.9a5.4 5.4 0 0 1-10.8 0c0-2.9 2.3-6 5.4-9.9Z" fill="currentColor"/></svg>';

/* ------------------------------------------------------------------ hooks */

/** `HH:MM`, refreshed on the design's own 15-second cadence. */
function useClock(active: boolean): string {
  const read = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };
  const [text, setText] = useState<string>(read);
  useEffect(() => {
    if (!active) return undefined;
    setText(read());
    const timer = window.setInterval(() => {
      setText(read());
    }, 15000);
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
function useParticles(ref: RefObject<HTMLCanvasElement | null>, state: GlassState, active: boolean): void {
  useEffect(() => {
    const canvas = ref.current;
    if (!active || canvas === null) return undefined;
    let fx: ParticleFx | undefined;
    try {
      fx = new ParticleFx(canvas, state);
    } catch {
      return undefined;
    }
    fx.resize();
    fx.start();
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            fx?.resize();
          })
        : undefined;
    observer?.observe(canvas);
    const onResize = (): void => {
      fx?.resize();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
      fx?.destroy();
    };
  }, [ref, state, active]);
}

/* ------------------------------------------------------------- formatting */

/** The design shows whole degrees; the exact value lives in the tooltip. */
function degrees(value: number | undefined): string {
  return value === undefined ? '--' : String(Math.round(value));
}

/** Precise reading line for `title`. */
function tooltip(reading: PillReading): string {
  const lines: string[] = [];
  if (reading.error !== undefined) {
    lines.push(`天气读取失败：${reading.error}`);
  } else {
    // No placeholder for an unknown place: the line simply starts with the sky.
    lines.push(reading.city.length > 0 ? `${reading.city} · ${reading.condition}` : reading.condition);
    if (reading.temperature !== undefined) lines.push(`温度 ${reading.temperature.toFixed(1)}°C`);
    if (reading.humidity !== undefined) lines.push(`湿度 ${reading.humidity.toFixed(0)}%`);
    if (reading.hi !== undefined && reading.lo !== undefined) {
      lines.push(`今日 ${degrees(reading.lo)} ~ ${degrees(reading.hi)}°C`);
    }
    if (reading.updatedAt !== undefined) lines.push(`更新于 ${new Date(reading.updatedAt).toLocaleTimeString()}`);
  }
  lines.push('单击刷新');
  return lines.join('\n');
}

/** One weather glyph, with the design's gradient ids freshly minted. */
function Glyph(props: { state: GlassState }): ReactElement {
  const { state } = props;
  const markup = useMemo(() => artFor(state), [state]);
  // The artwork is a fixed, self-contained SVG string, never user input.
  return <span className="dshwx__glyph" dangerouslySetInnerHTML={{ __html: markup }} />;
}

/* ------------------------------------------------------------------- pill */

/** The glass pill that lives in the session header. */
export function GlassPill(props: GlassPillProps): ReactElement {
  const { reading, fields, particles, enabled, mode, onRefresh } = props;
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const warn = stateWarn(reading.state);
  const clock = useClock(fields.clock);
  const title = useMemo(() => tooltip(reading), [reading]);
  // No canvas at all unless the layer is actually going to run.
  const live = particles === 'always' && enabled;

  useParticles(canvas, reading.state, live);

  const activate = (): void => {
    onRefresh();
  };

  const showRange = fields.range && (reading.hi !== undefined || reading.lo !== undefined);
  const showHumidity = fields.humidity;

  return (
    <div
      className="dshwx dshwx--compact"
      data-state={reading.state}
      data-mode={mode ?? 'light'}
      role="button"
      tabIndex={0}
      title={title}
      aria-label={`天气：${reading.condition} ${degrees(reading.temperature)} 度`}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }}
    >
      {live ? <canvas ref={canvas} className="dshwx__fx" /> : null}
      <span className="dshwx__bloom" />
      {reading.state === 'thunder' ? <span className="dshwx__bolt" /> : null}
      <span className="dshwx__icon">
        <span className="dshwx__halo" />
        <Glyph state={reading.state} />
      </span>
      {fields.warn && warn !== undefined ? (
        <span
          className="dshwx__warn"
          data-lv={warn}
          title={`${warn} alert`}
          dangerouslySetInnerHTML={{ __html: LINE_ICONS.warn }}
        />
      ) : null}
      {fields.city && reading.city.length > 0 ? (
        <span className="dshwx__loc" title={`${reading.city}（单击刷新）`}>
          <span className="dshwx__pin" dangerouslySetInnerHTML={{ __html: LINE_ICONS.pin }} />
          <span className="dshwx__city">{reading.city}</span>
        </span>
      ) : null}
      <span className="dshwx__primary">
        <span className="dshwx__now">
          <span className="dshwx__temp">
            {degrees(reading.temperature)}
            <sup>°</sup>
          </span>
          {fields.condition ? <span className="dshwx__cond">{reading.condition}</span> : null}
        </span>
        {showRange || showHumidity ? (
          <span className="dshwx__hl">
            {showRange ? (
              <>
                <span title="今日最高">
                  <span className="dshwx__arrow" dangerouslySetInnerHTML={{ __html: LINE_ICONS.up }} />
                  {degrees(reading.hi)}°
                </span>
                <span title="今日最低">
                  <span className="dshwx__arrow" dangerouslySetInnerHTML={{ __html: LINE_ICONS.down }} />
                  {degrees(reading.lo)}°
                </span>
              </>
            ) : null}
            {showHumidity ? (
              <span title="相对湿度">
                <span className="dshwx__drop" dangerouslySetInnerHTML={{ __html: DROP_ICON }} />
                {degrees(reading.humidity)}%
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      {fields.clock ? (
        <span className="dshwx__clock">
          <span className="dshwx__time">{clock}</span>
        </span>
      ) : null}
    </div>
  );
}