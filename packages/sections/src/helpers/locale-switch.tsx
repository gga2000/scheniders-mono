// =====================================================================
// Locale switch — the storefront language control (P1-6)
// =====================================================================
// Used to be a floating bottom-left pill mounted by the tenant layout,
// where it overlapped the PDP sticky CTA bar. It now lives inside the
// global header: a segmented control in the desktop pill and a row in the
// mobile menu sheet. Both render this one component; the cookie-persist +
// reload behaviour (the server re-renders in the chosen locale — see
// resolveVisitorLocale) stays exactly as it was. LTR-only: no `dir` flip.
// =====================================================================

"use client";

import { useState } from "react";
import { LOCALE_COOKIE } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";
import { cn } from "./utils";
import { chromeString } from "./chrome-strings";

/** Native-name labels — each language shown in its own script. */
export const LOCALE_LABELS: Record<LocaleCode, string> = {
  ar: "العربية",
  en: "English",
  ku: "کوردی",
};

const LOCALE_CODES: readonly LocaleCode[] = ["ar", "en", "ku"];

function isLocaleCode(v: unknown): v is LocaleCode {
  return (
    typeof v === "string" && (LOCALE_CODES as readonly string[]).includes(v)
  );
}

/**
 * The store's enabled locales as the header sees them. Sections are typed
 * against `BaseTenant` (no `store_config_v2`), while the storefront hands the
 * full tenant row into the render ctx — so this narrows the untyped field
 * defensively (same pattern as `resolveTenantPhone`). Unknown shapes yield
 * an empty list, which renders no switcher.
 */
export function readEnabledLocales(tenant: unknown): LocaleCode[] {
  if (!tenant || typeof tenant !== "object") return [];
  const cfg = (tenant as { store_config_v2?: unknown }).store_config_v2;
  if (!cfg || typeof cfg !== "object") return [];
  const raw = (cfg as { enabled_locales?: unknown }).enabled_locales;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isLocaleCode))];
}

/** Persist the locale choice — one year, lax. Module-level so the React
 *  Compiler doesn't treat the `document.cookie` write as a render mutation. */
export function persistLocale(loc: LocaleCode): void {
  document.cookie = `${LOCALE_COOKIE}=${loc}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Persist and reload so the server re-renders every section in `loc`. */
export function switchLocale(loc: LocaleCode): void {
  persistLocale(loc);
  window.location.reload();
}

/**
 * Segmented "العربية | English" control. `variant="pill"` is the compact
 * desktop lockup inside the header bar; `variant="row"` is the full-width
 * row inside the mobile menu sheet. Renders nothing for single-locale
 * stores. Every option is a ≥44px hit area with `aria-pressed`.
 */
export function LocaleSwitch({
  locales,
  current,
  variant,
  className,
}: {
  locales: readonly LocaleCode[];
  current: LocaleCode;
  variant: "pill" | "row";
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  if (locales.length < 2) return null;

  function choose(loc: LocaleCode) {
    if (loc === current || pending) return;
    setPending(true);
    switchLocale(loc);
  }

  return (
    <div
      role="group"
      aria-label={chromeString("language", current)}
      aria-busy={pending || undefined}
      className={cn(
        "flex items-center gap-1 p-1",
        variant === "row" && "w-full",
        className,
      )}
      style={{
        backgroundColor:
          "color-mix(in srgb, var(--bk-ink, #1a1a1a) 6%, transparent)",
        borderRadius: "var(--bk-radius-pill, 9999px)",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {locales.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            lang={loc}
            onClick={() => choose(loc)}
            aria-pressed={active}
            disabled={pending}
            className={cn(
              "inline-flex min-h-11 items-center justify-center px-3 font-body text-sm font-bold",
              "transition-[background-color,color,opacity] duration-bk-fast motion-reduce:transition-none",
              "hover:opacity-80 active:opacity-60 disabled:cursor-wait",
              "focus-visible:outline-none focus-visible:ring-2 ring-bk-focus focus-visible:ring-offset-2",
              variant === "row" ? "flex-1" : "min-w-11",
            )}
            style={{
              borderRadius: "var(--bk-radius-pill, 9999px)",
              backgroundColor: active
                ? "var(--bk-primary, #1a1a1a)"
                : "transparent",
              color: active
                ? "var(--bk-on-primary, #ffffff)"
                : "var(--bk-ink, #1a1a1a)",
              fontFamily: "var(--bk-font-body, inherit)",
            }}
          >
            {LOCALE_LABELS[loc]}
          </button>
        );
      })}
    </div>
  );
}
