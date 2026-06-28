"use client";

import { useEffect, useState } from "react";
import type { CustomPage, LocaleCode, PageId } from "@scheniders/shared";
import { resolveI18n } from "@scheniders/shared";
import {
    Ban,
    BookOpen,
    Calendar,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    EyeOff,
    Plus,
    CreditCard,
    FlaskConical,
    FolderOpen,
    Heart,
    HelpCircle,
    History,
    Home,
    Languages,
    Lock,
    Package,
    Palette,
    Phone,
    RotateCcw,
    Scroll,
    Search,
    ShoppingBag,
    ShoppingCart,
    Signpost,
    Ticket,
    Boxes,
    BarChart3,
    Award,
    FileText,
    Menu,
    Truck,
    Users,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";

/* ─────────────────────────────────────────────────────────────────── */
/* Tree definition                                                      */
/* ─────────────────────────────────────────────────────────────────── */

interface PageNode {
    id: PageId;
    icon: LucideIcon;
    /** Editor-locale-aware label resolver. */
    labelKey: keyof typeof STRINGS.page_tree;
    /** Original English label, used by getPageLabel for back-compat. */
    label: string;
}

interface PageGroup {
    group: string;
    groupKey: keyof typeof STRINGS.page_tree;
    items: PageNode[];
}

export const TREE: PageGroup[] = [
    {
        group: "Storefront",
        groupKey: "group_storefront",
        items: [{ id: "home", icon: Home, labelKey: "page_home", label: "Home" }],
    },
    {
        group: "Shop",
        groupKey: "group_shop",
        items: [
            { id: "category", icon: FolderOpen, labelKey: "page_category", label: "Category" },
            { id: "product", icon: ShoppingBag, labelKey: "page_product", label: "Product detail" },
            { id: "search", icon: Search, labelKey: "page_search", label: "Search" },
        ],
    },
    {
        group: "Order",
        groupKey: "group_order",
        items: [
            { id: "cart", icon: ShoppingCart, labelKey: "page_cart", label: "Cart" },
            { id: "checkout", icon: CreditCard, labelKey: "page_checkout", label: "Checkout" },
            { id: "checkout_success", icon: CheckCircle2, labelKey: "page_checkout_success", label: "Thank you" },
            { id: "track", icon: Package, labelKey: "page_track", label: "Track order" },
        ],
    },
    {
        group: "Pages",
        groupKey: "group_pages",
        items: [
            { id: "about", icon: BookOpen, labelKey: "page_about", label: "About" },
            { id: "faq", icon: HelpCircle, labelKey: "page_faq", label: "FAQ" },
            { id: "contact", icon: Phone, labelKey: "page_contact", label: "Contact" },
        ],
    },
    {
        group: "Policies",
        groupKey: "group_policies",
        items: [
            { id: "policy_shipping", icon: Truck, labelKey: "page_policy_shipping", label: "Shipping" },
            { id: "policy_returns", icon: RotateCcw, labelKey: "page_policy_returns", label: "Returns" },
            { id: "policy_privacy", icon: Lock, labelKey: "page_policy_privacy", label: "Privacy" },
            { id: "policy_terms", icon: Scroll, labelKey: "page_policy_terms", label: "Terms" },
        ],
    },
    {
        group: "System",
        groupKey: "group_system",
        items: [{ id: "not_found", icon: Ban, labelKey: "page_not_found", label: "404" }],
    },
];

/** Look up a page's human label from the tree. Falls back to the id.
 *  Optional `locale` resolves to the localized label; omitting it
 *  preserves the historical English-only behaviour callers depend on. */
export function getPageLabel(id: PageId, locale?: LocaleCode): string {
    for (const group of TREE) {
        for (const item of group.items) {
            if (item.id === id) {
                if (locale) return t(STRINGS.page_tree[item.labelKey], locale);
                return item.label;
            }
        }
    }
    return id;
}

/** Settings section ids (not PageId — distinct namespace). */
export type SettingsSectionId =
    | "brand_kit"
    | "experiments"
    | "segments"
    | "scheduled"
    | "versions"
    | "health"
    | "i18n"
    | "shipping"
    | "discounts"
    | "bundles"
    | "cart_recovery"
    | "pixels"
    | "loyalty"
    | "custom_pages"
    | "nav"
    | "redirects";

interface SettingsNode {
    id: SettingsSectionId;
    icon: LucideIcon;
    labelKey: keyof typeof STRINGS.page_tree;
    label: string;
}

// Primary settings — always visible at the top of the Settings group.
const PRIMARY_SETTINGS: SettingsNode[] = [
    { id: "brand_kit", icon: Palette, labelKey: "setting_brand_kit", label: "Style & branding" },
    { id: "health", icon: Heart, labelKey: "setting_health", label: "Store health" },
    { id: "i18n", icon: Languages, labelKey: "setting_i18n", label: "Languages" },
];

// Advanced settings — collapsed by default, persisted in localStorage.
const ADVANCED_SETTINGS: SettingsNode[] = [
    { id: "segments", icon: Users, labelKey: "setting_segments", label: "Audiences" },
    { id: "experiments", icon: FlaskConical, labelKey: "setting_experiments", label: "A/B tests" },
    { id: "scheduled", icon: Calendar, labelKey: "setting_scheduled", label: "Scheduled changes" },
    { id: "shipping", icon: Truck, labelKey: "setting_shipping", label: "Shipping rates" },
    { id: "discounts", icon: Ticket, labelKey: "setting_discounts", label: "Discount codes" },
    { id: "bundles", icon: Boxes, labelKey: "setting_bundles", label: "Bundles" },
    { id: "cart_recovery", icon: ShoppingCart, labelKey: "setting_cart_recovery", label: "Cart recovery" },
    { id: "pixels", icon: BarChart3, labelKey: "setting_pixels", label: "Pixels & tracking" },
    { id: "loyalty", icon: Award, labelKey: "setting_loyalty", label: "Loyalty points" },
    { id: "custom_pages", icon: FileText, labelKey: "setting_custom_pages", label: "Custom pages" },
    { id: "nav", icon: Menu, labelKey: "setting_nav", label: "Navigation" },
    { id: "versions", icon: History, labelKey: "setting_versions", label: "Past versions" },
    { id: "redirects", icon: Signpost, labelKey: "setting_redirects", label: "Redirects" },
];

const ADVANCED_OPEN_KEY = "schneiders.builder.advanced.open";

/* Group + setting → tinted icon-tile class (see `.sb-tile--*` in globals.css).
 * Coloring nav icons by store-area makes the rail scannable and mirrors the
 * inspector's tile language for left/right symmetry. */
function groupTintClass(group: string): string {
    switch (group) {
        case "Storefront":
            return "sb-tile--hero";
        case "Shop":
            return "sb-tile--products";
        case "Order":
            return "sb-tile--trust";
        case "Pages":
            return "sb-tile--content";
        default:
            return "sb-tile--page";
    }
}

const SETTING_TINT: Record<SettingsSectionId, string> = {
    brand_kit: "sb-tile--products",
    health: "sb-tile--story",
    i18n: "sb-tile--hero",
    segments: "sb-tile--trust",
    experiments: "sb-tile--conversion",
    scheduled: "sb-tile--content",
    shipping: "sb-tile--trust",
    discounts: "sb-tile--conversion",
    bundles: "sb-tile--conversion",
    cart_recovery: "sb-tile--conversion",
    pixels: "sb-tile--page",
    loyalty: "sb-tile--conversion",
    custom_pages: "sb-tile--page",
    nav: "sb-tile--page",
    versions: "sb-tile--page",
    redirects: "sb-tile--trust",
};

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export interface PageTreeProps {
    active: PageId;
    onSelect: (page: PageId) => void;
    onSelectSetting?: (id: SettingsSectionId) => void;
    /**
     * Optional per-page section counts. When provided, each tree row
     * shows a small numeric badge so merchants can see at a glance which
     * pages still need content.
     */
    sectionCounts?: Partial<Record<PageId, number>>;
    /** Override the editor locale (otherwise read from EditorLocaleContext). */
    activeLocale?: LocaleCode;
    /** Merchant-authored custom pages (E4). When provided, a selectable
     *  "Custom pages" group is rendered below the system pages. */
    customPages?: CustomPage[];
    /** Id of the custom page currently being authored (null = a system page). */
    activeCustomPageId?: string | null;
    /** Select a custom page → author its sections in the canvas. */
    onSelectCustomPage?: (id: string) => void;
    /** Open the custom-pages manager (create / slug / hide / delete). */
    onManageCustomPages?: () => void;
}

export function PageTree({
    active,
    onSelect,
    onSelectSetting,
    sectionCounts,
    activeLocale,
    customPages,
    activeCustomPageId,
    onSelectCustomPage,
    onManageCustomPages,
}: PageTreeProps) {
    const locale = useResolvedEditorLocale(activeLocale);
    const [comingSoon, setComingSoon] = useState<SettingsSectionId | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

    // Hydrate Advanced open state from localStorage.
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const stored = window.localStorage.getItem(ADVANCED_OPEN_KEY);
            if (stored === "true") setAdvancedOpen(true);
        } catch {
            /* ignore */
        }
    }, []);

    const toggleAdvanced = (): void => {
        setAdvancedOpen((curr) => {
            const next = !curr;
            try {
                if (typeof window !== "undefined") {
                    window.localStorage.setItem(
                        ADVANCED_OPEN_KEY,
                        next ? "true" : "false",
                    );
                }
            } catch {
                /* ignore */
            }
            return next;
        });
    };

    const handleSetting = (id: SettingsSectionId) => {
        if (onSelectSetting) {
            onSelectSetting(id);
            return;
        }
        setComingSoon(id);
        setTimeout(() => setComingSoon((curr) => (curr === id ? null : curr)), 2000);
    };

    const renderSettingButton = (item: SettingsNode): React.ReactElement => {
        const Icon = item.icon;
        return (
            <li key={item.id}>
                <button
                    type="button"
                    data-testid={`page-tree-setting-${item.id}`}
                    onClick={() => handleSetting(item.id)}
                    className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-foreground/75 transition-all duration-150 hover:bg-black/3 hover:text-foreground"
                >
                    <span
                        aria-hidden="true"
                        className={cn("sb-tile flex h-7 w-7 shrink-0", SETTING_TINT[item.id])}
                    >
                        <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate">{t(STRINGS.page_tree[item.labelKey], locale)}</span>
                    {comingSoon === item.id && (
                        <span className="ml-auto text-[9px] uppercase tracking-wide text-muted-foreground/70">
                            {t(STRINGS.page_tree.coming_soon, locale)}
                        </span>
                    )}
                </button>
            </li>
        );
    };

    return (
        <nav
            aria-label={t(STRINGS.page_tree.aria_label, locale)}
            data-testid="page-tree"
            className="sb-glass flex w-[264px] shrink-0 flex-col overflow-y-auto border-r border-(--card-border) text-sm"
        >
            <div className="p-3">
                {TREE.map((group) => (
                    <div key={group.group} className="mb-4">
                        <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {t(STRINGS.page_tree[group.groupKey], locale)}
                        </div>
                        <ul className="space-y-0.5">
                            {group.items.map((item) => {
                                const isActive = item.id === active;
                                const count = sectionCounts?.[item.id];
                                const Icon = item.icon;
                                return (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            data-testid={`page-tree-item-${item.id}`}
                                            onClick={() => onSelect(item.id)}
                                            className={cn(
                                                "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150",
                                                isActive
                                                    ? "sb-active-bar bg-background font-semibold text-foreground shadow-(--card-shadow)"
                                                    : "text-foreground/75 hover:bg-black/3 hover:text-foreground",
                                            )}
                                            aria-current={isActive ? "page" : undefined}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    "sb-tile flex h-7 w-7 shrink-0",
                                                    groupTintClass(group.group),
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                            </span>
                                            <span className="truncate">{t(STRINGS.page_tree[item.labelKey], locale)}</span>
                                            {typeof count === "number" && count > 0 && (
                                                <span
                                                    data-testid={`page-tree-count-${item.id}`}
                                                    className={cn(
                                                        "ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums transition-colors",
                                                        isActive
                                                            ? "bg-foreground/10 text-foreground"
                                                            : "bg-black/5 text-muted-foreground group-hover:bg-black/10",
                                                    )}
                                                >
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}

                {/* Custom pages (E4) — selectable; authored in the canvas. */}
                {onSelectCustomPage && (
                    <div className="mb-4">
                        <div className="mb-1.5 flex items-center justify-between px-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                {t(STRINGS.page_tree.group_custom_pages, locale)}
                            </span>
                            {onManageCustomPages && (
                                <button
                                    type="button"
                                    data-testid="page-tree-custom-manage"
                                    aria-label={t(
                                        STRINGS.page_tree.manage_custom_pages,
                                        locale,
                                    )}
                                    onClick={onManageCustomPages}
                                    className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        <ul className="space-y-0.5">
                            {(customPages ?? []).map((p) => {
                                const isActive = p.id === activeCustomPageId;
                                const label =
                                    resolveI18n(p.title, locale).trim() || p.slug;
                                return (
                                    <li key={p.id}>
                                        <button
                                            type="button"
                                            data-testid={`page-tree-custom-${p.id}`}
                                            onClick={() => onSelectCustomPage(p.id)}
                                            aria-current={isActive ? "page" : undefined}
                                            className={cn(
                                                "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150",
                                                isActive
                                                    ? "sb-active-bar bg-background font-semibold text-foreground shadow-(--card-shadow)"
                                                    : "text-foreground/75 hover:bg-black/3 hover:text-foreground",
                                                p.hidden && !isActive && "opacity-60",
                                            )}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="sb-tile sb-tile--page flex h-7 w-7 shrink-0"
                                            >
                                                <FileText className="h-4 w-4" />
                                            </span>
                                            <span className="truncate">{label}</span>
                                            {p.hidden && (
                                                <EyeOff
                                                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {p.sections.length > 0 && (
                                                <span
                                                    data-testid={`page-tree-custom-count-${p.id}`}
                                                    className={cn(
                                                        "ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
                                                        isActive
                                                            ? "bg-foreground/10 text-foreground"
                                                            : "bg-black/5 text-muted-foreground group-hover:bg-black/10",
                                                    )}
                                                >
                                                    {p.sections.length}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                            {(customPages ?? []).length === 0 && onManageCustomPages && (
                                <li>
                                    <button
                                        type="button"
                                        data-testid="page-tree-custom-empty"
                                        onClick={onManageCustomPages}
                                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-muted-foreground transition-colors hover:bg-black/3 hover:text-foreground"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-(--card-border)"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </span>
                                        <span className="truncate">
                                            {t(STRINGS.page_tree.add_custom_page, locale)}
                                        </span>
                                    </button>
                                </li>
                            )}
                        </ul>
                    </div>
                )}
            </div>

            <div className="mt-auto border-t border-(--card-border) p-3">
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
                    {t(STRINGS.page_tree.settings_heading, locale)}
                </div>
                <ul className="space-y-0.5">
                    {PRIMARY_SETTINGS.map(renderSettingButton)}

                    {/* Advanced (collapsed accordion) */}
                    <li>
                        <button
                            type="button"
                            data-testid="page-tree-advanced-toggle"
                            aria-expanded={advancedOpen}
                            onClick={toggleAdvanced}
                            className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-foreground/70 transition-all duration-150 hover:bg-black/3 hover:text-foreground"
                        >
                            {advancedOpen ? (
                                <ChevronDown
                                    className="h-3.5 w-3.5 text-current"
                                    aria-hidden="true"
                                />
                            ) : (
                                <ChevronRight
                                    className="h-3.5 w-3.5 text-current"
                                    aria-hidden="true"
                                />
                            )}
                            <span className="truncate text-[11px] font-semibold uppercase tracking-wide">
                                {t(STRINGS.page_tree.advanced_heading, locale)}
                            </span>
                        </button>
                        {advancedOpen && (
                            <ul
                                data-testid="page-tree-advanced-list"
                                className="mt-0.5 space-y-0.5 pl-3"
                            >
                                {ADVANCED_SETTINGS.map(renderSettingButton)}
                            </ul>
                        )}
                    </li>
                </ul>
            </div>
        </nav>
    );
}
