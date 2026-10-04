/**
 * The glass pill's canvas particle layer.
 *
 * Ported from the reference design's particle engine (`FX`, `rgba` and
 * `class Fx`) with this plugin's performance contract on top:
 *
 * - one `requestAnimationFrame` loop, gated to 30 fps by timestamp;
 * - `devicePixelRatio` capped at 1.5, for the backing store only;
 * - drawing is skipped and the frame clock is reset while the document is
 *   hidden or the canvas box is zero-sized (so a restored frame cannot see one
 *   huge delta);
 * - the loop never starts under `prefers-reduced-motion: reduce`, and stops if
 *   the preference flips while it runs;
 * - every particle is created at preset-switch time and respawned in place, so
 *   the draw loop allocates no objects;
 * - the constructor does not start anything — call `start()`.
 *
 * Particle counts, speeds, lengths, angles, colours, alphas and drift are the
 * design's values, unchanged. The only import is the state vocabulary's type.
 */
import type { GlassState } from './state.ts';

/** The particle families the design draws. */
export type FxKind =
  | 'rain'
  | 'streak'
  | 'pellet'
  | 'snow'
  | 'star'
  | 'cloud'
  | 'fog'
  | 'mote'
  | 'wave'
  | 'swirl';

/** An `[r, g, b]` triple, 0–255, as the design's table writes colours. */
export type Rgb = readonly [number, number, number];

