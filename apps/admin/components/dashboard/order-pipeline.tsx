"use client";

import { GitBranch } from "lucide-react";
import type { PipelineStage } from "@/types/dashboard";

interface OrderPipelineProps {
  pipeline: PipelineStage[] | undefined;
}

function SkeletonPipeline() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-1 h-10 rounded-xl overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 bg-foreground/[0.08]" />
        ))}
      </div>
      <div className="flex gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 space-y-1">
            <div className="h-3 w-16 rounded bg-foreground/[0.06]" />
            <div className="h-3 w-8 rounded bg-foreground/[0.05]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrderPipeline({ pipeline }: OrderPipelineProps) {
  const total = pipeline ? pipeline.reduce((s, st) => s + st.count, 0) : 0;

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)]/40 flex items-center justify-center">
          <GitBranch className="w-4 h-4 text-blue-700" />
        </div>
        <div>
          <h3 className="font-bold text-foreground text-sm">Order Pipeline</h3>
          {pipeline && (
            <p className="text-xs text-foreground/50">
              {new Intl.NumberFormat("en-IQ").format(total)} total orders
            </p>
          )}
        </div>
      </div>

      {!pipeline ? (
        <SkeletonPipeline />
      ) : pipeline.length === 0 ? (
        <p className="text-sm text-foreground/40 py-6 text-center">
          No pipeline data available.
        </p>
      ) : (
        <div className="space-y-3">
          {pipeline.map((stage) => {
            const widthPct = total > 0 ? (stage.count / total) * 100 : 0;
            return (
              <div key={stage.status}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-xs font-semibold text-foreground/70">
                      {stage.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      {stage.count}
                    </span>
                    <span className="text-[10px] text-foreground/40">
                      {stage.pct}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-foreground/[0.04] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.max(widthPct, 1)}%`,
                      backgroundColor: stage.color,
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
