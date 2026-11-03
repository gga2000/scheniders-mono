import { useId, useMemo } from "react";
import { smoothPath, type Pt } from "@/components/dashboard/bento/chart-geometry";

const W = 56;
const H = 22;

/**
 * A smooth day-by-day line with a soft fill and a dot on the last day. Decorative: the figure beside it is the
 * data, so it is hidden from assistive tech. Needs two points to draw a line.
 */
export function AnalyticsSparkline({ series }: { series: readonly number[] }) {
    const id = useId();
    const geometry = useMemo(() => {
        if (series.length < 2) return null;
        const max = Math.max(...series);
        const min = Math.min(...series, 0);
        const span = max - min || 1;
        const pts: Pt[] = series.map((v, i) => [(i / (series.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 8)]);
        const line = smoothPath(pts);
        const last = pts[pts.length - 1];
        return { line, area: `${line}L${W},${H}L0,${H}Z`, last };
    }, [series]);
    if (!geometry) return null;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[22px] w-[56px] shrink-0 overflow-visible" aria-hidden="true">
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--bento-line-b)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="var(--bento-line-b)" stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={geometry.area} fill={`url(#${id})`} />
            <path d={geometry.line} fill="none" stroke="var(--bento-line-b)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={geometry.last[0]} cy={geometry.last[1]} r="2.2" fill="var(--bento-line-b)" />
        </svg>
    );
}
