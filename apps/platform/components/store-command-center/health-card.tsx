"use client";

import Link from "next/link";
import { HeartPulse, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { runHealthChecks, emptyStoreConfigV2 } from "@scheniders/shared";
import type { StoreConfigV2 } from "@scheniders/shared";

interface HealthCardProps {
    config: StoreConfigV2 | null;
}

function scoreColor(score: number): string {
    if (score < 40) return "#ef4444";
    if (score < 70) return "#f59e0b";
    if (score < 85) return "#22d3a5";
    return "#16a34a";
}

function scoreLabel(score: number): string {
    if (score < 40) return "Needs attention";
    if (score < 70) return "Getting there";
    if (score < 85) return "Looking good";
    return "Launch-ready";
}

/** Simple SVG ring showing the score 0–100. */
function ScoreRing({ score }: { score: number }) {
    const r = 32;
    const circ = 2 * Math.PI * r;
    const filled = (score / 100) * circ;
    const color = scoreColor(score);

    return (
        <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
            <circle
                cx="40" cy="40" r={r} fill="none"
                stroke="currentColor" strokeWidth="8"
                className="text-muted/30"
            />
            <circle
                cx="40" cy="40" r={r} fill="none"
                stroke={color} strokeWidth="8"
                strokeDasharray={`${filled} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{ transition: "stroke-dasharray 0.6s ease" }}
            />
            <text x="40" y="44" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>
                {score}
            </text>
        </svg>
    );
}

export function HealthCard({ config }: HealthCardProps) {
    const report = runHealthChecks(config ?? emptyStoreConfigV2());
    const { score, checks } = report;

    // Top 4 failing or warning checks
    const issues = checks
        .filter((c) => c.status !== "pass")
        .sort((a, b) => {
            const order: Record<string, number> = { fail: 0, warn: 1 };
            return (order[a.status] ?? 2) - (order[b.status] ?? 2);
        })
        .slice(0, 4);

    return (
        <div className="glass-card rounded-2xl border border-border p-6">
            <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <HeartPulse className="w-4 h-4 text-emerald-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Store health</h3>
            </div>

            <div className="flex items-start gap-4 mb-5">
                <ScoreRing score={score} />
                <div className="flex flex-col justify-center gap-1">
                    <p className="text-sm font-semibold text-foreground">{scoreLabel(score)}</p>
                    <p className="text-xs text-muted-foreground">
                        {issues.length === 0
                            ? "All checks passing — store is launch-ready."
                            : `${issues.length} item${issues.length !== 1 ? "s" : ""} to address before launch.`}
                    </p>
                </div>
            </div>

            {issues.length > 0 && (
                <div className="space-y-2">
                    {issues.map((check) => (
                        <div key={check.id} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-muted/40 border border-border/50">
                            <AlertTriangle
                                className={
                                    check.status === "fail"
                                        ? "w-4 h-4 text-rose-500 mt-0.5 shrink-0"
                                        : "w-4 h-4 text-amber-500 mt-0.5 shrink-0"
                                }
                            />
                            <p className="text-xs text-foreground flex-1">{check.message ?? check.id}</p>
                            <Link
                                href="/store/edit"
                                className="text-[10px] font-semibold text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                            >
                                Fix
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            {issues.length === 0 && (
                <div className="flex items-center gap-2 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs font-medium">All checks passing</span>
                </div>
            )}

            <Link
                href="/store/edit"
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
                Full checklist in editor <ArrowRight className="w-3 h-3" />
            </Link>
        </div>
    );
}
