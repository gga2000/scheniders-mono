"use client";

import { Filter } from "lucide-react";
import type { FunnelStep } from "@/types/dashboard";

interface FulfillmentFunnelProps {
  funnel: FunnelStep[] | undefined;
}

const WIDTHS = ["90%", "70%", "50%", "35%"];

function Skeleton() {
  return (
    <div className="space-y-3 mt-6">
      {WIDTHS.map((w, i) => (
        <div
          key={i}
          className="h-12 rounded-xl bg-gray-200/40 animate-pulse mx-auto"
          style={{ width: w }}
        />
      ))}
    </div>
  );
}

export function FulfillmentFunnel({ funnel }: FulfillmentFunnelProps) {
  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--pastel-mint)]/40 flex items-center justify-center">
            <Filter className="w-4 h-4 text-teal-700" />
          </div>
          <h3 className="font-bold text-foreground text-sm">
            Fulfillment Funnel
          </h3>
        </div>
      </div>

      {!funnel ? (
        <Skeleton />
      ) : funnel.length === 0 ? (
        <p className="text-sm text-foreground/50 text-center py-8">
          No funnel data available
        </p>
      ) : (
        <div className="flex flex-col items-center gap-1 mt-2">
          {funnel.map((step, idx) => {
            const width = WIDTHS[idx] ?? WIDTHS[WIDTHS.length - 1];
            // Interpolate from pastel-blue to pastel-green
            const colorStops = [
              "var(--pastel-blue)",
              "#8DD8BE",
              "#A4DFA8",
              "var(--pastel-green)",
            ];
            const bgColor = colorStops[idx] ?? colorStops[colorStops.length - 1];

            return (
              <div key={step.label} className="w-full flex flex-col items-center">
                {/* Stage bar */}
                <div
                  className="rounded-xl px-4 py-3 flex items-center justify-between transition-all duration-500"
                  style={{
                    width,
                    backgroundColor: bgColor,
                    opacity: 0.85,
                  }}
                >
                  <span className="text-sm font-semibold text-foreground/90">
                    {step.label}
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {step.count.toLocaleString()}
                  </span>
                </div>

                {/* Drop-off indicator between stages */}
                {idx < funnel.length - 1 && step.dropOffPct > 0 && (
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="w-px h-3 bg-foreground/20" />
                    <span className="text-[10px] font-medium text-foreground/50">
                      {step.dropOffPct.toFixed(0)}% drop-off
                    </span>
                    <div className="w-px h-3 bg-foreground/20" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
