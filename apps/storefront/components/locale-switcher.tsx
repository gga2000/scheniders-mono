"use client";

import { useTransition } from "react";
import { LOCALE_COOKIE } from "@scheniders/shared";
import type { LocaleCode } from "@scheniders/shared";

/** Native-name labels — each language shown in its own script. */
const LABELS: Record<LocaleCode, string> = {
  ar: "العربية",
  en: "English",
  ku: "کوردی",
};

/** Persist the locale choice. Module-level so the React Compiler doesn't treat
 *  the `document.cookie` write as a render-scope mutation. One year, lax. */
function persistLocale(loc: LocaleCode): void {
  document.cookie = `${LOCALE_COOKIE}=${loc}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * Storefront language switcher (EC13). Records the visitor's choice in the
 * `sb_locale` cookie and reloads so the server re-renders in the chosen
 * locale (V2Page reads the cookie via resolveVisitorLocale). Renders nothing
 * for single-locale stores. LTR-only — no `dir` flip, per project convention.
 */
export function LocaleSwitcher({
  locales,
  current,
}: {
  locales: LocaleCode[];
  current: LocaleCode;
}) {
  const [pending, startTransition] = useTransition();

  if (!locales || locales.length < 2) return null;

  function choose(loc: LocaleCode) {
    if (loc === current || pending) return;
    persistLocale(loc);
    startTransition(() => window.location.reload());
  }

  return (
    <div
      className="fixed bottom-4 left-4 z-40 flex items-center gap-1 p-1"
      style={{
        backgroundColor: "var(--bk-surface, #ffffff)",
        border: "var(--bk-border-thickness, 2px) solid var(--bk-ink, #1a1a1a)",
        borderRadius: "var(--bk-radius-pill, 9999px)",
        boxShadow: "var(--bk-shadow-button, 2px 2px 0 0 #1a1a1a)",
        opacity: pending ? 0.6 : 1,
      }}
      aria-label="Language"
    >
      {locales.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            onClick={() => choose(loc)}
            aria-pressed={active}
            className="px-3 py-1 text-sm font-bold transition-colors"
            style={{
              borderRadius: "var(--bk-radius-pill, 9999px)",
              backgroundColor: active ? "var(--bk-primary, #ff5a8a)" : "transparent",
              color: active ? "var(--bk-on-primary, #ffffff)" : "var(--bk-ink, #1a1a1a)",
            }}
          >
            {LABELS[loc] ?? loc}
          </button>
        );
      })}
    </div>
  );
}
