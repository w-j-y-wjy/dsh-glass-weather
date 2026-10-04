/**
 * The glass pill's artwork layer.
 *
 * The reference design draws its 23 weather states as inline SVG: gradients,
 * animated rain drops, drifting snow, a rotating typhoon spiral. This module is
 * the port of that drawing code — pure string builders, no DOM, no state.
 *
 * `artFor()` stamps every call with a fresh `wx{n}-` gradient prefix, so two
 * pills on the same page never share `<defs>` ids.
 */

import type { GlassState } from './state.ts';

/** One gradient stop: `[offsetPercent, color]`. */
type Stop = readonly [number, string];

/** `[x, y, delaySeconds]` — a drifting particle's start. */
type Particle = readonly [number, number, number];

/** Monotonic counter behind the per-call `wx{n}-` defs prefix. */
let uid = 0;

/* ---------------- gradient defs ---------------- */
const lg = (id: string, stops: readonly Stop[], x2 = 0.35, y2 = 1): string =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops
    .map(([o, c]) => `<stop offset="${o}%" stop-color="${c}"/>`)
    .join("")}</linearGradient>`;
const rg = (id: string, stops: readonly Stop[]): string =>
  `<radialGradient id="${id}" cx="38%" cy="28%" r="78%">${stops
    .map(([o, c]) => `<stop offset="${o}%" stop-color="${c}"/>`)
    .join("")}</radialGradient>`;

const DEFS = (p: string): string => `
    <defs>
      ${rg(p + "sun", [[0, "#FFF6C2"], [45, "#FFCE54"], [100, "#FCA83D"]])}
      ${lg(p + "ray", [[0, "#FFE58A"], [100, "#FFC45E"]])}
      ${lg(p + "cloud", [[0, "#FFFFFF"], [55, "#F1F6FF"], [100, "#C8D8F0"]])}
      ${lg(p + "cloudDark", [[0, "#EEF3FB"], [50, "#C4D0E4"], [100, "#8D9CBA"]])}
      ${lg(p + "cloudStorm", [[0, "#C9D2E4"], [50, "#8D9AB6"], [100, "#56627E"]])}
      ${lg(p + "drop", [[0, "#BFE6FF"], [100, "#5AA9E8"]])}
      ${lg(p + "ice", [[0, "#EAFBFF"], [100, "#7FD3F0"]])}
      ${lg(p + "bolt", [[0, "#FFF0A8"], [100, "#F5B62B"]])}
      ${lg(p + "heat", [[0, "#FFD98A"], [100, "#FF7A45"]])}
      ${lg(p + "dust", [[0, "#F6D9A8"], [100, "#C98A45"]])}
      ${rg(p + "moon", [[0, "#FFF7DA"], [55, "#FFDE7A"], [100, "#E9A93C"]])}
    </defs>`;

/* ---------------- icon primitives (64x64 box) ---------------- */
const CLOUD_PATH =
  "M20 46c-7.2 0-13-5.6-13-12.4C7 27.2 12.4 22 19 22c1.6-6.8 7.6-11.6 14.6-11.6" +
  "7.6 0 14 5.2 15.4 12.2 6 .5 10.6 5.2 10.6 10.8C60.2 40.6 55 46 48.2 46Z";

const sun = (p: string, dim?: boolean): string => `
    <g${dim ? ' opacity=".55"' : ""}>
      ${[0, 45, 90, 135, 180, 225, 270, 315]
        .map(
          (a) =>
            `<path d="M32 5 L35 13 H29 Z" fill="url(#${p}${
              dim ? "dust" : "ray"
            })" transform="rotate(${a} 32 30)"/>`
        )
        .join("")}
      <circle cx="32" cy="30" r="15" fill="url(#${p}${dim ? "dust" : "sun"})"/>
      <circle cx="32" cy="30" r="15" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/>
      <ellipse cx="27" cy="24" rx="6" ry="4" fill="rgba(255,255,255,.5)"/>
    </g>`;

const cloud = (p: string, x = 0, y = 0, s = 1, tone = "cloud"): string => `
    <g transform="translate(${x} ${y}) scale(${s})">
      <path d="${CLOUD_PATH}" fill="url(#${p}${tone})"/>
      <path d="${CLOUD_PATH.slice(0, 96)}" fill="none" stroke="rgba(255,255,255,.8)"
            stroke-width="1.8" stroke-linecap="round"/>
      <ellipse cx="27" cy="21" rx="9" ry="4.6" fill="rgba(255,255,255,.66)"/>
    </g>`;

const drops = (p: string, xs: readonly number[] = [20, 32, 44], y = 50, dur = 2): string => `
    <g>${xs
      .map((x, i) => {
        const b = ((i * dur) / xs.length).toFixed(2);
        return `<path d="M${x} ${y}s4.6 5.6 4.6 8.4a4.6 4.6 0 0 1-9.2 0C${x - 4.6} ${
          y + 5.6
        } ${x} ${y} ${x} ${y}Z" fill="url(#${p}drop)">
          <animateTransform attributeName="transform" type="translate" values="0 0;0 8;0 0"
            dur="${dur}s" begin="${b}s" repeatCount="indefinite" calcMode="spline"
            keySplines=".4 0 .6 1;.4 0 .6 1"/>
          <animate attributeName="opacity" values="0;1;1;0" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>
        </path>`;
      })
      .join("")}</g>`;

const dots = (p: string, xs: readonly number[] = [20, 30, 40, 50]): string => `
    <g fill="url(#${p}drop)">${xs
      .map(
        (x, i) => `<circle cx="${x}" cy="52" r="2.1">
          <animate attributeName="cy" values="50;60;50" dur="1.6s" begin="${(i * 0.34).toFixed(
            2
          )}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="${(i * 0.34).toFixed(
            2
          )}s" repeatCount="indefinite"/>
        </circle>`
      )
      .join("")}</g>`;

const flakes = (pts: ReadonlyArray<Particle> = [[20, 52, 0], [32, 55, 0.9], [44, 52, 1.7]]): string => `
    <g fill="#fff">${pts
      .map(
        ([x, y, d]) => `<circle cx="${x}" cy="${y}" r="3.1">
          <animate attributeName="cy" values="${y};${y + 9};${y}" dur="3s" begin="${d}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0;1;1;0" dur="3s" begin="${d}s" repeatCount="indefinite"/>
        </circle>`
      )
      .join("")}</g>`;

const flakeGlyph = (cx: number, cy: number, r: number, stroke = "#eaf4ff", w = 2.4): string => {
  let arms = "";
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 * Math.PI) / 180;
    const tip: readonly [number, number] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const mid: readonly [number, number] = [cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55];
    arms += `<path d="M${cx} ${cy}L${tip[0].toFixed(1)} ${tip[1].toFixed(1)}"/>`;
    for (const s of [1, -1]) {
      const b = a + s * 0.9;
      arms += `<path d="M${mid[0].toFixed(1)} ${mid[1].toFixed(1)}l${(
        Math.cos(b) * r * 0.26
      ).toFixed(1)} ${(Math.sin(b) * r * 0.26).toFixed(1)}"/>`;
    }
  }
  return `<g stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" fill="none">${arms}</g>`;
};

