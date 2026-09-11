"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        <h1 className="text-4xl font-bold text-foreground mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
