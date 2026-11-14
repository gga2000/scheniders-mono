"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Arabic is the default: an English-only page here met an Arabic merchant
  // at the moment they were already stuck (finances, settings, prime, till,
  // salaries, dashboard, reports and team have no boundary of their own).
  const { t } = useLanguage();
  useEffect(() => {
    console.error("[platform error]", error);
    // An error boundary that only logs to the console is a silent one: it
    // CATCHES the error, so nothing else reports it, and the merchant sees this
    // screen while Sentry shows nothing. Sentry's automatic instrumentation
    // cannot see errors an app-router boundary has already swallowed.
    Sentry.captureException(error, { tags: { boundary: "app-error" } });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <h1 dir="auto" className="text-3xl font-bold text-foreground mb-2">{t("app.error.title")}</h1>
        <p dir="auto" className="text-muted-foreground mb-6">{t("app.error.body")}</p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground mb-6">{error.digest}</p>}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
        >
          <RefreshCw className="h-4 w-4" />
          {t("app.error.retry")}
        </button>
      </div>
    </div>
  );
}