/** Hail pellet starts: `[x, y, delaySeconds]`. */
const PELLETS: ReadonlyArray<Particle> = [
  [20, 52, 0],
  [32, 56, 0.5],
  [44, 52, 1],
];

const pellets = (p: string): string => `
    <g>${PELLETS.map(
      ([x, y, d]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="url(#${p}ice)"
             stroke="rgba(255,255,255,.9)" stroke-width="1">
          <animate attributeName="cy" values="${y - 3};${y + 6};${y - 3}" dur="1.5s" begin="${d}s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;1;0" dur="1.5s" begin="${d}s" repeatCount="indefinite"/>
        </circle>`
    ).join("")}</g>`;

const bolt = (p: string): string => `
    <path d="M37 34 23 52h8l-3.5 10 15-19h-9l5-9Z" fill="url(#${p}bolt)"
          stroke="rgba(255,255,255,.85)" stroke-width="1.1" stroke-linejoin="round"
          style="filter:drop-shadow(0 0 4px rgba(255,224,130,.95))">
      <animate attributeName="opacity" values="1;.3;1;1;.45;1" dur="3.2s" repeatCount="indefinite"/>
    </path>`;

const moon = (p: string): string => `
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

const stars = (): string => {
  const star = (x: number, y: number, r: number, d: number): string =>
    `<path d="M${x} ${y - r * 2.7}L${x + r * 0.75} ${y - r * 0.75}L${x + r * 2.7} ${y}L${
      x + r * 0.75
    } ${y + r * 0.75}L${x} ${y + r * 2.7}L${x - r * 0.75} ${y + r * 0.75}L${x - r * 2.7} ${y}L${
      x - r * 0.75
    } ${y - r * 0.75}Z" fill="#fff">
        <animate attributeName="opacity" values=".2;1;.2" dur="2.9s" begin="${d}s" repeatCount="indefinite"/>
      </path>`;
  return `<g>${star(55, 13, 1.8, 0)}${star(12, 21, 1.3, 0.8)}${star(57, 42, 1.5, 1.5)}${star(
    9,
    45,
    1.1,
    2.2
  )}</g>`;
};

