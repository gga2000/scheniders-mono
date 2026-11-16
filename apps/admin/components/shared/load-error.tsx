"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

interface LoadErrorProps {
  /** What failed to load, as it reads after "Could not load": "the dashboard". */
  what: string;
  onRetry: () => void;
  retrying?: boolean;
}

/**
 * Shown in place of a page whose numbers could not be loaded. A page that
 * keeps its spinner, or draws zeros, tells staff nothing is wrong.
 */
export function LoadError({ what, onRetry, retrying = false }: LoadErrorProps) {
  return (
    <div role="alert" className="p-4 md:p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Could not load {what}</h2>
          <p className="text-sm text-foreground-muted mt-2">
            No numbers are shown, because they could be wrong. Check your connection and try again.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1E1E1E] text-white text-sm font-semibold hover:bg-[#2D2D2D] disabled:opacity-50 transition-all"
        >
          <RotateCw className={`w-4 h-4 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Loading" : "Try again"}
        </button>
      </div>
    </div>
  );
}
