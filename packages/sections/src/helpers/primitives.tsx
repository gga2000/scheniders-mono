"use client";

import Image from "next/image";
import { cn } from "./utils";
import type {
  CSSProperties,
  ReactNode,
  HTMLAttributes,
  ButtonHTMLAttributes,
  AnchorHTMLAttributes,
} from "react";

/* ============================================================
   Schneiders — Candy Bento primitives
   Chunky black borders, hard offset shadows, rotated stickers.
   Reused across every section so the design stays pixel-locked.

   IMPORTANT: this file is the single visual-language anchor for
   every section. It now consumes the `--bk-*` brand-kit CSS
   variables emitted by `buildBrandKitVars()` in
   `packages/shared/src/brand-kit-vars.ts`, with the Candy Bento
   hex palette as the fallback. That means:

     - When a tenant has a brand kit configured, the primitives
       automatically inherit its primary / accent / ink / radius /
       border / shadow tokens.
     - When no brand kit is set (e.g. the section preview in the
       editor), the Candy Bento palette still shows through.

   We deliberately keep the `bg-candy-*` Tailwind classes on the
   pastel surfaces so the existing smoke tests (which assert on
   class names) still pass. Layered on top, inline styles bind the
   shape + ink + interactive accents to brand-kit vars.
   ============================================================ */

type ScribbleColor = "butter" | "mint" | "lilac" | "sky" | "pink";

const SCRIBBLE_HEX: Record<ScribbleColor, string> = {
  butter: "var(--bk-accent, #ffd84a)",
  // The three decorative surfaces. Key names are historical (they are also
  // schema enum values, so renaming them would fail Zod parse and silently
  // drop the section); the VALUES now track the tenant's accent hue via
  // --bk-decor-*, which is what "decorative" was always supposed to mean.
  mint: "var(--bk-decor-a, #7cf0bd)",
  lilac: "var(--bk-decor-b, #c5b6ff)",
  sky: "var(--bk-decor-c, #9ad8ff)",
  pink: "var(--bk-primary, #ff5a8a)",
};

export function ScribbleHeading({
  children,
  color = "butter",
  as: As = "h2",
  className,
}: {
  children: ReactNode;
  color?: ScribbleColor;
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <As
      className={cn(
        "font-display font-black tracking-tight inline-block scribble-underline",
        As === "h1" && "text-4xl sm:text-5xl",
        As === "h2" && "text-3xl",
        As === "h3" && "text-xl",
        className,
      )}
      style={
        {
          ["--scribble-color" as string]: SCRIBBLE_HEX[color],
          color: "var(--bk-ink, #1a1a1a)",
          fontFamily: "var(--bk-font-display, inherit)",
        } as CSSProperties
      }
    >
      {children}
    </As>
  );
}

export function PromoBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-candy-butter text-candy-ink font-label font-bold text-xs sm:text-sm py-2 px-4 text-center overflow-hidden relative z-20",
        className,
      )}
      style={{
        backgroundColor: "var(--bk-accent, #ffd84a)",
        color: "var(--bk-ink, #1a1a1a)",
        borderBottom:
          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
      }}
    >
      <div className="whitespace-nowrap animate-marquee inline-block">
        {children}
        <span className="inline-block w-8" />
        {children}
      </div>
    </div>
  );
}

export function ZigzagDivider({ className }: { className?: string }) {
  return <div className={cn("zigzag-border", className)} aria-hidden="true" />;
}

type CardBg =
  | "white"
  | "cream"
  | "pink"
  | "mint"
  | "butter"
  | "lilac"
  | "sky"
  | "ink"
  /** The brand's success green — WhatsApp / positive CTAs. Distinct from
   *  "mint", which is a FIXED decorative candy pastel a tenant cannot
   *  recolour. */
  | "success"
  /** Resolves to the tenant's chosen primary accent (via --schn-accent-primary CSS var). */
  | "accent-primary"
  /** Resolves to the tenant's chosen secondary accent (via --schn-accent-secondary). */
  | "accent-secondary";

/**
 * BG class mapping — kept as Tailwind class names so existing
 * smoke tests that assert on class strings still pass. Where the
 * candy palette has a brand-kit equivalent we ALSO layer in an
 * inline `backgroundColor: var(--bk-*)` via `BG_VAR` below so the
 * brand kit wins at runtime.
 */
