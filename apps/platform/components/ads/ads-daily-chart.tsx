"use client";

import { formatIQD } from "@/lib/utils";
import type { DailyAdsPoint } from "@/lib/ads-report";

const W = 760;
const PANEL_H = 110;
const GAP = 22;
const LABEL_H = 18;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 8;
const H = PAD_T + LABEL_H + PANEL_H + GAP + LABEL_H + PANEL_H + 18;

interface Props {
    points: readonly DailyAdsPoint[];
    spendLabel: string;
    ordersLabel: string;
    deliveredLabel: string;
}

/** Day label like "26 Oct", from a YYYY-MM-DD key (no timezone shift: the key is already a Baghdad day). */
function dayLabel(key: string): string {
    const [, m, d] = key.split("-");
    return `${Number(d)}/${Number(m)}`;
}

export function AdsDailyChart({ points, spendLabel, ordersLabel, deliveredLabel }: Props) {
    const n = points.length;
    const innerW = W - PAD_L - PAD_R;
    const slot = innerW / n;
    const barW = Math.max(2, Math.min(28, slot * 0.62));
    const maxSpend = Math.max(1, ...points.map((p) => p.spendIqd));
    const maxOrders = Math.max(1, ...points.map((p) => Math.max(p.orders, p.delivered)));
    const x = (i: number) => PAD_L + slot * i + slot / 2;
    const topY = PAD_T + LABEL_H;
    const botY = topY + PANEL_H + GAP + LABEL_H;
    const spendH = (v: number) => (v / maxSpend) * PANEL_H;
    const orderY = (v: number) => botY + PANEL_H - (v / maxOrders) * PANEL_H;
    const labelEvery = Math.max(1, Math.ceil(n / 10));

    const deliveredPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${orderY(p.delivered).toFixed(1)}`).join(" ");

    return (
        <figure className="m-0">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${spendLabel}, ${ordersLabel}, ${deliveredLabel}`}>
                <g className="text-muted">
                    <line x1={PAD_L} x2={W - PAD_R} y1={topY + PANEL_H} y2={topY + PANEL_H} stroke="currentColor" strokeOpacity={0.25} />
                    <line x1={PAD_L} x2={W - PAD_R} y1={botY + PANEL_H} y2={botY + PANEL_H} stroke="currentColor" strokeOpacity={0.25} />
                    <text x={PAD_L} y={topY - 6} fontSize={10} fill="currentColor">{`${spendLabel} · max ${formatIQD(maxSpend)}`}</text>
                    <text x={PAD_L} y={botY - 6} fontSize={10} fill="currentColor">{`${ordersLabel} / ${deliveredLabel} · max ${maxOrders}`}</text>
                </g>

                {points.map((p, i) => (
                    <g key={p.date}>
                        <rect
                            x={x(i) - barW / 2}
                            y={topY + PANEL_H - spendH(p.spendIqd)}
                            width={barW}
                            height={spendH(p.spendIqd)}
                            rx={2}
                            className="fill-foreground"
                            fillOpacity={0.75}
                        >
                            <title>{`${p.date}: ${formatIQD(p.spendIqd)}`}</title>
                        </rect>
                        <rect
                            x={x(i) - barW / 2}
                            y={orderY(p.orders)}
                            width={barW}
                            height={botY + PANEL_H - orderY(p.orders)}
                            rx={2}
                            className="fill-blue-500"
                            fillOpacity={0.55}
                        >
                            <title>{`${p.date}: ${p.orders} / ${p.delivered}`}</title>
                        </rect>
                        {i % labelEvery === 0 ? (
                            <text x={x(i)} y={H - 4} fontSize={10} textAnchor="middle" className="fill-muted">
                                {dayLabel(p.date)}
                            </text>
                        ) : null}
                    </g>
                ))}
                <path d={deliveredPath} fill="none" className="stroke-emerald-600" strokeWidth={2} strokeLinejoin="round" />
                {points.map((p, i) => (
                    <circle key={p.date} cx={x(i)} cy={orderY(p.delivered)} r={n > 40 ? 1.5 : 3} className="fill-emerald-600" />
                ))}
            </svg>
            <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-foreground/75" />{spendLabel}</span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500/55" />{ordersLabel}</span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-3 bg-emerald-600" />{deliveredLabel}</span>
            </figcaption>
        </figure>
    );
}
