"use client";

import { useEffect } from "react";

/**
 * Corrects `<html lang>` to the tenant's locale (EC15). The storefront root
 * layout renders a static `lang="ar"` because it has no tenant context; once
 * the tenant subtree mounts we set the real locale so screen readers and
 * lang-aware UA behaviour are correct for en/ku stores. Renders nothing.
 *
 * LTR-only project — we deliberately set ONLY `lang`, never `dir` (CLAUDE.md).
 */
export function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    if (lang && typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang]);
  return null;
}
