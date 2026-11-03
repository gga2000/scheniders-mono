"use client";

import dynamic from "next/dynamic";

// Heavy orders-page pieces, loaded on the client only.
export const VirtualizedOrderList = dynamic(
    () => import("@/components/orders/virtualized-order-list").then(mod => ({ default: mod.VirtualizedOrderList })),
    { ssr: false, loading: () => <div className="w-full h-[600px] animate-pulse bg-muted/20 rounded-2xl" /> }
);
export const DateRangePicker = dynamic(
    () => import("@scheniders/ui/date-range-picker").then(mod => ({ default: mod.DateRangePicker })),
    { ssr: false, loading: () => <div className="w-full h-10 animate-pulse bg-muted/20 rounded-xl" /> }
);
export const SavedViewsTabs = dynamic(
    () => import("@/components/orders/saved-views-tabs").then(mod => ({ default: mod.SavedViewsTabs })),
    { ssr: false, loading: () => <div className="w-48 h-10 animate-pulse bg-muted/20 rounded-xl" /> }
);
export const StickyFilterBar = dynamic(
    () => import("@/components/orders/sticky-filter-bar").then(mod => ({ default: mod.StickyFilterBar })),
    { ssr: false, loading: () => <div className="w-full h-14 animate-pulse bg-muted/20 rounded-2xl" /> }
);
export const VirtualizedOrderTable = dynamic(
    () => import("@/components/orders/virtualized-order-table").then(mod => ({ default: mod.VirtualizedOrderTable })),
    { loading: () => null, ssr: false }
);
export const ScrollToTopButton = dynamic(
    () => import("@scheniders/ui/scroll-to-top-button").then(mod => ({ default: mod.ScrollToTopButton })),
    { ssr: false, loading: () => <div className="hidden" /> }
);
export const BackupPrompt = dynamic(
    () => import("@/components/vault/backup-prompt").then(mod => ({ default: mod.BackupPrompt })),
    { ssr: false, loading: () => <div className="hidden" /> }
);
export const IraqMap = dynamic(
    () => import("@/components/shared/iraq-map").then(mod => ({ default: mod.IraqMap })),
    { ssr: false, loading: () => <div className="w-full h-[350px] animate-pulse bg-muted/20 rounded-2xl" /> }
);
export const AbandonedCartRecoveryStrip = dynamic(
    () => import("@/components/orders/abandoned-cart-recovery-strip").then(mod => ({ default: mod.AbandonedCartRecoveryStrip })),
    { ssr: false, loading: () => null }
);