const BG_MAP: Record<CardBg, string> = {
  white: "bg-white",
  cream: "bg-candy-cream",
  pink: "bg-candy-pink text-white",
  mint: "bg-candy-mint",
  butter: "bg-candy-butter",
  lilac: "bg-candy-lilac",
  sky: "bg-candy-sky",
  ink: "bg-candy-ink text-white",
  success: "",
  "accent-primary":
    "bg-[var(--schn-accent-primary)] text-[var(--schn-accent-primary-on)]",
  "accent-secondary": "bg-[var(--schn-accent-secondary)] text-candy-ink",
};

/** Brand-kit CSS variable override per surface tint. `undefined` means
 *  "no override — the Tailwind candy class wins". */
const BG_VAR: Partial<Record<CardBg, { bg: string; fg?: string }>> = {
  // White surfaces must pin their foreground to ink. Without this, a
  // `bg="white"` button/card inherits its parent's text colour — on a dark
  // hero overlay (text = #fff) that yields white-on-white (invisible). See
  // the hero secondary WhatsApp CTA.
  white: { bg: "#ffffff", fg: "var(--bk-ink, #1a1a1a)" },
  pink: { bg: "var(--bk-primary, #ff5a8a)", fg: "var(--bk-on-primary, #fff)" },
  // Decorative surfaces — see SCRIBBLE_HEX. `on-decor` rather than `ink`
  // because all three share one lightness band, so the correct foreground is
  // a property of the band, not of the tenant's ink (which is light in a
  // dark-surface store and was unreadable here).
  mint: { bg: "var(--bk-decor-a, #7cf0bd)", fg: "var(--bk-on-decor, #1a1a1a)" },
  butter: { bg: "var(--bk-accent, #ffd84a)", fg: "var(--bk-ink, #1a1a1a)" },
  lilac: { bg: "var(--bk-decor-b, #c5b6ff)", fg: "var(--bk-on-decor, #1a1a1a)" },
  sky: { bg: "var(--bk-decor-c, #9ad8ff)", fg: "var(--bk-on-decor, #1a1a1a)" },
  cream: { bg: "var(--bk-surface, #fff7ed)", fg: "var(--bk-ink, #1a1a1a)" },
  ink: { bg: "var(--bk-ink, #1a1a1a)", fg: "#fff" },
  success: {
    bg: "var(--bk-success, #25d366)",
    fg: "var(--bk-on-primary, #1a1a1a)",
  },
};

function surfaceStyle(bg: CardBg, base?: CSSProperties): CSSProperties {
  const override = BG_VAR[bg];
  return {
    ...(override
      ? { backgroundColor: override.bg, color: override.fg }
      : undefined),
    ...base,
  };
}

/** Shared "chunky bordered card" inline style. */
function chunkyShellStyle(size: "sm" | "md" | "lg"): CSSProperties {
  const shadow =
    size === "sm"
      ? "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)"
      : size === "lg"
        ? "var(--bk-shadow-card, 6px 6px 0px 0px #1a1a1a)"
        : "var(--bk-shadow-card, 4px 4px 0px 0px #1a1a1a)";
  return {
    border:
      "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
    borderRadius: "var(--bk-radius-card, 1rem)",
    boxShadow: shadow,
  };
}

export function BentoCard({
  children,
  bg = "white",
  size = "md",
  rotate = 0,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  bg?: CardBg;
  size?: "sm" | "md" | "lg";
  rotate?: number;
}) {
  const sizeClass =
    size === "sm" ? "bento-card-sm" : size === "lg" ? "bento-card-lg" : "bento-card";
  const merged: CSSProperties = {
    ...chunkyShellStyle(size),
    ...surfaceStyle(bg),
    ...(rotate ? { transform: `rotate(${rotate}deg)` } : undefined),
    ...(style ?? {}),
  };
  return (
    <div
      className={cn(sizeClass, BG_MAP[bg], "relative", className)}
      style={merged}
      {...props}
    >
      {children}
    </div>
  );
}

