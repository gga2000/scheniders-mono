"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown by the root layout itself, which
 * app/error.tsx sits inside of and cannot catch. It replaces the whole
 * document, so it brings its own <html> and <body>, sets lang and never dir
 * (LTR in every locale), and styles inline in case the stylesheet is what
 * failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void import("@sentry/nextjs").then((Sentry) =>
      Sentry.captureException(error, { tags: { boundary: "global-error" } }),
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#52525b", margin: "0 0 1.5rem", lineHeight: 1.6 }}>The error was reported. Try again.</p>
          <button
            onClick={reset}
            style={{
              padding: "0.625rem 1.5rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#18181b",
              color: "#fff",
              fontSize: "0.9375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
