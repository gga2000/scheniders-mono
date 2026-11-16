"use client";

import Link from "next/link";
import { AlertTriangle, Lock, LogIn, RotateCw } from "lucide-react";
import { loadFailureKind } from "@/lib/load-failure";

interface LoadErrorProps {
  /** What failed to load, as it reads after "Could not load": "the dashboard". */
  what: string;
  onRetry: () => void;
  retrying?: boolean;
  /**
   * The failure itself, when the page has it. A login that may not open the
   * page, or a sign-in that ended, gets its own words and no "Try again":
   * asking again gives the same answer.
   */
  error?: unknown;
}

const BUTTON =
  "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1E1E1E] text-white text-sm font-semibold hover:bg-[#2D2D2D] disabled:opacity-50 transition-all";

/**
 * Shown in place of a page whose numbers could not be loaded. A page that
 * keeps its spinner, or draws zeros, tells staff nothing is wrong.
 */
export function LoadError({ what, onRetry, retrying = false, error }: LoadErrorProps) {
  const kind = loadFailureKind(error);
  const refused = kind === "forbidden";
  const signedOut = kind === "signed_out";
  const quiet = refused || signedOut;

  return (
    <div role="alert" className="p-4 md:p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md">
        <div
          className={`w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto ${
            quiet ? "bg-foreground/5 border-[var(--card-border)]" : "bg-red-50 border-red-200"
          }`}
        >
          {refused ? (
            <Lock className="w-8 h-8 text-foreground/50" />
          ) : signedOut ? (
            <LogIn className="w-8 h-8 text-foreground/50" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-red-500" />
          )}
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {refused
              ? `Your login cannot open ${what}`
              : signedOut
                ? "Your sign-in has ended"
                : `Could not load ${what}`}
          </h2>
          <p className="text-sm text-foreground-muted mt-2">
            {refused
              ? "Ask a super admin if you need something from it."
              : signedOut
                ? `Sign in again to see ${what}.`
                : "No numbers are shown, because they could be wrong. Check your connection and try again."}
          </p>
        </div>
        {signedOut ? (
          <Link href="/login" className={BUTTON}>
            <LogIn className="w-4 h-4" />
            Sign in
          </Link>
        ) : refused ? null : (
          <button type="button" onClick={onRetry} disabled={retrying} className={BUTTON}>
            <RotateCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Loading" : "Try again"}
          </button>
        )}
      </div>
    </div>
  );
}