/** One layer of the design's `FX` table. Omitted fields take the defaults. */
export interface FxLayer {
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

/** A live particle. One shape for every family; unused fields stay `0`. */
interface Particle {
  x: number;
  y: number;
  /** Primary speed. */
  v: number;
  /** Pellet rebound velocity. */
  vy: number;
  /** Segment length. */
  l: number;
  /** Radius. */
  r: number;
  /** Current alpha. */
  a: number;
  /** Wobble / twinkle phase. */
  ph: number;
  /** Snow sway amplitude. */
  sw: number;
  /** Star twinkle speed. */
  sp: number;
  /** Heat-wave amplitude. */
  amp: number;
  /** Tornado orbit centre x. */
  cx: number;
  /** Tornado spin direction. */
  s: number;
}

/** A preset merged with the design's defaults, plus its live particles. */
interface Layer {
  readonly k: FxKind;
  readonly n: number;
  readonly c: Rgb;
  readonly sp: number;
  readonly len: number;
  readonly ang: number;
  readonly w: number;
  readonly a: number;
  readonly drift: number;
  readonly fall: number;
  readonly dark: number;
  readonly parts: Particle[];
}

/** 30 fps frame budget, in ms. */
const FRAME_MS = 1000 / 30;

/** `devicePixelRatio` ceiling for the backing store. */
const MAX_DPR = 1.5;

/** The design's default layer values. */
const DEFAULT_COLOR: Rgb = [255, 255, 255];
const DEFAULT_COUNT = 24;
const DEFAULT_SPEED = 6;
const DEFAULT_LENGTH = 12;
const DEFAULT_ANGLE = 0.17;
const DEFAULT_WIDTH = 1.35;
const DEFAULT_ALPHA = 0.3;
const DEFAULT_DRIFT = 0.6;

/** The grey overcast clouds use instead of the layer colour. */
const DARK_COLOR: Rgb = [206, 212, 224];

/** The reduced-motion query the engine respects. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The design's particle layer per state, verbatim. */
const PRESETS: Record<GlassState, readonly FxLayer[]> = {
  sunny: [{ k: 'mote', n: 26, c: [255, 240, 190] }],
  partly: [{ k: 'cloud', n: 12 }, { k: 'mote', n: 10, c: [255, 240, 190] }],
  cloudy: [{ k: 'cloud', n: 8 }],
  overcast: [{ k: 'cloud', n: 16, dark: 1, a: 0.09 }],
  fog: [{ k: 'fog', n: 8, a: 0.16 }, { k: 'cloud', n: 4 }],
  haze: [
    { k: 'fog', n: 9, c: [216, 190, 152], a: 0.15 },
    { k: 'mote', n: 14, c: [226, 202, 168], sp: 0.3 },
  ],
  drizzle: [{ k: 'rain', n: 66, sp: 3.4, len: 6, w: 1, a: 0.34 }],
  rainy: [{ k: 'rain', n: 78, sp: 7, len: 13 }],
  shower: [
    { k: 'rain', n: 96, sp: 8.5, len: 15, ang: 0.26 },
    { k: 'mote', n: 8, c: [255, 238, 190] },
  ],
  thunder: [{ k: 'rain', n: 96, sp: 9, len: 15, ang: 0.2, c: [226, 216, 255] }],
  sleet: [{ k: 'rain', n: 52, sp: 6, len: 8 }, { k: 'snow', n: 28, sp: 1.1 }],
  snowy: [{ k: 'snow', n: 52, sp: 0.9 }],
  windy: [{ k: 'streak', n: 46, sp: 7.5, len: 44, ang: 0.02, a: 0.22 }],
  night: [{ k: 'star', n: 38 }],

  rainstorm: [
    { k: 'rain', n: 150, sp: 12.5, len: 22, ang: 0.5, w: 1.7, a: 0.44 },
    { k: 'streak', n: 16, sp: 9, len: 40, ang: 0.5, a: 0.12 },
  ],
  blizzard: [
    { k: 'snow', n: 120, sp: 2.6, drift: 3.2, a: 0.5 },
    { k: 'streak', n: 24, sp: 10, len: 38, ang: 0.05, a: 0.16 },
  ],
  hail: [
    { k: 'pellet', n: 56, sp: 9, a: 0.5 },
    { k: 'rain', n: 34, sp: 7.5, len: 12 },
  ],
  icyrain: [
    { k: 'rain', n: 48, sp: 4.4, len: 8, c: [214, 240, 255] },
    { k: 'mote', n: 12, sp: 0.4, c: [226, 244, 255] },
  ],
  sandstorm: [
    { k: 'streak', n: 96, sp: 13, len: 58, ang: 0.07, c: [238, 202, 150], a: 0.32 },
    { k: 'mote', n: 26, sp: 1.2, c: [226, 188, 136] },
  ],
  typhoon: [
    { k: 'streak', n: 130, sp: 16, len: 52, ang: 0.34, a: 0.28 },
    { k: 'rain', n: 62, sp: 11, len: 16, ang: 0.46 },
  ],
  tornado: [
    { k: 'swirl', n: 44, sp: 2.4 },
    { k: 'streak', n: 26, sp: 7, len: 30, ang: 0.05, a: 0.14 },
  ],
  heatwave: [
    { k: 'wave', n: 16 },
    { k: 'mote', n: 22, sp: 0.6, c: [255, 214, 170] },
  ],
  coldwave: [
    { k: 'mote', n: 34, sp: 0.9, fall: 1, c: [226, 240, 255] },
    { k: 'snow', n: 20, sp: 0.5 },
  ],
};

/** The design's particle layer per state, frozen. */
export const FX_PRESETS: Readonly<Record<GlassState, readonly FxLayer[]>> = Object.freeze(PRESETS);

/** The design's colour helper. */
function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** A zeroed particle; every field is a number so respawns never allocate. */
function createParticle(): Particle {
  return { x: 0, y: 0, v: 0, vy: 0, l: 0, r: 0, a: 0, ph: 0, sw: 0, sp: 0, amp: 0, cx: 0, s: 0 };
}

/**
 * The canvas particle engine.
 *
 * Construction only reads the canvas, sizes it and spawns the current state's
 * particles; the animation loop starts on `start()`.
 */
export class ParticleFx {
  private canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null;
  private readonly mq: MediaQueryList | null;
  private layers: Layer[] = [];
  private state: GlassState;
  private w = 1;
  private h = 1;
  private dpr = 1;
  /** Drawn-frame counter, for the rain ripples. */
  private t = 0;
  /** Timestamp of the last drawn frame; `-Infinity` = draw on the next frame. */
  private last = -Infinity;
  private raf = 0;
  private active = false;
  private destroyed = false;
  /** Whether the canvas box currently has a non-zero size. */
  private visible = false;

  /** Window resize → re-read the box and DPR. */
  private readonly onResize: () => void = () => {
    this.resize();
  };

  /** Reduced-motion preference change → stop for good. */
  private readonly onMotion: () => void = () => {
    if (this.mq !== null && this.mq.matches) this.stop();
  };

  /** The rAF step: schedule, gate to 30 fps, draw. */
  private readonly frame: (now: number) => void = (now) => {
    if (!this.active) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden || !this.visible) {
      // Skip the frame and reset the clock, so resuming cannot see one huge jump.
      this.last = -Infinity;
      return;
    }
    if (now - this.last < FRAME_MS) return;
    this.last = now;
    this.draw();
  };

  constructor(canvas: HTMLCanvasElement, state: GlassState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = state;
    this.mq =
      typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null;
    this.resize();
    this.set(state);
    window.addEventListener('resize', this.onResize);
    if (this.mq !== null) this.mq.addEventListener('change', this.onMotion);
  }

