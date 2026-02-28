"use client";

import * as Sentry from "@sentry/nextjs";

export default function SentryTestPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-background text-foreground">
            <h1 className="text-4xl font-bold mb-8">Sentry Integration Test</h1>

            <div className="flex flex-col gap-4 max-w-md w-full">
                <button
                    onClick={() => {
                        throw new Error("Sentry Frontend Error Test");
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                    Throw Frontend Error
                </button>

                <button
                    onClick={() => {
                        Sentry.captureMessage("Sentry Manual Message Test");
                        alert("Sent manual message to Sentry");
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                    Capture Manual Message
                </button>

                <div className="mt-8 p-4 border border-border rounded-md bg-muted/50">
                    <p className="text-sm text-muted-foreground">
                        <strong>Note:</strong> Errors will only be sent if you have configured
                        <code>NEXT_PUBLIC_SENTRY_DSN</code> in your <code>.env.local</code>.
                    </p>
                </div>
            </div>
        </div>
    );
}
