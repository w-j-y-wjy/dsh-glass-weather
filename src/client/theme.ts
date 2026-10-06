import { useEffect, useState } from 'react';

/**
 * Which of the shell's two themes the pill should dress for.
 *
 * The stylesheet ported from the reference design is its **light** composition:
 * white sheen and white inner shadows layered over the state tint. On the dark
 * shell that reads as a light chip floating on top of a dark header, so the pill
 * switches to a dark composition (same tint and glow, the whites dropped) when
 * the app itself is dark.
 *
 * Detection deliberately does not guess at how the shell switches themes — an
 * attribute, a class or a media query are all possible. It reads the app's own
 * theme token and measures how bright that colour is; `prefers-color-scheme` is
 * only the fallback for when the token is missing or unreadable.
 */
export type AppTheme = 'light' | 'dark';

/** The token the shell uses for its own base background. */
const BASE_TOKEN = '--dsw-alias-bg-base';

/** Tried in order when the primary token is absent. */
const SECONDARY_TOKENS: readonly string[] = Object.freeze(['--dsw-alias-bg-layer-1', '--dsw-alias-bg-overlay']);

/** Below this relative luminance the shell counts as dark. */
export const DARK_LUMINANCE = 0.5;

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`, comma or space separated. */
function parseColor(input: string): number | undefined {
  const value = input.trim().toLowerCase();
  if (value === '') return undefined;

  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex !== null) {
    const digits = hex[1] ?? '';
    const step = digits.length <= 4 ? 1 : 2;
    if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) return undefined;
    const part = (index: number): number => {
      const slice = digits.slice(index * step, index * step + step);
      const widened = step === 1 ? slice + slice : slice;
      return Number.parseInt(widened, 16) / 255;
    };
    return luminanceOfRgb(part(0), part(1), part(2));
  }

  const fn = /^rgba?\(([^)]+)\)$/.exec(value);
  if (fn !== null) {
    const parts = (fn[1] ?? '').split(/[\s,/]+/).filter((piece) => piece !== '');
    if (parts.length < 3) return undefined;
    const channel = (piece: string): number => {
      const percent = piece.endsWith('%');
      const number = Number.parseFloat(piece);
      if (Number.isNaN(number)) return Number.NaN;
      return percent ? number / 100 : number / 255;
    };
    const [red, green, blue] = [channel(parts[0] ?? ''), channel(parts[1] ?? ''), channel(parts[2] ?? '')];
    if ([red, green, blue].some((entry) => Number.isNaN(entry))) return undefined;
    return luminanceOfRgb(red ?? 0, green ?? 0, blue ?? 0);
  }

  return undefined;
}

/** Rec. 709 luminance of three 0–1 channels. */
function luminanceOfRgb(red: number, green: number, blue: number): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Lets the browser normalise colour syntaxes this module does not parse itself. */
function canvased(input: string): string | undefined {
  try {
    const context = document.createElement('canvas').getContext('2d');
    if (context === null) return undefined;
    context.fillStyle = '#010203';
    context.fillStyle = input;
    const value: unknown = context.fillStyle;
    return typeof value === 'string' ? value : undefined;
  } catch {
    /* no DOM, no canvas: the caller falls back to the media query */
  }
  return undefined;
}

/** 0 (black) … 1 (white), or `undefined` when the colour cannot be read. */
export function luminanceOf(input: string): number | undefined {
  const direct = parseColor(input);
  if (direct !== undefined) return direct;
  const normalized = canvased(input);
  return normalized === undefined || normalized === input ? undefined : parseColor(normalized);
}

/** Where the decision came from, for the settings page's own self-check. */
export interface ThemeDetail {
  readonly theme: AppTheme;
  /** `token` = read from the shell's theme token, `media` = system preference. */
  readonly source: 'token' | 'media' | 'default';
  /** Which element carried the token, e.g. `#root`. */
  readonly probe?: string;
}

/** A short label for a probe element, for the self-check line. */
function labelOf(element: Element): string {
  const id = element.id === '' ? '' : `#${element.id}`;
  return `${element.tagName.toLowerCase()}${id}`;
}

/**
 * The elements probed for the theme token, nearest-last.
 *
 * The token layer can sit on `<html>`, on `<body>` or on the app's own root
 * element, and a declared token is inherited — so this short list keeps the
 * decision independent of where the shell happens to put it. The element the
 * pill itself lives in would be more direct still, but the theme has to be known
 * *before* the first paint, when no such element exists yet.
 */
function probeElements(): Element[] {
  const list: Element[] = [];
  const push = (element: Element | null | undefined): void => {
    if (element !== null && element !== undefined) list.push(element);
  };
  push(document.documentElement);
  push(document.body);
  try {
    if (typeof document.getElementById === 'function') push(document.getElementById('root'));
    if (typeof document.querySelector === 'function') {
      push(document.querySelector('#app, [data-dsh-root], [class*="dsh-root"]'));
    }
    push(document.body?.firstElementChild ?? null);
  } catch {
    /* a stub document: the two document-level probes are enough */
  }
  return list;
}

/** The shell's own base colour, as the browser computes it, plus where it was found. */
function baseColor(): { raw: string; probe: string } | undefined {
  try {
    if (typeof document === 'undefined' || typeof window.getComputedStyle !== 'function') return undefined;
    for (const element of probeElements()) {
      const computed = window.getComputedStyle(element);
      for (const token of [BASE_TOKEN, ...SECONDARY_TOKENS]) {
        const raw = computed.getPropertyValue(token);
        if (typeof raw === 'string' && raw.trim() !== '') return { raw, probe: labelOf(element) };
      }
    }
  } catch {
    /* a shell without the token layer: fall through to the media query */
  }
  return undefined;
}

/** The theme, plus why it was chosen. */
export function readAppThemeDetail(): ThemeDetail {
  const found = baseColor();
  if (found !== undefined) {
    const luminance = luminanceOf(found.raw);
    if (luminance !== undefined) {
      return { theme: luminance < DARK_LUMINANCE ? 'dark' : 'light', source: 'token', probe: found.probe };
    }
  }
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return { theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', source: 'media' };
    }
  } catch {
    /* no media query support */
  }
  return { theme: 'light', source: 'default' };
}

/**
 * The theme to draw for.
 *
 * The token is preferred because it follows the *app's* setting rather than the
 * operating system's; `prefers-color-scheme` only decides when the token layer
 * is absent or its colour cannot be parsed.
 */
export function readAppTheme(): AppTheme {
  return readAppThemeDetail().theme;
}

/**
 * Notices the shell changing theme while the plugin is mounted.
 *
 * Two signals, because either mechanism can be the one the shell uses: a
 * document-level attribute/class flip, and the system preference. The listener
 * only fires on an actual flip.
 */
export function watchAppTheme(listener: (theme: AppTheme) => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  let current = readAppTheme();
  const emit = (): void => {
    const next = readAppTheme();
    if (next === current) return;
    current = next;
    listener(next);
  };

  let observer: MutationObserver | undefined;
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(emit);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-dsw-theme', 'data-mode'],
    });
  }

  let media: MediaQueryList | undefined;
  try {
    media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
    media?.addEventListener('change', emit);
  } catch {
    media = undefined;
  }

  return () => {
    observer?.disconnect();
    try {
      media?.removeEventListener('change', emit);
    } catch {
      /* already gone */
    }
  };
}

/**
 * The current theme, kept up to date for the life of the component.
 *
 * Read once during render so the first paint is already correct, then on every
 * flip the shell announces.
 */
export function useAppTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>(readAppTheme);
  useEffect(() => watchAppTheme(setTheme), []);
  return theme;
}