export function Sticker({
  children,
  bg = "pink",
  rotate = -6,
  size = "sm",
  className,
}: {
  children: ReactNode;
  bg?: CardBg;
  rotate?: number;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const sizeClass =
    size === "xs"
      ? "text-[10px] px-2 py-0.5"
      : size === "md"
        ? "text-sm px-3 py-1.5"
        : "text-xs px-3 py-1";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-display font-black bk-caps whitespace-nowrap",
        BG_MAP[bg],
        sizeClass,
        className,
      )}
      style={{
        ...surfaceStyle(bg),
        transform: `rotate(${rotate}deg)`,
        borderRadius: "calc(var(--bk-radius-card, 0.5rem) * 0.5)",
        border:
          "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
        boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
        fontFamily: "var(--bk-font-display, inherit)",
      }}
    >
      {children}
    </span>
  );
}

type ChunkyButtonProps = {
  children: ReactNode;
  bg?: CardBg;
  size?: "sm" | "md" | "lg";
  className?: string;
  fullWidth?: boolean;
};

const BTN_SIZE: Record<NonNullable<ChunkyButtonProps["size"]>, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-3 text-base",
  lg: "px-6 py-4 text-lg",
};

/** Explicit transition list (never `transition-all`), OS reduced-motion
 *  respected, and `bk-caps` instead of `uppercase` so calm brand kits
 *  (`data-bk-expressive="false"`) get sentence-case CTAs. */
const baseBtn =
  "inline-flex items-center justify-center gap-2 font-display font-black bk-caps tracking-tight " +
  "hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] " +
  "transition-[transform,box-shadow,background-color,color,opacity] duration-150 motion-reduce:transition-none";

function buttonStyle(bg: CardBg): CSSProperties {
  return {
    ...surfaceStyle(bg),
    border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
    borderRadius: "var(--bk-radius-input, 0.75rem)",
    boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
    fontFamily: "var(--bk-font-display, inherit)",
  };
}

export function ChunkyButton({
  children,
  bg = "pink",
  size = "md",
  className,
  fullWidth,
  style,
  ...props
}: ChunkyButtonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(baseBtn, BG_MAP[bg], BTN_SIZE[size], fullWidth && "w-full", className)}
      style={{ ...buttonStyle(bg), ...(style ?? {}) }}
      {...props}
    >
      {children}
    </button>
  );
}

export function ChunkyLink({
  children,
  bg = "pink",
  size = "md",
  className,
  fullWidth,
  style,
  ...props
}: ChunkyButtonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cn(baseBtn, BG_MAP[bg], BTN_SIZE[size], fullWidth && "w-full", className)}
      style={{ ...buttonStyle(bg), ...(style ?? {}) }}
      {...props}
    >
      {children}
    </a>
  );
}

export function TrustPill({
  icon,
  children,
  bg = "mint",
  rotate = 0,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  bg?: CardBg;
  rotate?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-label font-bold text-xs sm:text-sm bk-caps whitespace-nowrap px-4 py-2 shrink-0",
        BG_MAP[bg],
        className,
      )}
      style={{
        ...surfaceStyle(bg),
        transform: `rotate(${rotate}deg)`,
        border: "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
        borderRadius: "var(--bk-radius-pill, 1rem)",
        boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
      }}
    >
      {icon}
      {children}
    </span>
  );
}

/**
 * Glorified Cash-on-Delivery card — the recurring butter hero that sells COD
 * as a feature (24h delivery + pay-cash + inspect-before-paying), used on the
 * PDP, checkout, thank-you, and tracking screens. Self-contained i18n so any
 * surface can drop it in. Copy is overridable for page-specific phrasing.
 */