const fogLines = (tone = "#dbe6f5", n = 4): string => {
  let out = `<g stroke="${tone}" stroke-width="4.4" stroke-linecap="round" fill="none">`;
  for (let i = 0; i < n; i++) {
    const y = 40 + i * 6.5,
      inset = i % 2 ? 6 : 0;
    out += `<path d="M${12 + inset} ${y}H${52 - inset}">
        <animate attributeName="opacity" values=".45;1;.45" dur="${(2.4 + i * 0.4).toFixed(
          1
        )}s" repeatCount="indefinite"/>
      </path>`;
  }
  return out + "</g>";
};

const swirls = (tone = "#eaf3ff", w = 3.6): string => `
    <g stroke="${tone}" stroke-width="${w}" stroke-linecap="round" fill="none">
      <path d="M6 24h26a6.5 6.5 0 1 0-6.4-7.6">
        <animate attributeName="stroke-dasharray" values="0 96;66 30;0 96" dur="3.6s" repeatCount="indefinite"/>
      </path>
      <path d="M6 38h34a7.5 7.5 0 1 1-7.4 8.6">
        <animate attributeName="stroke-dasharray" values="66 30;0 96;66 30" dur="3.6s" repeatCount="indefinite"/>
      </path>
      <path d="M10 52h18a5 5 0 1 1-4.8 6.2" opacity=".75"/>
    </g>`;

const spiral = (p: string): string => `
    <g fill="none" stroke-linecap="round" stroke-width="5.4">
      <g>
        <path d="M32 26c6-16 26-13 26 2-6-9-17-6-20 2" stroke="url(#${p}ice)"/>
        <path d="M32 38c-6 16-26 13-26-2 6 9 17 6 20-2" stroke="url(#${p}drop)"/>
        <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32"
          dur="9s" repeatCount="indefinite"/>
      </g>
      <circle cx="32" cy="32" r="4.6" fill="#fff" stroke="none"/>
    </g>`;

const funnel = (p: string): string => `
    <g stroke="url(#${p}cloudStorm)" stroke-width="5" stroke-linecap="round" fill="none">
      <path d="M13 33h38"/>
      <path d="M18 42h28" opacity=".92"/>
      <path d="M23 50h19" opacity=".82"/>
      <path d="M28 58h10" opacity=".7"/>
      <animateTransform attributeName="transform" type="skewX" values="0;5;0;-5;0"
        dur="4.2s" repeatCount="indefinite"/>
    </g>`;

const waves = (p: string): string => `
    <g stroke="url(#${p}heat)" stroke-width="3.6" stroke-linecap="round" fill="none">
      <path d="M12 52q5-6 10 0t10 0 10 0">
        <animate attributeName="opacity" values=".5;1;.5" dur="2.2s" repeatCount="indefinite"/>
      </path>
      <path d="M17 60q5-6 10 0t10 0" opacity=".7">
        <animate attributeName="opacity" values="1;.4;1" dur="2.2s" repeatCount="indefinite"/>
      </path>
    </g>`;

const downArrows = (tone = "#dceaff"): string => `
    <g stroke="${tone}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none">
      ${[16, 32, 48]
        .map(
          (x, i) => `<path d="M${x} 44v13m0 0-4.4-4.4M${x} 57l4.4-4.4">
          <animate attributeName="opacity" values=".35;1;.35" dur="2.4s" begin="${(i * 0.5).toFixed(
            1
          )}s" repeatCount="indefinite"/>
        </path>`
        )
        .join("")}
    </g>`;

const iceShard = (p: string): string => `
    <path d="M45 47l5.5 8-5.5 8-5.5-8Z" fill="url(#${p}ice)" stroke="rgba(255,255,255,.85)" stroke-width="1">
      <animate attributeName="opacity" values="1;.45;1" dur="2.6s" repeatCount="indefinite"/>
    </path>`;

/* ---------------- composed artwork ---------------- */
/**
 * The full 64×64 SVG for one state.
 *
 * Each call gets its own `wx{n}-` defs prefix, so ids are unique per icon.
 */
