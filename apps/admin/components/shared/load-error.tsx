"use client";

import Link from "next/link";
import { AlertTriangle, Lock, LogIn, RotateCw, SearchX } from "lucide-react";
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
  /** Inside a pop-up or side panel: the size of its content, not of a page. */
  compact?: boolean;
  /**
   * What the part shows once it loads: numbers (the default), a list, or a
   * page of facts. It picks the words, as `kept` does on `StaleLine`, so a
   * list that did not load is not said to hide its numbers (round 24 UX new 7).
   */
  shows?: Shows;
}

type Shows = "numbers" | "list" | "page";

const NOT_SHOWN: Readonly<Record<Shows, string>> = {
  numbers: "No numbers are shown, because they could be wrong.",
  list: "No list is shown until it can be read.",
  page: "Nothing is shown until it can be read.",
};

const BUTTON =
  "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1E1E1E] text-white text-sm font-semibold hover:bg-[#2D2D2D] disabled:opacity-50 transition-all";

/**
 * Shown in place of a page whose numbers could not be loaded. A page that
 * keeps its spinner, or draws zeros, tells staff nothing is wrong.
 */
export function LoadError({ what, onRetry, retrying = false, error, compact = false, shows = "numbers" }: LoadErrorProps) {
  const kind = loadFailureKind(error);
  const refused = kind === "forbidden";
  const signedOut = kind === "signed_out";
  const missing = kind === "missing";
  const quiet = refused || signedOut || missing;
  const icon = compact ? "w-6 h-6" : "w-8 h-8";

  return (
    <div
      role="alert"
      className={`flex items-center justify-center ${compact ? "px-4 py-12" : "p-4 md:p-6 min-h-[60vh]"}`}
    >
      <div className="text-center space-y-4 max-w-md">
        <div
          className={`${compact ? "w-12 h-12" : "w-16 h-16"} rounded-2xl border flex items-center justify-center mx-auto ${
            quiet ? "bg-foreground/5 border-[var(--card-border)]" : "bg-red-500/5 border-red-200"
          }`}
        >
          {refused ? (
            <Lock className={`${icon} text-foreground/70`} />
          ) : signedOut ? (
            <LogIn className={`${icon} text-foreground/70`} />
          ) : missing ? (
            <SearchX className={`${icon} text-foreground/70`} />
          ) : (
            <AlertTriangle className={`${icon} text-[var(--ink-red)]`} />
          )}
        </div>
        <div>
          <h2 className={`${compact ? "text-base" : "text-xl"} font-bold text-foreground`}>
            {refused
              ? `Your login cannot open ${what}`
              : signedOut
                ? "Your sign-in has ended"
                : missing
                  ? `Could not find ${what}`
                  : `Could not load ${what}`}
          </h2>
          <p className="text-sm text-foreground-muted mt-2">
            {refused
              ? "Ask a super admin if you need something from it."
              : signedOut
                ? `Sign in again to see ${what}.`
                : missing
                  ? "It may have been removed, or the link is wrong."
                  : `${NOT_SHOWN[shows]} Check your connection and try again.`}
          </p>
        </div>
        {signedOut ? (
          <Link href="/login" className={BUTTON}>
            <LogIn className="w-4 h-4" />
            Sign in
          </Link>
        ) : refused || missing ? null : (
          <button type="button" onClick={onRetry} disabled={retrying} className={BUTTON}>
            <RotateCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Loading" : "Try again"}
          </button>
        )}
      </div>
    </div>
  );
}
