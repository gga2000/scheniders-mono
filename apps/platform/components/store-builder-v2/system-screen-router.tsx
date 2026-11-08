"use client";

// =====================================================================
// SystemScreenRouter (extracted from editor-shell, 4.1)
// =====================================================================
// Renders the full-screen settings screen (each brings its own ScreenHeader) that
// replaces the canvas when a tree "setting" is selected (brand kit,
// versions, experiments, shipping…). Pure routing — every screen keeps
// its own state; the shell owns which screen is open.
// =====================================================================

import type { PageId } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import type { BrandKit } from "@scheniders/shared";
import type { SettingsSectionId } from "./page-tree";
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
import { OrderStatusScreen } from "./order-status-screen";
import { FreeGiftScreen } from "./free-gift-screen";
import { TemplateUpdatesScreen } from "./template-updates-screen";
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
    /** The number the storefront's order tracker fills `{contact}` with. */
    trackingContact: string | null;
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
    trackingContact,
}: SystemScreenRouterProps): React.ReactElement {
    return (
        <>
            {screen === "brand_kit" ? (
                <BrandKitEditor
                    value={builder.config.brand_kit}
                    onChange={onBrandKitChange}
                    tenantId={tenantId}
                    onClose={onClose}
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
            ) : screen === "order_status" ? (
                <OrderStatusScreen builder={builder} contact={trackingContact} onClose={onClose} />
            ) : screen === "free_gift" ? (
                <FreeGiftScreen builder={builder} onClose={onClose} />
            ) : screen === "template_updates" ? (
                <TemplateUpdatesScreen builder={builder} onClose={onClose} />
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
