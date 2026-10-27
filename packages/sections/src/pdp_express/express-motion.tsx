// Express motion: the three looping cues the express layout uses — a soft
// light sweep across the submit, the submit arrow's nudge, and the scroll
// hint's chevron drop. Keyframes ship with the component (React hoists and
// dedupes the <style> by href), so the section carries its own motion
// wherever it renders. Every cycle is a multiple of the brand kit's
// --bk-duration-reveal, so the merchant's motion speed governs it.
//
// The sweep is a primary/surface mix screened over the button: a screen
// blend can only lighten what is under it, so the band reads as light on
// any button — a yellow one with dark text as much as a dark one with white
// text — where a tint of on-primary would darken a light button. The
// surface half gives a bright primary (no headroom left to lighten itself)
// a visible pale band. The submit isolates its stacking context, so the
// blend only ever sees the button's fill.
//
// Reduced motion: the classes only animate under
// `prefers-reduced-motion: no-preference`. The tenant's own "reduce motion"
// switch collapses them to their last frame (globals.css), and every last
// frame is at rest: the sheen off the button, the arrow and chevron home.

const CSS = `
@keyframes bk-xp-sweep {
  0%, 62% { transform: translateX(-160%) skewX(-18deg); }
  100% { transform: translateX(360%) skewX(-18deg); }
}
@keyframes bk-xp-nudge {
  0%, 70%, 86%, 100% { transform: none; }
  78%, 93% { transform: translateX(var(--bk-xp-nudge)); }
}
@keyframes bk-xp-drop {
  0%, 100% { transform: none; opacity: 0.75; }
  50% { transform: translateY(var(--bk-xp-drop)); opacity: 1; }
}
.bk-xp-sheen {
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--bk-primary), var(--bk-surface)), transparent);
  mix-blend-mode: screen;
  transform: translateX(-160%) skewX(-18deg);
}
.bk-xp-nudge { --bk-xp-nudge: 0.25rem; }
.bk-xp-nudge-rtl { --bk-xp-nudge: -0.25rem; }
.bk-xp-drop { --bk-xp-drop: 0.2rem; }
@media (prefers-reduced-motion: no-preference) {
  .bk-xp-sheen {
    animation: bk-xp-sweep calc(var(--bk-duration-reveal) * 6) ease-in-out
      calc(var(--bk-duration-reveal) * 2) infinite both;
  }
  .bk-xp-sheen-rtl { animation-direction: reverse; }
  .bk-xp-nudge, .bk-xp-nudge-rtl {
    animation: bk-xp-nudge calc(var(--bk-duration-reveal) * 6) ease-in-out
      calc(var(--bk-duration-reveal) * 2) infinite;
  }
  .bk-xp-drop {
    animation: bk-xp-drop calc(var(--bk-duration-reveal) * 2) ease-in-out infinite;
  }
}
`;

export function ExpressMotion() {
  return (
    <style href="bk-pdp-express-motion" precedence="bk-sections">
      {CSS}
    </style>
  );
}
