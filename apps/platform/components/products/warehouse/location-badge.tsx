"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface LocationBadgeProps {
    productId: string;
    size?: "sm" | "md";
}

interface ProductStorageRow {
    id: string;
    location_id: string;
    quantity: number;
    storage_locations: {
        id: string;
        name: string;
        code: string;
        type: string;
    };
}

export function LocationBadge({ productId, size = "sm" }: LocationBadgeProps) {
    const { t } = useLanguage();
    const [showTooltip, setShowTooltip] = useState(false);

    const { data: locations = [] } = useQuery({
        queryKey: ["location-badge", productId],
        queryFn: async () => {
            if (!productId) return [];
            const { data, error } = await supabase
                .from("product_storage")
                .select("id, location_id, quantity, storage_locations(id, name, code, type)")
                .eq("product_id", productId);
            if (error) throw error;
            return (data || []) as unknown as ProductStorageRow[];
        },
        enabled: !!productId,
        staleTime: 60_000,
    });

    if (locations.length === 0) return null;

    const primary = locations[0];
    const primaryCode = primary.storage_locations?.code || "?";

    const isSmall = size === "sm";

    return (
        <div
            className="relative inline-flex"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <span
                className={cn(
                    "inline-flex items-center gap-1 font-mono rounded-lg bg-[var(--pastel-blue)] text-blue-700 whitespace-nowrap",
                    isSmall ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
                )}
            >
                <MapPin className={cn(isSmall ? "w-3 h-3" : "w-3.5 h-3.5")} />
                {primaryCode}
                {locations.length > 1 && (
                    <span className="opacity-70">+{locations.length - 1}</span>
                )}
            </span>

            {/* Tooltip */}
            <AnimatePresence>
                {showTooltip && locations.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 min-w-[180px]"
                    >
                        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg p-3 space-y-1.5">
                            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">
                                {"Locations"}
                            </p>
                            {locations.map((loc) => {
                                const sl = loc.storage_locations;
                                if (!sl) return null;
                                return (
                                    <div
                                        key={loc.id}
                                        className="flex items-center justify-between gap-3 text-xs"
                                    >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <span className="font-mono text-blue-700 bg-[var(--pastel-blue)] px-1 py-0.5 rounded text-[10px]">
                                                {sl.code}
                                            </span>
                                            <span className="text-foreground truncate">
                                                {sl.name}
                                            </span>
                                        </div>
                                        <span className="text-muted shrink-0">
                                            x{loc.quantity}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        {/* Tooltip arrow */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--card-bg)] border-r border-b border-[var(--card-border)] rotate-45 -mt-1" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
