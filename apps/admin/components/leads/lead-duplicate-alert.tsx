"use client";

import { AlertTriangle, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeadSourcePlatform } from "@/types/leads";

interface DuplicateMatch {
  id: string;
  merchant_name: string;
  platform: LeadSourcePlatform;
  follower_count: number;
  match_type: "phone" | "name" | "url";
  similarity: number; // 0-100
}

interface LeadDuplicateAlertProps {
  matches: DuplicateMatch[];
  onDismiss: () => void;
  onViewDuplicate: (id: string) => void;
}

const MATCH_TYPE_LABELS: Record<DuplicateMatch["match_type"], { label: string; bg: string; text: string }> = {
  phone: { label: "Phone Match", bg: "bg-amber-500/15", text: "text-amber-600 dark:text-amber-400" },
  name: { label: "Name Match", bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400" },
  url: { label: "URL Match", bg: "bg-yellow-500/15", text: "text-yellow-600 dark:text-yellow-400" },
};

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return String(count);
}

export function LeadDuplicateAlert({
  matches,
  onDismiss,
  onViewDuplicate,
}: LeadDuplicateAlertProps) {
  if (matches.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--foreground)]">
              Potential duplicates found
            </h4>
            <p className="text-xs text-[var(--muted)]">
              {matches.length} possible {matches.length === 1 ? "match" : "matches"} detected
            </p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="p-1 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-amber-500/10 transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Match list */}
      <div className="space-y-2">
        {matches.map((match) => {
          const matchConfig = MATCH_TYPE_LABELS[match.match_type];
          return (
            <div
              key={match.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] px-3 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    {match.merchant_name.charAt(0).toUpperCase()}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">
                      {match.merchant_name}
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap",
                        matchConfig.bg,
                        matchConfig.text
                      )}
                    >
                      {matchConfig.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--muted)]">
                    <span>{match.platform}</span>
                    <span className="text-[var(--card-border)]">|</span>
                    <span>{formatFollowers(match.follower_count)} followers</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Similarity */}
                <div className="text-right">
                  <span
                    className={cn(
                      "text-xs font-bold",
                      match.similarity >= 90
                        ? "text-red-500"
                        : match.similarity >= 70
                          ? "text-amber-500"
                          : "text-yellow-500"
                    )}
                  >
                    {match.similarity}%
                  </span>
                  <div className="text-[10px] text-[var(--muted)]">match</div>
                </div>

                {/* View link */}
                <button
                  onClick={() => onViewDuplicate(match.id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                >
                  View
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
