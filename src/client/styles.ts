/**
 * Stylesheet assembly for the glass pill.
 *
 * The design ships as a plain stylesheet (`css.ts`, ported verbatim from the
 * reference). Two things are added here:
 *
 *   1. a namespace rename — the reference prefix `.wx` is generic enough to
 *      collide with another plugin, so every `.wx` selector is rewritten to
 *      `.dshwx` at assembly time (`--wx-*` custom properties and keyframe names
 *      are left alone, which is exactly why the rename is a plain replace);
 *   2. the compact layer the header needs, which the reference does not describe
 *      because it was drawn for a 76px showcase pill rather than a 30px row.
 */
import { WIDGET_CSS } from './widget/css.ts';

/** Prefix the reference design uses. */
const DESIGN_PREFIX = '.wx';
/** Prefix this plugin uses in the DOM. */
export const PILL_PREFIX = '.dshwx';

/**
 * The reference stylesheet under this plugin's own class prefix.
 *
 * `.wx__lens` → `.dshwx__lens`, `.wx[data-state]` → `.dshwx[data-state]`, while
 * `--wx-h`, `wx-spin`, `wx-bolt` and friends are untouched.
 */
export const SCOPED_CSS: string = WIDGET_CSS.replaceAll(DESIGN_PREFIX, PILL_PREFIX);

/**
 * Layers the reference does not cover.
 *
 * `.dshwx--compact` — the same glass pill at header scale, carrying every part
 * of the reading the user switched on.
 */
export const LAYOUT_CSS = `
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

/**
 * The settings panel.
 *
 * Deliberately not the pill's own glass: the panel sits on the app's flat
 * surface, where the pill's white ink and sky tint would look wrong. These are
 * theme-neutral (rgba greys + inherited colour), except the preview stage, which
 * paints the design's own showcase sky so the pill can be judged as designed.
 */
export const SETTINGS_CSS = `
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
  border: 1px solid rgba(127, 127, 127, 0.3);
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.08);
  color: inherit;
  font: inherit;
  font-size: 12px;
}
.dshwx-set select {
  cursor: pointer;
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

/** Everything this plugin puts into the document. */
export const ALL_CSS: string = `${SCOPED_CSS}\n${LAYOUT_CSS}\n${SETTINGS_CSS}`;

/**
 * Insert the stylesheet once and hand back the remover.
 *
 * The element is tagged, so a hot reload or a second mount cannot stack
 * duplicates: an existing tag is reused.
 */
export function installStyles(doc: Document = document): () => void {
  const existing = doc.head.querySelector('style[data-dsh-glass-weather-styles]');
  if (existing !== null) {
    if (existing.textContent !== ALL_CSS) existing.textContent = ALL_CSS;
    return () => undefined;
  }
  const style = doc.createElement('style');
  style.setAttribute('data-dsh-glass-weather-styles', '');
  style.textContent = ALL_CSS;
  doc.head.appendChild(style);
  return () => {
    style.remove();
  };
}