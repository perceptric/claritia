// Tia, Claritia's mascot (docs/brand.md): a small dark face with the mark's corner bracket in emerald. Tia is who
// people chat with in Form Studio. The drawing is one SVG for plain DOM (the studio) and React (Tia.tsx); its colors
// come from the app's tokens, so it follows light and dark. `working` blinks the eyes and pulses the bracket.

export const TIA_STYLE = `.tia{flex:none;overflow:visible}.tia .tb{fill:var(--tia-ink,var(--color-ink))}.tia .te{fill:var(--tia-face,var(--color-card))}.tia .tp{fill:var(--tia-ink,var(--color-ink))}.tia .ts{fill:none;stroke:var(--tia-face,var(--color-card));stroke-width:1.6;stroke-linecap:round}.tia .tc{fill:none;stroke:var(--tia-signal,var(--color-signal));stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.tia.working .te,.tia.working .tp{transform-box:fill-box;transform-origin:center;animation:tia-blink 2.4s var(--ease-out,ease) infinite}.tia.working .tc{animation:tia-pulse 1.6s ease-in-out infinite}
@keyframes tia-blink{0%,42%,50%,100%{transform:scaleY(1)}46%{transform:scaleY(.1)}}@keyframes tia-pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.tia.working .te,.tia.working .tp,.tia.working .tc{animation:none}}`;

export function tiaSvg(size = 20, working = false): string {
  return `<svg class="tia${working ? " working" : ""}" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect class="tb" x="4" y="5" width="24" height="22" rx="8"/><ellipse class="te" cx="12.5" cy="15" rx="2.7" ry="3.3"/><ellipse class="te" cx="19.5" cy="15" rx="2.7" ry="3.3"/><circle class="tp" cx="13.1" cy="15.7" r="1.4"/><circle class="tp" cx="20.1" cy="15.7" r="1.4"/><path class="ts" d="M13.2 21.2q2.8 2.1 5.6 0"/><path class="tc" d="M2.5 10V3.5H9"/><path class="tc" d="M29.5 22v6.5H23"/></svg>`;
}