export function CodCard({
  locale = "en",
  rotate = 1,
  showInspect = true,
  className,
}: {
  locale?: "ar" | "en" | "ku";
  rotate?: number;
  showInspect?: boolean;
  className?: string;
}) {
  const t = locale !== "en";
  const Row = ({ icon, title, sub }: { icon: string; title: string; sub: string }) => (
    <div className="flex items-start gap-3">
      <MaterialIcon
        name={icon}
        className="text-2xl shrink-0"
      />
      <div className="min-w-0">
        <p className="font-display font-black bk-caps text-sm leading-tight">
          {title}
        </p>
        <p className="font-body text-xs leading-snug" style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))" }}>
          {sub}
        </p>
      </div>
    </div>
  );
  return (
    <BentoCard
      bg="butter"
      size="md"
      rotate={rotate}
      className={cn("p-bk-md sm:p-bk-lg space-y-bk-sm", className)}
    >
      <Row
        icon="local_shipping"
        title={t ? "التوصيل خلال ٢٤ ساعة" : "Delivered in 24h"}
        sub={t ? "إلى بغداد والمحافظات الرئيسية" : "To Baghdad & major cities"}
      />
      <Row
        icon="payments"
        title={t ? "الدفع عند الاستلام" : "Pay cash on delivery"}
        sub={t ? "آمن ١٠٠٪، بدون رسوم خفية" : "100% secure, no hidden fees"}
      />
      {showInspect && (
        <TrustPill
          bg="white"
          rotate={-2}
          icon={<MaterialIcon name="visibility" className="text-base" />}
        >
          {t ? "افحص قبل الدفع" : "Inspect before paying"}
        </TrustPill>
      )}
    </BentoCard>
  );
}

export function MaterialIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span className={cn("material-symbols-outlined", className)} aria-hidden="true">
      {name}
    </span>
  );
}

/* WhatsApp glyph — used in CTAs across the site */
export function WhatsAppIcon({
  className,
  shadow = true,
  style,
}: {
  className?: string;
  /** The Candy Bento hard drop shadow. Off inside the token-driven
   *  `WhatsAppButton`. */
  shadow?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      className={cn(shadow && "drop-shadow-[1px_1px_0px_#1a1a1a]", className)}
      style={style}
      aria-hidden="true"
    >
      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm.029 18.88c-1.161 0-2.305-.292-3.318-.844l-3.677.964.984-3.595c-.607-1.052-.927-2.246-.926-3.468.001-3.825 3.113-6.937 6.937-6.937 3.825.001 6.938 3.113 6.938 6.938-.001 3.825-3.113 6.938-6.938 6.938z" />
    </svg>
  );
}

/**
 * Shared logo / wordmark lockup used by the global site header and footer.
 *
 * - When `logoUrl` is set, renders the tenant logo via `next/image`
 *   (`unoptimized` — tenant logos live on arbitrary hosts not in the
 *   storefront image allowlist) sized per `size` (sm ≈ 28px, md ≈ 36px).
 * - When not, renders the rotated-square placeholder + the wordmark text
 *   (`font-display font-black`). The square fill is bound to `--bk-primary`;
 *   its border and the wordmark colour are bound to the local `--bm-ink`
 *   / `--bm-mark-border` vars, which default to `--bk-ink`. A caller on a
 *   dark surface (the footer) can override those via `className` arbitrary
 *   properties — e.g. `[--bm-ink:#fff] [--bm-mark-border:#fff]` — to keep
 *   the lockup legible without changing the API. This preserves the
 *   footer's original white wordmark + white square border on dark ink.
 */
export function BrandMark({
  logoUrl,
  name,
  size = "md",
  variant = "plain",
  className,
}: {
  logoUrl?: string | null;
  name: string;
  size?: "sm" | "md";
  /** "pill" wraps the wordmark in a tilted butter chip (the Stitch header
   *  logo lockup); "plain" is the rotated-square + wordmark used in the
   *  footer / inline contexts. */
  variant?: "plain" | "pill";
  className?: string;
}) {
  if (logoUrl) {
    const px = size === "sm" ? 28 : 36;
    return (
      <Image
        src={logoUrl}
        alt={name}
        width={px}
        height={px}
        unoptimized
        sizes={`${px}px`}
        className={cn("w-auto object-contain", size === "sm" ? "h-7" : "h-9", className)}
      />
    );
  }

  // Butter "logo chip" lockup — the storefront header identity.
  if (variant === "pill") {
    return (
      <span
        className={cn(
          "inline-flex items-center -rotate-2 px-3 py-1 font-display font-black bk-caps tracking-tight truncate",
          size === "sm" ? "text-lg" : "text-xl sm:text-2xl",
          className,
        )}
        style={{
          backgroundColor: "var(--bk-accent, #ffd84a)",
          color: "var(--bk-ink, #1a1a1a)",
          border:
            "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
          borderRadius: "var(--bk-radius-input, 0.75rem)",
          boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
          fontFamily: "var(--bk-font-display, inherit)",
        }}
      >
        {name}
      </span>
    );
  }

  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 shrink-0 -rotate-6"
        style={{
          backgroundColor: "var(--bk-primary, #ff5a8a)",
          border:
            "var(--bk-border-thickness, 3px) solid var(--bm-mark-border, var(--bk-ink, #1a1a1a))",
          borderRadius: "calc(var(--bk-radius-card, 0.5rem) * 0.35)",
        }}
      />
      <span
        className={cn(
          "font-display font-black bk-caps tracking-tight truncate",
          size === "sm" ? "text-xl" : "text-lg sm:text-xl",
        )}
        style={{
          color: "var(--bm-ink, var(--bk-ink, #1a1a1a))",
          fontFamily: "var(--bk-font-display, inherit)",
        }}
      >
        {name}
      </span>
    </span>
  );
}

