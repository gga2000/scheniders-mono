"use client";

// Simple "Dot Map" visualization for Iraq Governorates
// Using relative percentage positions for major cities
interface GeoMapProps {
    data: any; // We'll pass the whole dashboard metrics or just Urgency details? 
    // Plan says "Real-time Pulse bubbles for new orders"
    // We can simulate this visually for now.
}

const IQ_CITIES = [
    { name: "Baghdad", x: 60, y: 55, color: "bg-rose-500" },
    { name: "Basra", x: 85, y: 85, color: "bg-blue-500" },
    { name: "Erbil", x: 55, y: 20, color: "bg-yellow-500" },
    { name: "Mosul", x: 45, y: 15, color: "bg-purple-500" },
    { name: "Najaf", x: 55, y: 65, color: "bg-green-500" },
    // Add more as needed
];

export function GeoMap({ data }: GeoMapProps) {
    return (
        <div className="pastel-card p-6 h-full relative overflow-hidden bg-slate-50 border-slate-200">
            <h3 className="text-lg font-bold text-foreground mb-4 z-10 relative">Live Activity Map</h3>

            <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                {/* Placeholder outline of Iraq roughly */}
                <svg viewBox="0 0 100 100" className="w-[80%] h-auto text-slate-900 fill-current">
                    <path d="M40,10 L60,10 L70,30 L90,80 L80,95 L50,90 L30,60 L20,30 Z" />
                </svg>
            </div>

            <div className="relative w-full h-full min-h-[300px]">
                {IQ_CITIES.map(city => (
                    <div
                        key={city.name}
                        className="absolute group cursor-pointer"
                        style={{ left: `${city.x}%`, top: `${city.y}%` }}
                    >
                        <span className={`relative flex h-3 w-3`}>
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${city.color} opacity-75`}></span>
                            <span className={`relative inline-flex rounded-full h-3 w-3 ${city.color}`}></span>
                        </span>

                        <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-white px-2 py-1 rounded shadow-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20">
                            {city.name}
                        </div>
                    </div>
                ))}
            </div>

            <div className="absolute bottom-4 left-4 text-xs text-muted">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span> High Activity
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span> Normal
                </div>
            </div>
        </div>
    );
}
