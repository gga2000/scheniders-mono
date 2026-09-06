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
    // OBS-D1: this boundary catches every unhandled render crash in the app and
    // used to only console.error — so in production nobody ever learned about one.
    // User and tenant come from the context set in auth-provider.
    Sentry.captureException(error, {
      tags: { area: "platform-root" },
      extra: { digest: error.digest },
    });
    console.error("[platform error]", error);
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