  /** Whether the animation loop is live. */
  get running(): boolean {
    return this.active;
  }

  /** Switch presets; a running loop is not interrupted. */
  set(state: GlassState): void {
    if (this.destroyed) return;
    this.state = state;
    const preset = FX_PRESETS[state];
    const layers: Layer[] = [];
    for (const cfg of preset) {
      const layer: Layer = {
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
        parts: [],
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
  resize(): void {
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
  start(): void {
    if (this.destroyed || this.active || this.ctx === null) return;
    if (this.mq !== null && this.mq.matches) return;
    this.active = true;
    this.last = -Infinity;
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Stop the loop and clear the canvas. */
  stop(): void {
    if (this.active) {
      this.active = false;
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.clear();
  }

  /** Stop, unhook every listener and drop the canvas/particle references. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    window.removeEventListener('resize', this.onResize);
    if (this.mq !== null) this.mq.removeEventListener('change', this.onMotion);
    this.layers = [];
    this.ctx = null;
    this.canvas = null;
  }

  /** Clear the drawing surface, when there is one. */
  private clear(): void {
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
  private fill(L: Layer, p: Particle, init: boolean): void {
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
      case 'rain':
      case 'pellet': {
        p.x = R() * w * 1.3 - w * 0.15;
        p.y = init ? R() * h : -14;
        p.v = L.sp * (0.75 + R() * 0.55);
        p.vy = L.k === 'pellet' ? -L.sp * 0.35 : 0;
        p.l = L.len * (0.7 + R() * 0.6);
        p.r = L.k === 'pellet' ? 1.5 + R() * 1.7 : 0;
        p.a = L.a * (0.55 + R() * 0.8);
        return;
      }
      case 'streak': {
        p.x = init ? R() * w : -L.len;
        p.y = R() * h;
        p.v = L.sp * (0.7 + R() * 0.7);
        p.l = L.len * (0.55 + R() * 0.8);
        p.a = L.a * (0.4 + R() * 0.9);
        return;
      }
      case 'snow': {
        p.x = R() * w;
        p.y = init ? R() * h : -6;
        p.v = L.sp * (0.5 + R());
        p.r = 1 + R() * 2.4;
        p.ph = R() * 6.28;
        p.sw = L.drift * (0.5 + R());
        p.a = L.a * (0.6 + R() * 1.2);
        return;
      }
      case 'star': {
        p.x = R() * w;
        p.y = R() * h;
        p.r = 0.6 + R() * 1.4;
        p.ph = R() * 6.28;
        p.sp = 0.012 + R() * 0.03;
        return;
      }
      case 'cloud':
      case 'fog': {
        p.x = R() * w;
        p.y = h * (L.k === 'fog' ? 0.18 + R() * 0.72 : 0.1 + R() * 0.8);
        p.r = L.k === 'fog' ? 34 + R() * 54 : 26 + R() * 48;
        p.v = (L.k === 'fog' ? 0.14 : 0.08) + R() * 0.24;
        p.a = L.a * (0.55 + R() * 0.9);
        return;
      }
      case 'mote': {
        p.x = R() * w;
        p.y = init ? R() * h : L.fall ? -8 : h + 8;
        p.v = L.sp * (0.5 + R());
        p.r = 0.9 + R() * 2.2;
        p.ph = R() * 6.28;
        p.a = L.a * (0.5 + R() * 1.1);
        return;
      }
      case 'wave': {
        p.x = R() * w;
        p.y = h * (0.25 + R() * 0.7);
        p.ph = R() * 6.28;
        p.amp = 2 + R() * 3.4;
        p.v = 0.35 + R() * 0.5;
        p.a = 0.1 + R() * 0.16;
        return;
      }
      case 'swirl': {
        p.cx = w * (0.25 + R() * 0.5);
        p.y = h * (0.15 + R() * 0.7);
        p.r = 10 + R() * 30;
        p.ph = R() * 6.28;
        p.v = 0.03 + R() * 0.05;
        p.a = 0.14 + R() * 0.3;
        p.s = R() < 0.5 ? 1 : -1;
        return;
      }
    }
  }

  /** One frame, at most 30 times a second. Allocates nothing. */
  private draw(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const w = this.w;
    const h = this.h;
    this.t++;
    ctx.clearRect(0, 0, w, h);

    const layers = this.layers;
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li]!;
      const c = L.c;
      const parts = L.parts;
      for (let pi = 0; pi < parts.length; pi++) {
        const p = parts[pi]!;
        switch (L.k) {
          case 'rain': {
            p.y += p.v;
            p.x += p.v * L.ang;
            if (p.y - p.l > h) this.fill(L, p, false);
            ctx.strokeStyle = rgba(c, p.a);
            ctx.lineWidth = L.w;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.l * L.ang, p.y - p.l);
            ctx.stroke();
            break;
          }
          case 'streak': {
            p.x += p.v;
            p.y += p.v * L.ang;
            if (p.x - p.l > w) {
              // The design's `{ x: -p.l }` override reads the *old* length.
              const old = p.l;
              this.fill(L, p, false);
              p.x = -old;
            }
            ctx.strokeStyle = rgba(c, p.a);
            ctx.lineWidth = L.w;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.l, p.y - p.l * L.ang);
            ctx.stroke();
            break;
          }
          case 'pellet': {
            p.vy += 0.42;
            p.y += p.vy + p.v * 0.3;
            p.x += p.v * 0.12;
            if (p.y > h - 3) {
              p.y = h - 3;
              p.vy = -Math.abs(p.vy) * 0.45;
              if (Math.abs(p.vy) < 1.2) {
                this.fill(L, p, false);
                p.y = -6;
              }
            }
            ctx.fillStyle = rgba(c, Math.min(0.95, p.a + 0.35));
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 6.2832);
            ctx.fill();
            break;
          }
          case 'snow': {
            p.y += p.v;
            p.ph += 0.022;
            p.x += Math.sin(p.ph) * p.sw + p.v * L.ang * 0.5;
            if (p.y > h + 4 || p.x < -10 || p.x > w + 10) this.fill(L, p, false);
            ctx.fillStyle = rgba(c, p.a);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 6.2832);
            ctx.fill();
            break;
          }
          case 'star': {
            p.ph += p.sp;
            ctx.fillStyle = rgba(c, 0.25 + Math.abs(Math.sin(p.ph)) * 0.7);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, 6.2832);
            ctx.fill();
            break;
          }
          case 'cloud':
          case 'fog': {
            p.x += p.v;
            if (p.x - p.r > w) p.x = -p.r;
            const col = L.dark ? DARK_COLOR : c;
            const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            gr.addColorStop(0, rgba(col, p.a));
            gr.addColorStop(1, rgba(col, 0));
            ctx.fillStyle = gr;
            ctx.beginPath();
            if (L.k === 'fog') ctx.ellipse(p.x, p.y, p.r, p.r * 0.34, 0, 0, 6.2832);
            else ctx.arc(p.x, p.y, p.r, 0, 6.2832);
            ctx.fill();
            break;
          }
          case 'mote': {
            p.y += L.fall ? p.v : -p.v;
            p.ph += 0.02;
            p.x += Math.sin(p.ph) * 0.3;
            if (p.y < -10 || p.y > h + 10) this.fill(L, p, false);
            const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.6);
            gr.addColorStop(0, rgba(c, p.a * (0.5 + 0.5 * Math.sin(p.ph * 1.7))));
            gr.addColorStop(1, rgba(c, 0));
            ctx.fillStyle = gr;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * 3.6, 0, 6.2832);
            ctx.fill();
            break;
          }
          case 'wave': {
            p.y -= p.v;
            p.ph += 0.06;
            if (p.y < -12) {
              this.fill(L, p, false);
              p.y = h + 12;
            }
            ctx.strokeStyle = rgba(c, p.a * (0.5 + 0.5 * Math.sin(p.ph)));
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            for (let s = 0; s <= 20; s += 2) {
              const xx = p.x + Math.sin(p.ph + s * 0.32) * p.amp;
              if (s === 0) ctx.moveTo(xx, p.y + s);
              else ctx.lineTo(xx, p.y + s);
            }
            ctx.stroke();
            break;
          }
          case 'swirl': {
            p.ph += p.v * p.s;
            const rr = p.r * (0.55 + 0.45 * Math.sin(p.ph * 0.6));
            ctx.fillStyle = rgba(c, p.a);
            ctx.beginPath();
            ctx.arc(
              p.cx + Math.cos(p.ph) * rr * 1.7,
              p.y + Math.sin(p.ph * 1.3) * rr * 0.4,
              1.7,
              0,
              6.2832,
            );
            ctx.fill();
            break;
          }
        }
      }
      /* ripples under sustained rain / hail */
      if ((L.k === 'rain' && L.n >= 70) || L.k === 'pellet') {
        const k = (this.t % 96) / 96;
        ctx.strokeStyle = rgba(c, 0.18 * (1 - k));
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(w * 0.36, h - 4, 6 + k * 38, 1.4 + k * 4.2, 0, 0, 6.2832);
        ctx.stroke();
      }
    }
  }
}