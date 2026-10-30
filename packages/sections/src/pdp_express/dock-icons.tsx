// The dock's line icons, drawn as in the approved mockup (24px grid,
// round caps, currentColor). The arrow and the chevron point the way the
// reading goes: left in Arabic and Kurdish, right in English.

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** «ثبّت طلبي»'s arrow, inside the espresso disc. */
export function DockArrowIcon({ rtl, className }: { rtl: boolean; className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2.1} className={className}>
      <path d={rtl ? "M19 12H5.5M11 6l-6 6 6 6" : "M5 12h13.5M13 6l6 6-6 6"} />
    </svg>
  );
}

/** A shopping bag with a plus: «أضف للسلة». */
export function DockBagIcon({ className }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={1.7} className={className}>
      <path d="M5.6 8.4h12.8l-.9 11.1a1.9 1.9 0 0 1-1.9 1.7H8.4a1.9 1.9 0 0 1-1.9-1.7z" />
      <path d="M9 8.4V7a3 3 0 0 1 6 0v1.4" />
      <path d="M12 12.4v4.8M9.6 14.8h4.8" />
    </svg>
  );
}

/** The drawer's check: the add went through. */
export function DockCheckIcon({ className }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.2 12.3l2.6 2.6 5-5.2" />
    </svg>
  );
}

/** «شوف السلة»'s chevron. */
export function DockChevronIcon({ rtl, className }: { rtl: boolean; className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d={rtl ? "M14.5 6.5L9 12l5.5 5.5" : "M9.5 6.5L15 12l-5.5 5.5"} />
    </svg>
  );
}