export function artFor(state: GlassState): string {
  const p = `wx${++uid}-`;
  let body: string;
  switch (state) {
    case "sunny":
      body = sun(p);
      break;
    case "partly":
      body = sun(p) + cloud(p, 9, 13, 0.8);
      break;
    case "cloudy":
      body =
        `<g opacity=".5" transform="translate(-4 4) scale(.72)">${cloud(
          p,
          0,
          0,
          1,
          "cloudDark"
        )}</g>` + cloud(p, 5, 7, 0.95);
      break;
    case "overcast":
      body =
        `<g opacity=".7" transform="translate(4 -3) scale(.82)">${cloud(
          p,
          0,
          0,
          1,
          "cloudDark"
        )}</g>` + cloud(p, -1, 9, 0.96, "cloudStorm");
      break;
    case "fog":
      body = `<g opacity=".5">${cloud(p, 3, -9, 0.9, "cloudDark")}</g>` + fogLines();
      break;
    case "haze":
      body =
        sun(p, true) +
        `<g opacity=".8">${cloud(p, 3, -7, 0.86, "cloudDark")}</g>` +
        fogLines("#e8d4b2", 3);
      break;
    case "drizzle":
      body = cloud(p, 3, -4, 0.92) + dots(p);
      break;
    case "rainy":
      body = cloud(p, 3, 0, 0.94, "cloudDark") + drops(p);
      break;
    case "shower":
      body = sun(p) + cloud(p, 6, -2, 0.9, "cloudDark") + drops(p, [22, 34, 46], 52, 1.7);
      break;
    case "thunder":
      body = cloud(p, 3, -6, 0.94, "cloudDark") + bolt(p);
      break;
    case "sleet":
      body =
        cloud(p, 3, -4, 0.92, "cloudDark") +
        drops(p, [20, 44], 52, 2.2) +
        `<g fill="#fff"><circle cx="32" cy="55" r="3.2"><animate attributeName="cy" values="53;60;53" dur="2.6s" repeatCount="indefinite"/></circle></g>`;
      break;
    case "snowy":
      body = cloud(p, 3, 0, 0.94) + flakes();
      break;
    case "windy":
      body = swirls();
      break;
    case "night":
      body = moon(p) + stars();
      break;

    case "rainstorm":
      body =
        cloud(p, 3, -4, 0.96, "cloudStorm") +
        drops(p, [16, 26, 36, 46], 50, 1.35) +
        drops(p, [21, 31, 41], 56, 1.35);
      break;
    case "blizzard":
      body =
        cloud(p, 3, -6, 0.94, "cloudStorm") +
        flakes([[16, 48, 0], [28, 54, 0.5], [40, 47, 1], [50, 56, 1.5]]) +
        `<g stroke="rgba(255,255,255,.8)" stroke-width="2.6" stroke-linecap="round" fill="none">
             <path d="M5 36h16M42 41h17"><animate attributeName="opacity" values=".3;1;.3" dur="1.8s" repeatCount="indefinite"/></path>
           </g>`;
      break;
    case "hail":
      body = cloud(p, 3, -4, 0.94, "cloudStorm") + pellets(p);
      break;
    case "icyrain":
      body = cloud(p, 3, -4, 0.92, "cloudDark") + drops(p, [20, 32], 52, 2.4) + iceShard(p);
      break;
    case "sandstorm":
      body = `<g opacity=".4">${sun(p, true)}</g>` + swirls("#f2dcb4", 4.4);
      break;
    case "typhoon":
      body = spiral(p);
      break;
    case "tornado":
      body = `<g opacity=".92">${cloud(p, 3, -11, 0.9, "cloudStorm")}</g>` + funnel(p);
      break;
    case "heatwave":
      body = sun(p) + waves(p);
      break;
    case "coldwave":
      body = flakeGlyph(32, 25, 15) + downArrows();
      break;
    default:
      body = sun(p) + cloud(p, 9, 13, 0.8);
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${DEFS(p)}${body}</svg>`;
}

/* ---------------- line icons ---------------- */
/** The 24×24 stroked icons the pill's chrome uses. */
export interface LineIcons {
  readonly pin: string;
  readonly up: string;
  readonly down: string;
  readonly warn: string;
}

/** The design's line-icon table, minus `caret` (this plugin has no city menu). */
export const LINE_ICONS: LineIcons = Object.freeze({
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14m0 0 6-6m-6 6-6-6"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4 22.4 21H1.6Z" fill="currentColor" stroke="rgba(255,255,255,.92)" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9.6v5.2" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.4" fill="#fff"/></svg>`,
});