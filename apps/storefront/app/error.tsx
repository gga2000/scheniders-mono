"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Imported here, not at the top: a static import would put the whole SDK
    // in every page's bundle. Same module instance instrumentation-client inits.
    void import("@sentry/nextjs").then((Sentry) =>
      Sentry.captureException(error, { tags: { boundary: "app-error" } }),
    );
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold text-zinc-900 mb-2">حدث خطأ</h1>
        <p className="text-zinc-600 mb-6">عذراً، حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.</p>
        <button
          onClick={reset}
          className="inline-block bg-brand-primary text-white px-6 py-2 rounded-lg font-medium hover:opacity-90"
        >
          حاول مرة أخرى
        </button>
      </div>
    </main>
  );
}
