"use client";

import React from "react";
import {
    Dialog,
    BottomSheetContent,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui/dialog";
import { X, MapPin, Package, ShieldAlert } from "lucide-react";
import { useOrdersContext } from "@/components/providers/orders-provider";

interface MobileFilterModalProps {
    open: boolean;
    onClose: () => void;
}

export function MobileFilterModal({ open, onClose }: MobileFilterModalProps) {
    const { filters, setFilters, availableCities, availableProducts } = useOrdersContext();

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <BottomSheetContent className="p-0 flex flex-col max-h-[85vh] bg-[var(--background)]">
                <DialogHeader className="p-4 border-b border-[var(--card-border)] flex flex-row items-center justify-between sticky top-0 bg-[var(--background)] z-10">
                    <DialogTitle className="text-lg font-bold">Filters</DialogTitle>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 rounded-full bg-muted/50 text-muted-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* City Filter */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-muted-foreground" />
                            City
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setFilters({ ...filters, city: undefined })}
                                className={`px-3 py-2 rounded-xl text-sm font-medium border ${!filters.city ? 'bg-[var(--primary)] text-[var(--primary-fg)] border-transparent' : 'bg-[var(--card-bg)] border-[var(--card-border)]'}`}
                            >
                                All Cities
                            </button>
                            {availableCities?.map(city => (
                                <button
                                    key={city}
                                    onClick={() => setFilters({ ...filters, city })}
                                    className={`px-3 py-2 rounded-xl text-sm font-medium border ${filters.city === city ? 'bg-[var(--primary)] text-[var(--primary-fg)] border-transparent' : 'bg-[var(--card-bg)] border-[var(--card-border)]'}`}
                                >
                                    {city}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Product Filter */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold flex items-center gap-2">
                            <Package className="w-4 h-4 text-muted-foreground" />
                            Product
                        </label>
                        <select
                            value={filters.product || ""}
                            onChange={(e) => setFilters({ ...filters, product: e.target.value || undefined })}
                            className="w-full px-3 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        >
                            <option value="">All Products</option>
                            {availableProducts?.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>

                    {/* Risk Level Filter */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                            Risk Level
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setFilters({ ...filters, riskLevel: undefined })}
                                className={`px-3 py-2 rounded-xl text-sm font-medium border ${!filters.riskLevel ? 'bg-[var(--primary)] text-[var(--primary-fg)] border-transparent' : 'bg-[var(--card-bg)] border-[var(--card-border)]'}`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setFilters({ ...filters, riskLevel: 'high' })}
                                className={`px-3 py-2 rounded-xl text-sm font-medium border ${filters.riskLevel === 'high' ? 'bg-red-500 text-white border-transparent' : 'bg-[var(--card-bg)] border-[var(--card-border)]'}`}
                            >
                                High Risk
                            </button>
                            <button
                                onClick={() => setFilters({ ...filters, riskLevel: 'flagged' })}
                                className={`px-3 py-2 rounded-xl text-sm font-medium border ${filters.riskLevel === 'flagged' ? 'bg-orange-500 text-white border-transparent' : 'bg-[var(--card-bg)] border-[var(--card-border)]'}`}
                            >
                                Flagged
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-[var(--card-border)] bg-[var(--background)] sticky bottom-0 z-10">
                    <button
                        onClick={onClose}
                        className="w-full py-3.5 rounded-xl bg-[var(--primary)] text-[var(--primary-fg)] font-bold shadow-md active:scale-[0.98] transition-all"
                    >
                        Apply Filters
                    </button>
                </div>
            </BottomSheetContent>
        </Dialog>
    );
}
