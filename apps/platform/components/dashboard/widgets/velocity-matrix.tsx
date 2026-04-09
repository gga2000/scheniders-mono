"use client";

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ReferenceLine, Label } from "recharts";

type QuadrantCategory = 'Star' | 'Cash Cow' | 'Question Mark' | 'Dog';

interface ProductMetric {
    name: string;
    volume: number;
    margin: number;
    revenue: number;
    profit: number;
    category: QuadrantCategory;
}

interface VelocityMatrixProps {
    data: ProductMetric[];
}

const COLORS: Record<QuadrantCategory, string> = {
    'Star': '#C0EBA6',
    'Cash Cow': '#FBE38E',
    'Question Mark': '#A6C8FF',
    'Dog': '#F4C7CF',
};

export function VelocityMatrix({ data }: VelocityMatrixProps) {
    if (!data.length) return <div className="h-[300px] flex items-center justify-center text-muted">No data available</div>;

    // Calculate domains for centering
    const maxVol = Math.max(...data.map(d => d.volume));
    const maxMarg = Math.max(...data.map(d => d.margin));
    const avgVol = data.reduce((s, d) => s + d.volume, 0) / data.length;
    const avgMarg = data.reduce((s, d) => s + d.margin, 0) / data.length;

    return (
        <div className="pastel-card p-6 h-full flex flex-col">
            <h3 className="text-lg font-bold text-foreground mb-1">Product Velocity Matrix</h3>
            <p className="text-sm text-muted mb-4">Volume (Sales) vs Margin (Profitability)</p>

            <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <XAxis
                            type="number"
                            dataKey="volume"
                            name="Volume"
                            label={{ value: 'Units Sold', position: 'bottom', offset: 0, fontSize: 12 }}
                            domain={[0, maxVol * 1.1]}
                            stroke="#9CA3AF"
                            fontSize={12}
                        />
                        <YAxis
                            type="number"
                            dataKey="margin"
                            name="Margin"
                            label={{ value: 'Margin', angle: -90, position: 'left', fontSize: 12 }}
                            tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                            domain={[0, maxMarg * 1.1]}
                            stroke="#9CA3AF"
                            fontSize={12}
                        />
                        <ZAxis type="number" dataKey="revenue" range={[60, 400]} name="Revenue" />
                        <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload as ProductMetric;
                                    return (
                                        <div className="bg-white/95 backdrop-blur shadow-lg border border-border p-3 rounded-xl text-xs">
                                            <p className="font-bold mb-1 text-sm">{data.name}</p>
                                            <p className="text-muted">Category: <span style={{ color: COLORS[data.category] }} className="font-bold">{data.category}</span></p>
                                            <div className="my-1 h-px bg-border" />
                                            <p>Volume: {data.volume}</p>
                                            <p>Margin: {(data.margin * 100).toFixed(1)}%</p>
                                            <p>Profit: {data.profit.toLocaleString()}</p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        {/* Quadrant Lines */}
                        <ReferenceLine x={avgVol} stroke="#E5E7EB" strokeDasharray="3 3" />
                        <ReferenceLine y={avgMarg} stroke="#E5E7EB" strokeDasharray="3 3" />

                        {/* Quadrant Labels */}
                        <ReferenceLine y={maxMarg} x={maxVol} stroke="none">
                            <Label value="STARS" position="insideTopRight" fill={COLORS['Star']} fontSize={10} fontWeight="bold" opacity={0.8} />
                        </ReferenceLine>
                        <ReferenceLine y={0} x={maxVol} stroke="none">
                            <Label value="CASH COWS" position="insideBottomRight" fill={COLORS['Cash Cow']} fontSize={10} fontWeight="bold" opacity={0.8} />
                        </ReferenceLine>
                        <ReferenceLine y={maxMarg} x={0} stroke="none">
                            <Label value="?" position="insideTopLeft" fill={COLORS['Question Mark']} fontSize={10} fontWeight="bold" opacity={0.8} />
                        </ReferenceLine>
                        <ReferenceLine y={0} x={0} stroke="none">
                            <Label value="DOGS" position="insideBottomLeft" fill={COLORS['Dog']} fontSize={10} fontWeight="bold" opacity={0.8} />
                        </ReferenceLine>

                        <Scatter name="Products" data={data}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[entry.category]} fillOpacity={0.8} stroke={COLORS[entry.category]} strokeWidth={1} />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
