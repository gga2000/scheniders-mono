"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * The last-resort boundary: errors thrown by the ROOT LAYOUT itself, which
 * `app/error.tsx` sits inside of and therefore cannot catch.
 *
 * Without this file Next falls back to its built-in error page, which it loads
 * from `pages/500.html`. Production was logging that load failing:
 *
 *   Failed to load static file for page: /500
 *   ENOENT: no such file or directory, open '.../.next/server/pages/500.html'
 *
 * The build DOES emit that file — checked, with and without this one — so the
 * gap is packaging: nothing references it statically, so Vercel's output
 * tracing leaves it out of the serverless bundle, and the path it is looked up
 * at (/var/task/...) does not exist at runtime. An app-router `global-error`
 * renders instead of that fallback, so the lookup should not be reached.
 *
 * Either way the boundary was missing on its own terms: a root-layout failure
 * had no styled page and reported nothing to Sentry.
 *
 * This replaces the whole document, so it has to supply its own <html> and
 * <body>. `lang="ar"` matches the root layout. Like the root layout it sets no
 * `dir`: the app is LTR in every locale, including Arabic, and LTR is the
 * HTML default, so `dir` is never set on <html>.
 *
 * Styling is deliberately inline rather than Tailwind — a root-layout failure
 * may well be the stylesheet itself not loading, and an error page that depends
 * on the thing that broke is no error page.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error, { tags: { boundary: "global-error" } });
    }, [error]);

    return (
        <html lang="ar">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1rem",
                    fontFamily:
                        "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
                    background: "#faf9f7",
                    color: "#1c1917",
                }}
            >
                <div style={{ textAlign: "center", maxWidth: "28rem" }}>
                    <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
                        حدث خطأ غير متوقع
                    </h1>
                    <p style={{ color: "#57534e", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
                        صار خلل ومنعدر نكمل. جرّب مرة ثانية، وإذا تكرر راجعنا.
                    </p>
                    {/* The digest is the only handle support has on a specific
                        occurrence, so it is shown rather than hidden. */}
                    {error.digest && (
                        <p
                            style={{
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                fontSize: "0.75rem",
                                color: "#a8a29e",
                                margin: "0 0 1.5rem",
                            }}
                        >
                            {error.digest}
                        </p>
                    )}
                    <button
                        onClick={reset}
                        style={{
                            padding: "0.625rem 1.5rem",
                            borderRadius: "0.75rem",
                            border: "none",
                            background: "#1c1917",
                            color: "#fff",
                            fontSize: "0.9375rem",
                            fontWeight: 500,
                            cursor: "pointer",
                        }}
                    >
                        حاول مرة ثانية
                    </button>
                </div>
            </body>
        </html>
    );
}
