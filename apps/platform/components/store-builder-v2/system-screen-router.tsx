"use client";

// =====================================================================
// SystemScreenRouter (extracted from editor-shell, 4.1)
// =====================================================================
// Renders the breadcrumb bar + the full-screen settings screen that
// replaces the canvas when a tree "setting" is selected (brand kit,
// versions, experiments, shipping…). Pure routing — every screen keeps
// its own state; the shell owns which screen is open.
// =====================================================================

import { ChevronLeft } from "lucide-react";
import type { PageId } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import type { BrandKit } from "@scheniders/shared";
import { STRINGS, t } from "@/lib/editor-i18n";
import { getSettingLabel, type SettingsSectionId } from "./page-tree";
import { BrandKitEditor } from "./brand-kit-editor";
import { VersionHistoryScreen } from "./version-history-screen";
import { ScheduledChangesScreen } from "./scheduled-changes-screen";
import { SegmentsScreen } from "./segments-screen";
import { ExperimentsScreen } from "./experiments-screen";
import { RedirectsScreen } from "./redirects-screen";
import { ShippingScreen } from "./shipping-screen";
import { DiscountsScreen } from "./discounts-screen";
import { CartRecoveryScreen } from "./cart-recovery-screen";
import { BundlesScreen } from "./bundles-screen";
import { PixelsScreen } from "./pixels-screen";
import { LoyaltyScreen } from "./loyalty-screen";
import { FreeGiftScreen } from "./free-gift-screen";
import { OrderStatusScreen } from "./order-status-screen";
import { CustomPagesScreen } from "./custom-pages-screen";
import { NavBuilderScreen } from "./nav-builder-screen";
import { I18nScreen } from "./i18n-screen";

export interface SystemScreenRouterProps {
    screen: SettingsSectionId;
    builder: UseStoreBuilderV2Return;
    tenantId: string;
    onClose: () => void;
    onBrandKitChange: (kit: BrandKit) => void;
    /** Custom-pages screen "edit sections" jump (also used by the tree). */
    onSelectCustomPage: (id: string) => void;
    /** I18n screen deep-jumps back into the canvas. */
    onI18nSelectPage: (page: PageId) => void;
    onI18nSelectSection: (page: PageId, sectionId: string) => void;
}

export function SystemScreenRouter({
    screen,
    builder,
    tenantId,
    onClose,
    onBrandKitChange,
    onSelectCustomPage,
    onI18nSelectPage,
    onI18nSelectSection,
}: SystemScreenRouterProps): React.ReactElement {
    return (
        <>
            {/* O2: system screens replace the canvas — give the
                merchant a persistent "you are here" + way back. */}
            <div
                data-testid="system-screen-breadcrumb"
                className="flex h-10 shrink-0 items-center gap-2 border-b border-(--card-border) bg-(--background-soft) px-4"
            >
                <button
                    type="button"
                    data-testid="system-screen-back"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(STRINGS.toolbar.back_to_canvas, builder.active_locale)}
                </button>
                <span aria-hidden="true" className="text-muted-foreground/50">
                    /
                </span>
                <span className="truncate text-xs font-semibold text-foreground">
                    {getSettingLabel(screen, builder.active_locale)}
                </span>
            </div>
            {screen === "brand_kit" ? (
                <BrandKitEditor
                    value={builder.config.brand_kit}
                    onChange={onBrandKitChange}
                    tenantId={tenantId}
                />
            ) : screen === "versions" ? (
                <VersionHistoryScreen builder={builder} onClose={onClose} />
            ) : screen === "scheduled" ? (
                <ScheduledChangesScreen builder={builder} onClose={onClose} />
            ) : screen === "segments" ? (
                <SegmentsScreen builder={builder} onClose={onClose} />
            ) : screen === "experiments" ? (
                <ExperimentsScreen builder={builder} onClose={onClose} />
            ) : screen === "i18n" ? (
                <I18nScreen
                    config={builder.config}
                    onSelectPage={onI18nSelectPage}
                    onSelectSection={onI18nSelectSection}
                    onClose={onClose}
                />
            ) : screen === "shipping" ? (
                <ShippingScreen builder={builder} onClose={onClose} />
            ) : screen === "discounts" ? (
                <DiscountsScreen builder={builder} onClose={onClose} />
            ) : screen === "cart_recovery" ? (
                <CartRecoveryScreen builder={builder} onClose={onClose} />
            ) : screen === "bundles" ? (
                <BundlesScreen builder={builder} onClose={onClose} />
            ) : screen === "pixels" ? (
                <PixelsScreen builder={builder} onClose={onClose} />
            ) : screen === "loyalty" ? (
                <LoyaltyScreen builder={builder} onClose={onClose} />
            ) : screen === "free_gift" ? (
                <FreeGiftScreen builder={builder} onClose={onClose} />
            ) : screen === "order_status" ? (
                <OrderStatusScreen builder={builder} onClose={onClose} />
            ) : screen === "custom_pages" ? (
                <CustomPagesScreen
                    builder={builder}
                    onClose={onClose}
                    onEditSections={onSelectCustomPage}
                />
            ) : screen === "nav" ? (
                <NavBuilderScreen builder={builder} onClose={onClose} />
            ) : (
                // "redirects" — the only remaining member. "health" never
                // reaches here: handleSelectSetting routes it to the
                // inspector tab and the ?screen= whitelist excludes it.
                <RedirectsScreen builder={builder} onClose={onClose} />
            )}
        </>
    );
}
