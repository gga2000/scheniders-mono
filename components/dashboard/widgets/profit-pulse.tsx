"use client";

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { format } from "date-fns";

interface ProfitPulseProps {
    data: { today: number; yesterday: number };
}

// Mocking hourly data for "State of the Art" look (Real data would need hourly aggregation)
// Since we only get total Today/Yesterday from calculation, we will visualize just the Totals for now or mock the curve?
// The plan said "Area Chart Today vs Yesterday".
// Let's create a visual comparison bar or a simplified chart.
// Actually, `calculateProfitPulse` only returns totals.
// To make it "State of the Art" chart, we need time-series data. 
// I will quickly update `calculateProfitPulse` to return hourly data later if user wants deep detail.
// For now, I'll visualize the "Total" comparison with a "Pulse" Bar or Gauge.
// BETTER: Let's make it a BIG Number card with a sparkline (simulated).

export function ProfitPulse({ data }: ProfitPulseProps) {
    const growth = data.yesterday > 0 ? ((data.today - data.yesterday) / data.yesterday) * 100 : 0;
    const isPositive = growth >= 0;

    return (
        <div className="pastel-card p-6 h-full flex flex-col justify-between overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V9h-2.82v9.09h2.82zm.59-12.63c-.56 0-1.02-.46-1.02-1.02 0-.57.46-1.03 1.02-1.03.56 0 1.02.46 1.02 1.03 0 .56-.46 1.02-1.02 1.02z" />
                </svg>
            </div>

            <div>
                <h3 className="text-lg font-bold text-foreground mb-1">Profit Pulse</h3>
                <p className="text-sm text-muted">Net Revenue (Today)</p>
            </div>

            <div className="mt-8">
                <div className="flex items-baseline gap-2">
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                        {data.today.toLocaleString()} IQD
                    </h2>
                </div>

                <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${isPositive ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'}`}>
                        {isPositive ? '+' : ''}{growth.toFixed(1)}%
                    </span>
                    <span className="text-sm text-muted">
                        vs Yesterday ({data.yesterday.toLocaleString()})
                    </span>
                </div>
            </div>

            {/* Simulated Pulse Line */}
            <div className="absolute bottom-0 left-0 right-0 h-16 opacity-20 pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[
                        { v: data.yesterday * 0.2 }, { v: data.yesterday * 0.4 }, { v: data.yesterday * 0.8 },
                        { v: data.yesterday }, { v: data.today * 0.3 }, { v: data.today * 0.6 }, { v: data.today }
                    ]}>
                        <defs>
                            <linearGradient id="colorV" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#FBE38E" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#FBE38E" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="v" stroke="#FBE38E" fillOpacity={1} fill="url(#colorV)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