type SectionDensity = "default" | "dense" | "generous";

const SECTION_PY: Record<SectionDensity, string> = {
  default: "py-bk-section",
  dense: "py-bk-section-dense",
  generous: "py-bk-section-generous",
};

/**
 * Shared section shell. Owns horizontal padding and vertical rhythm (density)
 * so individual sections stop reinventing `<section className="px-4 py-8">`.
 * Vertical rhythm uses the fluid `--bk-section-y*` tokens; `density` picks the
 * step. `bleed` drops horizontal padding for full-width heroes/marquees.
 * Spreads `...props` so the editor overlay's `data-*` and handlers pass through.
 */
export function Section({
  children,
  density = "default",
  bleed = false,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  density?: SectionDensity;
  bleed?: boolean;
}) {
  return (
    <section
      className={cn(!bleed && "px-4", SECTION_PY[density], className)}
      {...props}
    >
      {children}
    </section>
  );
}

/**
 * Standard section heading row: scribble heading + optional subtitle, with
 * consistent bottom rhythm. Use at the top of content sections instead of a
 * bare `<ScribbleHeading>` so heading spacing stays uniform site-wide.
 */
export function SectionHeader({
  title,
  subtitle,
  color = "butter",
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  color?: ScribbleColor;
  className?: string;
}) {
  return (
    <div className={cn("mb-bk-lg", className)}>
      <ScribbleHeading color={color}>{title}</ScribbleHeading>
      {subtitle ? (
        <p
          className="mt-bk-xs font-body text-base"
          style={{ color: "var(--bk-ink-soft, rgb(26 26 26 / 0.6))" }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function SectionEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "font-label font-bold text-[11px] bk-caps tracking-[0.25em]",
        className,
      )}
      style={{
        color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
        fontFamily: "var(--bk-font-body, inherit)",
      }}
    >
      {children}
    </p>
  );
}

/* ============================================================
   Token-driven primitives (signature / calm kits)
   These carry no Candy chrome: every colour, radius and shadow
   comes from --bk-*, so any brand kit renders them as its own.
   ============================================================ */

/** Small tinted pill above a section title ("الفئات", "ضمانات"). One
 *  implementation replaces the six near-copies the sections used to carry
 *  (three chip fills, two radius sources, two sparkle glyphs). */
export function EyebrowChip({
  children,
  glyph = "none",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  glyph?: "none" | "sparkle";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 font-label text-xs font-bold leading-none",
        className,
      )}
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--bk-accent, #ffd84a) 16%, transparent)",
        color: "var(--bk-ink, #1a1a1a)",
        borderRadius: "var(--bk-radius-pill, 9999px)",
        fontFamily: "var(--bk-font-body, inherit)",
      }}
      {...props}
    >
      {glyph === "sparkle" && (
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="var(--bk-accent, #ffd84a)"
          aria-hidden="true"
        >
          <path d="M8 0l1.8 5.2L15 7l-5.2 1.8L8 14l-1.8-5.2L1 7l5.2-1.8z" />
        </svg>
      )}
      {children}
    </span>
  );
}

/**
 * Section heading lockup: eyebrow chip → title → optional subtitle. Uses the
 * fluid `--bk-text-h*` scale and `text-balance`, so every section on a page
 * shares one rhythm instead of ad-hoc `text-3xl sm:text-5xl`.
 */
