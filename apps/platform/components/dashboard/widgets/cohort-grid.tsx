"use client";

import { CohortData } from "@/lib/analytics/dashboard-calculations";

interface CohortGridProps {
    data: CohortData[];
}

// Helper for heat map color
function getHeatColor(percent: number) {
    if (percent >= 50) return 'bg-green-500 text-white';
    if (percent >= 30) return 'bg-green-400 text-white';
    if (percent >= 20) return 'bg-green-300 text-green-900';
    if (percent >= 10) return 'bg-green-200 text-green-800';
    if (percent > 0) return 'bg-green-100 text-green-800';
    return 'bg-gray-50 text-gray-400';
}

export function CohortGrid({ data }: CohortGridProps) {
    if (!data.length) return <div className="h-[200px] flex items-center justify-center text-muted">No cohort data available</div>;

    // Show last 6 months for compactness
    const displayData = data.slice(-6);

    return (
        <div className="pastel-card p-6 h-full overflow-hidden flex flex-col">
            <h3 className="text-lg font-bold text-foreground mb-4">Customer Retention</h3>

            <div className="overflow-x-auto flex-1 scrollbar-hide">
                <table className="w-full text-xs">
                    <thead>
                        <tr>
                            <th className="text-left p-2 text-muted font-normal w-20">Cohort</th>
                            <th className="text-left p-2 text-muted font-normal w-12">Size</th>
                            {Array.from({ length: 12 }).map((_, i) => (
                                <th key={i} className="text-center p-2 text-muted font-normal w-10">M+{i}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {displayData.map((cohort) => (
                            <tr key={cohort.month}>
                                <td className="p-2 font-medium whitespace-nowrap">{cohort.month}</td>
                                <td className="p-2 text-muted">{cohort.cohortSize}</td>
                                {Array.from({ length: 12 }).map((_, i) => {
                                    const percent = cohort.retention[i];
                                    if (percent === undefined) return <td key={i} className="p-1"></td>;

                                    return (
                                        <td key={i} className="p-1">
                                            <div
                                                className={`w-full h-8 flex items-center justify-center rounded ${getHeatColor(percent)}`}
                                                title={`${percent}% retention in Month +${i}`}
                                            >
                                                {percent > 0 ? `${percent}%` : ''}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
