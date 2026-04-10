"use client";

import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-4 md:p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
          <p className="text-sm text-foreground-muted mt-2">
            {error.message || "An unexpected error occurred. Please try again."}
          </p>
        </div>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-[#1E1E1E] text-white text-sm font-semibold hover:bg-[#2D2D2D] transition-all"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
