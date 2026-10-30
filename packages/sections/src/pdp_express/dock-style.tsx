// Express dock styles (`cta_layout: "dock"`, slice 1i): what the capsule's
// utilities cannot say on their own — the layered shadows, the physical
// press (the yellow pill sinks a little and darkens toward amber while its
// arrow steps forward; a cream segment shows a light shade), the hairline
// between the two segments, the badge's ring, the colour mixes on the
// espresso surface, and the confirmation drawer sliding out from under the
// capsule. It ships with the dock as ExpressMotion ships its keyframes
// (React hoists and dedupes the <style> by href), so only a dock page
// carries it. Its own precedence keeps it a separate <style>, so the
// motion sheet every express page carries stays byte-identical. Every colour is a --bk-* token or a mix of two. Durations
// are the brand kit's, so the merchant's motion speed governs them.
//
// Reduced motion: nothing moves. The press keeps its shade but not its
// scale or step, and the drawer simply appears.

const EASE = "cubic-bezier(.22,1,.36,1)";

const CSS = `
.bk-xp-dock {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--bk-surface) 13%, transparent),
    0 1px 2px color-mix(in srgb, var(--bk-secondary) 28%, transparent),
    0 16px 30px -18px color-mix(in srgb, var(--bk-secondary) 85%, transparent);
}
.bk-xp-dock-order {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--bk-surface) 62%, transparent),
    inset 0 -2px 0 color-mix(in srgb, var(--bk-accent) 55%, transparent),
    0 0 0 1px color-mix(in srgb, var(--bk-primary) 40%, transparent);
  transition:
    transform var(--bk-duration-fast) ${EASE},
    background-color var(--bk-duration-fast) ${EASE},
    box-shadow var(--bk-duration-fast) ${EASE};
}
.bk-xp-dock-order:disabled { box-shadow: none; }
.bk-xp-dock-order:not(:disabled):active {
  transform: scale(0.975);
  background-color: color-mix(in srgb, var(--bk-primary) 84%, var(--bk-accent));
  box-shadow: inset 0 2px 5px color-mix(in srgb, var(--bk-secondary) 22%, transparent);
}
.bk-xp-dock-disc { transition: transform var(--bk-duration-fast) ${EASE}; }
.bk-xp-dock-order:not(:disabled):active .bk-xp-dock-disc { transform: translateX(3px); }
.bk-xp-dock-rtl:not(:disabled):active .bk-xp-dock-disc { transform: translateX(-3px); }
.bk-xp-dock-seg {
  color: color-mix(in srgb, var(--bk-surface) 82%, var(--bk-secondary));
  transition:
    background-color var(--bk-duration-fast) ${EASE},
    transform var(--bk-duration-fast) ${EASE};
}
.bk-xp-dock-seg + .bk-xp-dock-seg::before {
  content: "";
  position: absolute;
  left: -2px;
  top: 16px;
  bottom: 16px;
  width: 1px;
  background: color-mix(in srgb, var(--bk-surface) 15%, transparent);
}
@media (hover: hover) {
  .bk-xp-dock-seg:not(:disabled):hover {
    background-color: color-mix(in srgb, var(--bk-surface) 6%, transparent);
  }
}
.bk-xp-dock-seg:not(:disabled):active {
  background-color: color-mix(in srgb, var(--bk-surface) 11%, transparent);
  transform: scale(0.95);
}
.bk-xp-dock-wa { color: color-mix(in srgb, var(--bk-success) 78%, var(--bk-surface)); }
.bk-xp-dock-badge { box-shadow: 0 0 0 2px var(--bk-secondary); }
.bk-xp-dock-drawer {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transform: translateY(-6px);
  pointer-events: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bk-ink) 12%, transparent);
  transition:
    grid-template-rows var(--bk-duration-base) ${EASE},
    opacity var(--bk-duration-base) ${EASE},
    transform var(--bk-duration-base) ${EASE};
}
.bk-xp-dock-drawer[data-open] {
  grid-template-rows: 1fr;
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.bk-xp-dock-ok { color: color-mix(in srgb, var(--bk-success) 72%, var(--bk-secondary)); }
.bk-xp-dock-go { transition: background-color var(--bk-duration-fast) ${EASE}; }
.bk-xp-dock-go:active { background-color: color-mix(in srgb, var(--bk-ink) 7%, transparent); }
@media (prefers-reduced-motion: reduce) {
  .bk-xp-dock-order, .bk-xp-dock-disc, .bk-xp-dock-seg, .bk-xp-dock-drawer, .bk-xp-dock-go {
    transition: none;
  }
  .bk-xp-dock-order:not(:disabled):active,
  .bk-xp-dock-seg:not(:disabled):active,
  .bk-xp-dock-order:not(:disabled):active .bk-xp-dock-disc,
  .bk-xp-dock-drawer {
    transform: none;
  }
}
`;

/** A cream icon-over-label segment of the capsule (cart, WhatsApp). */
export const DOCK_SEGMENT =
  "bk-xp-dock-seg relative flex shrink-0 flex-col items-center justify-center gap-[5px] rounded-[28px] px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bk-focus";

/** A segment's label: 12px bold, wrapping (never overflowing) when long. */
export const DOCK_LABEL = "text-center font-bk-body text-xs font-bold leading-tight";

export function DockStyle() {
  return (
    <style href="bk-pdp-express-dock" precedence="bk-sections-dock">
      {CSS}
    </style>
  );
}