export function CenteredSectionHeader({
  eyebrow,
  title,
  subtitle,
  as: As = "h2",
  align = "center",
  glyph = "none",
  eyebrowField,
  titleField,
  subtitleField,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  as?: "h1" | "h2";
  align?: "center" | "start";
  glyph?: "none" | "sparkle";
  /** `data-i18n-field` hooks for the editor's inline text editing. */
  eyebrowField?: string;
  titleField?: string;
  subtitleField?: string;
  className?: string;
}) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "mb-bk-lg flex flex-col gap-bk-xs",
        centered ? "items-center text-center" : "items-start text-start",
        className,
      )}
    >
      {eyebrow ? (
        <EyebrowChip glyph={glyph} data-i18n-field={eyebrowField}>
          {eyebrow}
        </EyebrowChip>
      ) : null}
      <As
        data-i18n-field={titleField}
        className={cn(
          "font-display font-black text-balance",
          As === "h1" ? "text-bk-h1" : "text-bk-h2",
        )}
        style={{
          color: "var(--bk-ink, #1a1a1a)",
          fontFamily: "var(--bk-font-display, inherit)",
        }}
      >
        {title}
      </As>
      {subtitle ? (
        <p
          data-i18n-field={subtitleField}
          className={cn(
            "max-w-prose font-body text-base text-pretty",
            centered && "mx-auto",
          )}
          style={{
            color: "var(--bk-ink-soft, rgb(26 26 26 / 0.7))",
            fontFamily: "var(--bk-font-body, inherit)",
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Five-star rating glyph row. One implementation for every rating surface
 * (rating chip, review cards, product cards) — previously `★` text glyphs,
 * Material `star` ligatures and two hand-rolled loops disagreed on shape,
 * size and colour. Filled stars use `--bk-accent`, empty use `--bk-ink-faint`.
 */
export function Stars({
  value,
  max = 5,
  size = 16,
  label,
  className,
}: {
  /** Rating 0..max; rounded to the nearest whole star. */
  value: number;
  max?: number;
  /** Glyph size in px. */
  size?: number;
  /** Accessible label; defaults to "{value} / {max}". */
  label?: string;
  className?: string;
}) {
  const filled = Math.min(max, Math.max(0, Math.round(value)));
  return (
    <span
      role="img"
      aria-label={label ?? `${value} / ${max}`}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {Array.from({ length: max }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          width={size}
          height={size}
          aria-hidden="true"
          fill={
            i < filled
              ? "var(--bk-accent, #ffd84a)"
              : "var(--bk-ink-faint, rgb(26 26 26 / 0.25))"
          }
        >
          <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L10 14.9l-5.3 2.8 1.1-5.9L1.5 7.7l5.9-.8z" />
        </svg>
      ))}
    </span>
  );
}

/**
 * The one WhatsApp call-to-action. `outline` (default) is a surface pill with
 * an ink border and the glyph in `--bk-success`; `solid` fills with
 * `--bk-success`. Replaces the mint Candy button in faq_contact_split and the
 * plain white button in hero_card_float — two styles, neither branded.
 */
export function WhatsAppButton({
  href,
  children,
  tone = "outline",
  size = "md",
  fullWidth,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  tone?: "outline" | "solid";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
}) {
  const solid = tone === "solid";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center gap-2 font-display font-bold",
        "transition-[transform,box-shadow,background-color,opacity] duration-150 motion-reduce:transition-none",
        "hover:opacity-90 active:scale-[0.98]",
        BTN_SIZE[size],
        fullWidth && "w-full",
        className,
      )}
      style={{
        backgroundColor: solid
          ? "var(--bk-success, #7cf0bd)"
          : "var(--bk-surface, #ffffff)",
        color: "var(--bk-ink, #1a1a1a)",
        border: `var(--bk-border-thickness, 3px) solid ${
          solid ? "var(--bk-success, #7cf0bd)" : "var(--bk-ink, #1a1a1a)"
        }`,
        borderRadius: "var(--bk-radius-pill, 9999px)",
        boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
        fontFamily: "var(--bk-font-display, inherit)",
      }}
      {...props}
    >
      <WhatsAppIcon
        shadow={false}
        className="h-5 w-5"
        // Glyph carries the WhatsApp affordance colour on the outline tone.
        {...(solid ? {} : { style: { color: "var(--bk-success, #25d366)" } })}
      />
      {children}
    </a>
  );
}
