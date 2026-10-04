/**
 * WeatherWidget 玻璃质感样式表（移植自参考设计稿 widget.css）。
 *
 * 来源：参考设计稿的 widget.css（585 行；设计稿只在本地，未入库）
 * 用途：dsh-glass-weather 客户端挂件（.wx 气象胶囊）的全部样式，由 WIDGET_CSS 导出，
 *       调用方负责把它注入到 <style> 或 CSSStyleSheet 中（本常量不含 <style> 标签）。
 *
 * 移植说明：
 * - 逐条保留：.wx 基础层（--wx-* 变量 / ::before 玻璃底 / ::after 高光与内描边）、
 *   .wx__lens 三件套（光标玻璃镜头）、.wx__fx / .wx__bloom、.wx__icon 与 .wx__halo
 *   （含 sunny/partly/snowy/heatwave 与 night/thunder 覆盖）、.wx__loc、
 *   .wx__primary / .wx__now / .wx__temp / .wx__cond / .wx__hl、.wx__clock / .wx__time、
 *   23 个状态配色覆盖（data-state 选择器）、.wx__warn 四级角标与 wx-pulse、
 *   .wx__bolt 与 wx-bolt / wx-flash、@keyframes wx-spin、
 *   @media (prefers-reduced-motion: reduce) 与 640px 响应式块。
 * - 已删除（本插件不做城市下拉菜单）：下拉菜单容器的全部规则（含 menu / li /
 *   li:hover / li b / 选中态 / 打开态）及其分区注释，定位按钮上的下拉箭头规则，
 *   以及基于 aria-expanded 展开态的箭头旋转规则。
 * - 选择器名与源文件完全一致（.wx / .wx__*），未引入任何模块或依赖。
 * - 用 String.raw 承载，故 CSS 中的反斜杠转义保持字面；源文件不含反引号与模板插值占位符。
 */
export const WIDGET_CSS = String.raw`/* ============================================================
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
`;