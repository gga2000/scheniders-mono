"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Redo2, Smartphone, Store, Undo2 } from "lucide-react";
import {
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import type {
    BrandKit,
    Breakpoint,
    CheckResult,
    LocaleCode,
    PageConfig,
    PageId,
    PageMeta,
    RuntimeContext,
    SectionInstance,
    StoreConfigV2,
} from "@scheniders/shared";
import type {
    Product as SectionProduct,
    Category as SectionCategory,
} from "@scheniders/sections";
import {
    useStoreBuilderV2,
    type UseStoreBuilderV2Return,
} from "@/hooks/use-store-builder-v2";
import { useIframeBridge } from "@/hooks/use-iframe-bridge";
import { useStorefrontUrl } from "@/hooks/use-storefront-url";
import { getManifestEntry } from "@/lib/sections-manifest";
import { PageTree, getPageLabel, type SettingsSectionId } from "./page-tree";
import { PreviewModal } from "./preview-modal";
import {
    PreviewOverlay,
    type PreviewOverlayAction,
    type PreviewOverlayContextMenu,
} from "./preview-overlay";
import type { LivePreviewContextMenuAction } from "./live-preview-context-menu";
import {
    BreakpointToggle,
    LocaleSelect,
    PublishButton,
    SaveStatePill,
} from "./toolbar-controls";
import {
    PreviewAsControls,
    EMPTY_PREVIEW_AS,
    type PreviewAsState,
} from "./preview-as-controls";
import { PreviewFrame } from "./preview-frame";
import { BrandKitEditor } from "./brand-kit-editor";
import { SectionPicker } from "./section-picker";
import { PageTemplatePicker } from "./page-template-picker";
import { useSectionPresets } from "@/hooks/use-section-presets";
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
import { CustomPagesScreen } from "./custom-pages-screen";
import { NavBuilderScreen } from "./nav-builder-screen";
import { I18nScreen, I18nToolbarPill } from "./i18n-screen";
import { InspectorRail, type InspectorTab } from "./inspector-rail";
import { EditorLocaleProvider } from "@/lib/editor-locale-context";
import { PublishConfirmSheet } from "./publish-confirm-sheet";
import {
    runHealthChecks,
    blockingChecks,
    activePageSections,
    withActivePageSections,
    withActivePageMeta,
    customPageIndexById,
    type EditTarget,
} from "@scheniders/shared";
import { useIsMobileEditor } from "@/hooks/use-is-mobile-editor";
import {
    MobileEditorShell,
    MobileDesktopOnlyStub,
} from "./mobile-editor-shell";
import { SectionEditPanel } from "./section-edit-panel";

/* ─────────────────────────────────────────────────────────────────── */
/* Tenant prop (what the page passes in)                                */
/* ─────────────────────────────────────────────────────────────────── */

export interface EditorShellTenant {
    id: string;
    slug: string;
    business_name: string;
}

export interface EditorShellProps {
    tenant: EditorShellTenant;
    initialConfig: StoreConfigV2;
    /**
     * Last-published config (or null if the store has never been
     * published). Used to drive the "Changes since last publish" diff
     * inside `PublishConfirmSheet`. When null, the sheet shows
     * "First publish — everything is new." copy.
     */
    publishedConfig?: StoreConfigV2 | null;
    hasPublished: boolean;
    initiallyDirty?: boolean;
    /** EC33: DB `updated_at` (epoch ms) — gates stale crash-backup recovery. */
    initialUpdatedAt?: number | null;
    /** BUG25: published rev at hydration — publish rejects on a stale base. */
    initialRev?: number;
    /**
     * Short-lived HMAC-signed preview token for the iframe. Minted
     * server-side from `PREVIEW_TOKEN_SECRET` with a 1h TTL, scoped to
     * this tenant. Optional so tests can omit it (a dev fallback token
     * is used in that case).
     */
    previewToken?: string;
    /** Real catalog data for the inline preview. Empty arrays render empty
     * states; passing them makes product/category sections look real. */
    previewProducts?: SectionProduct[];
    previewCategories?: SectionCategory[];
    /** Test-only — inject a pre-built hook return to bypass live state. */
    builderOverride?: UseStoreBuilderV2Return;
    /** Test-only — override the storefront URL (no live query). */
    storefrontUrlOverride?: string;
    /**
     * Optional callback fired when the merchant clicks "Edit" on a
     * section row. Agent H wires this to open the section edit panel;
     * for now the default just logs.
     */
    onEditSection?: (id: string) => void;
    /**
     * Test-only override for the initial system screen. When omitted,
     * first-time tenants land on the health screen and returning ones
     * land on the live preview.
     */
    initialSystemScreen?: SettingsSectionId | null;
    /**
     * Deep-link target (from the Command Center "Fix"/"Edit" links). On mount
     * the editor switches to this page and, if given, selects + opens the
     * section for editing. See BUG36.
     */
    initialPageId?: PageId | null;
    initialSectionId?: string | null;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Storefront preview URL builder                                       */
/* ─────────────────────────────────────────────────────────────────── */

// Local-dev fallback when no token is plumbed through (tests / harnesses).
const DEV_PREVIEW_TOKEN = "dev-preview-token";

function buildPreviewUrl(
    base: string,
    tenantSlug: string,
    page: string,
    breakpoint: string,
    locale: string,
    token: string,
): string {
    // Strip any tenant-suffix the storefront URL helper may have appended
    // and target the dedicated preview route under the storefront origin.
    let origin = base;
    try {
        const parsed = new URL(base);
        origin = parsed.origin;
    } catch {
        // Treat as already-an-origin.
    }
    const params = new URLSearchParams({
        token,
        page,
        breakpoint,
        locale,
    });
    return `${origin}/_preview/${tenantSlug}?${params.toString()}`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Shell                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export function EditorShell(props: EditorShellProps): React.ReactElement {
    const {
        tenant,
        initialConfig,
        publishedConfig,
        hasPublished,
        initiallyDirty,
        initialUpdatedAt,
        initialRev,
        previewToken,
        previewProducts,
        previewCategories,
        builderOverride,
        storefrontUrlOverride,
        onEditSection,
        initialSystemScreen,
        initialPageId,
        initialSectionId,
    } = props;

    const activePreviewToken = previewToken ?? DEV_PREVIEW_TOKEN;

    // Always call hooks (Rules of Hooks). The override path simply ignores
    // the live builder/url and is intended only for tests.
    const liveBuilder = useStoreBuilderV2({
        tenantId: tenant.id,
        slug: tenant.slug,
        initialConfig,
        hasPublished,
        initiallyDirty,
        initialUpdatedAt,
        initialRev,
    });
    const liveStorefrontUrl = useStorefrontUrl(tenant.slug, tenant.id);

    const builder = builderOverride ?? liveBuilder;
    const storefrontUrl = storefrontUrlOverride ?? liveStorefrontUrl;

    // Which system screen (if any) replaces the live preview frame.
    // First-time tenants previously landed on the Health screen. With
    // Builder v2 the Inspector rail's Health tab plus the FirstRunBanner
    // surface launch readiness inline, so we open the canvas by default.
    const isFirstTimeTenant = useMemo<boolean>(() => {
        if (!hasPublished) return true;
        const home = initialConfig.pages.find((p) => p.page_id === "home");
        return (home?.sections.length ?? 0) === 0;
    }, [hasPublished, initialConfig]);
    const [system_screen, set_system_screen] = useState<SettingsSectionId | null>(
        initialSystemScreen !== undefined ? initialSystemScreen : null,
    );

    // Inspector rail tab (Blocks / Style / Health).
    const [inspector_tab, set_inspector_tab] = useState<InspectorTab>("blocks");

    // Publish confirm sheet state.
    const [publish_sheet_open, set_publish_sheet_open] = useState<boolean>(false);

    // Section picker open state.
    const [picker_open, set_picker_open] = useState<boolean>(false);
    // When the picker opens via the canvas-side `+` button, stash the
    // insertion index so the dropped section lands at that position.
    // `null` means "append to the end" (the existing default).
    const [picker_insert_at, set_picker_insert_at] = useState<number | null>(
        null,
    );

    // Page-template picker open state.
    const [template_picker_open, set_template_picker_open] = useState<boolean>(false);

    // Section presets (per-tenant library, surfaced in the picker + kebab).
    const sectionPresets = useSectionPresets(tenant.id);

    // Currently editing section (null = show the section list panel).
    const [editing_section_id, set_editing_section_id] = useState<string | null>(null);

    // Currently selected section (click-to-edit overlay highlight).
    const [selected_section_id, set_selected_section_id] = useState<string | null>(null);

    // Open right-click context menu over the iframe preview (null = closed).
    const [preview_context_menu, set_preview_context_menu] =
        useState<PreviewOverlayContextMenu | null>(null);

    // "Preview as" simulator state — drives runtime context to test variants.
    const [preview_as, set_preview_as] = useState<PreviewAsState>(EMPTY_PREVIEW_AS);

    /* ── Iframe bridge + overlay plumbing ─────────────────────────── */

    const iframe_ref = useRef<HTMLIFrameElement | null>(null);
    const preview_container_ref = useRef<HTMLDivElement | null>(null);
    // True while a spacing-drag is streaming transient configs to the iframe —
    // pauses config-push so the committed config doesn't overwrite the preview.
    const spacing_dragging_ref = useRef<boolean>(false);
    const bridge = useIframeBridge(iframe_ref);
    const [iframe_bounds, set_iframe_bounds] = useState<DOMRect | null>(null);

    // Track the iframe's bounding rect so the overlay can position itself
    // in the editor viewport. We use a ResizeObserver on the iframe plus
    // resize listener on window to keep this fresh.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const iframe = iframe_ref.current;
        const container = preview_container_ref.current;
        if (!iframe || !container) return;
        const update = (): void => {
            const r = iframe.getBoundingClientRect();
            const c = container.getBoundingClientRect();
            // Translate to coords relative to the overlay's parent (the
            // preview container), so the overlay can use absolute pos.
            set_iframe_bounds(
                new DOMRect(r.left - c.left, r.top - c.top, r.width, r.height),
            );
        };
        update();
        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(update);
            ro.observe(iframe);
            ro.observe(container);
        }
        window.addEventListener("resize", update);
        return () => {
            ro?.disconnect();
            window.removeEventListener("resize", update);
        };
    }, [system_screen, builder.active_breakpoint]);

    // Subscribe to iframe clicks → mark selected.
    useEffect(() => {
        return bridge.onSectionClicked((e) => {
            set_selected_section_id(e.section_id);
        });
    }, [bridge]);

    // Subscribe to iframe right-clicks → select the section + open the menu at
    // the iframe-local coords the bridge reported.
    useEffect(() => {
        return bridge.onContextMenu((e) => {
            set_selected_section_id(e.section_id);
            set_preview_context_menu({
                section_id: e.section_id,
                x: e.x,
                y: e.y,
            });
        });
    }, [bridge]);

    // Ask the iframe for every section's rect so the overlay can place the
    // insert-`+` gaps. Re-request (debounced) whenever the section list,
    // page, or breakpoint changes, and on scroll (via the new `bridge`
    // identity each render → `state.scroll_y` change).
    useEffect(() => {
        if (!bridge.state.ready) return;
        const t = setTimeout(() => bridge.requestAllRects(), 150);
        return () => clearTimeout(t);
    }, [
        bridge,
        builder.config,
        builder.active_page,
        builder.active_breakpoint,
    ]);

    // Mirror the editor's selection into the iframe so the bridge knows which
    // section's text is inline-editable and which to outline. Deduped via a
    // ref so we don't re-post on every render.
    const last_posted_selection_ref = useRef<string | null | undefined>(
        undefined,
    );
    useEffect(() => {
        if (!bridge.state.ready) return;
        if (last_posted_selection_ref.current === selected_section_id) return;
        last_posted_selection_ref.current = selected_section_id;
        bridge.setSelectedSection(selected_section_id);
    }, [selected_section_id, bridge]);

    /* ── Live preview: push config + runtime to the iframe ─────────── */
    //
    // Webflow / Framer pattern: the editor owns the in-memory config and
    // streams it into the iframe via postMessage. The iframe-side
    // `SchneidersPreviewLiveRenderer` swaps state on each message — no
    // reload required. We debounce (~100ms) so fast typing doesn't
    // hammer postMessage, and we only push when the bridge has emitted
    // `ready` (otherwise the iframe handler isn't mounted yet).
    useEffect(() => {
        if (!bridge.state.ready) return;
        // While an inline edit is in flight the contenteditable in the iframe
        // is authoritative — pushing a config update would re-render the
        // section and reset the caret. We resume (and push the latest config)
        // when `inline_editing` flips back to false, since it's in the deps.
        if (bridge.state.inline_editing) return;
        // While a spacing-drag streams transient configs, don't clobber them
        // with the committed config (resumes on the commit's setConfig).
        if (spacing_dragging_ref.current) return;
        const handle = setTimeout(() => {
            const page = builder.config.pages.find(
                (p) => p.page_id === builder.active_page,
            );
            if (page) {
                bridge.postPageConfigUpdate(page as PageConfig);
            }
            const runtime: RuntimeContext = {
                page_id: builder.active_page,
                breakpoint: builder.active_breakpoint,
                locale: builder.active_locale,
                audience_segments: preview_as.segments,
                ab_test_arms: preview_as.ab_arms,
                governorate: preview_as.governorate,
                product_id: undefined,
                category_id: undefined,
                now: new Date(),
            };
            bridge.postRuntimeUpdate(runtime);
        }, 100);
        return () => clearTimeout(handle);
    }, [
        builder.config,
        builder.active_page,
        builder.active_breakpoint,
        builder.active_locale,
        preview_as,
        bridge,
    ]);

    /* ── Page navigation: full reload of the iframe ───────────────── */
    //
    // When the merchant switches `active_page`, the iframe needs to
    // re-fetch page-specific server data (products on Home, a specific
    // product on PDP, etc.). The cleanest fix: send the new URL and let
    // the iframe `location.replace` to it. After reload, the bridge
    // re-establishes and live updates resume from the new page.
    //
    // The very first time we see a page (including the initial one on
    // mount) we just record it — the iframe is already on that URL, so
    // navigating would be a wasted reload. Only subsequent changes fire
    // `page_id_change`.
    const last_pushed_page_ref = useRef<PageId | null>(null);
    useEffect(() => {
        if (last_pushed_page_ref.current === null) {
            last_pushed_page_ref.current = builder.active_page;
            return;
        }
        if (last_pushed_page_ref.current === builder.active_page) return;
        // Wait for `ready` WITHOUT advancing the ref — otherwise a page switch
        // during the ~1s before the bridge is ready would strand the iframe on
        // the old page (the ref would already match `active_page`, so the
        // ready-triggered re-run would skip the navigation). This effect
        // re-runs when `ready` flips because `bridge` is in its deps.
        if (!bridge.state.ready) return;
        last_pushed_page_ref.current = builder.active_page;
        // Build the URL inline (rather than reading `previewUrlRef`) so
        // we never race the ref-sync effect, which commits in its own
        // declaration order.
        const nextUrl = buildPreviewUrl(
            storefrontUrl,
            tenant.slug,
            builder.active_page,
            builder.active_breakpoint,
            builder.active_locale,
            activePreviewToken,
        );
        bridge.postPageIdChange(nextUrl);
    }, [
        builder.active_page,
        builder.active_breakpoint,
        builder.active_locale,
        storefrontUrl,
        tenant.slug,
        bridge,
        activePreviewToken,
    ]);

    const handleSelectSetting = useCallback(
        (id: SettingsSectionId): void => {
            // Health is hosted inside the Inspector rail's Health tab.
            // Clicking "Health" in the page tree just switches the rail
            // tab — no full-screen replacement.
            if (id === "health") {
                set_system_screen(null);
                set_inspector_tab("health");
                return;
            }
            // Brand Kit retains the existing full-screen path for now —
            // the Inspector's Style tab is a quicker alternative but the
            // full editor is richer.
            if (
                id === "brand_kit" ||
                id === "versions" ||
                id === "scheduled" ||
                id === "segments" ||
                id === "experiments" ||
                id === "i18n" ||
                id === "shipping" ||
                id === "discounts" ||
                id === "bundles" ||
                id === "cart_recovery" ||
                id === "pixels" ||
                id === "loyalty" ||
                id === "custom_pages" ||
                id === "nav" ||
                id === "redirects"
            ) {
                set_system_screen(id);
            } else {
                // All SettingsSectionId members are handled above; this guard
                // turns a future unhandled id into a compile error instead of a
                // silent no-op.
                const _exhaustive: never = id;
                void _exhaustive;
            }
        },
        [],
    );

    const handleCloseSystemScreen = useCallback((): void => {
        set_system_screen(null);
    }, []);

    const handleSelectPage = useCallback(
        (page: Parameters<typeof builder.set_active_page>[0]): void => {
            set_system_screen(null);
            builder.set_active_page(page);
        },
        [builder],
    );

    const handleBrandKitChange = useCallback(
        (next: BrandKit): void => {
            builder.setConfig((prev) => ({ ...prev, brand_kit: next }));
        },
        [builder],
    );

    /* ── Section list <-> config plumbing ─────────────────────────── */

    // The page the canvas is currently authoring — a system PageId or a
    // custom page (E4). All section/meta mutations route through this.
    const editTarget = useMemo<EditTarget>(
        () =>
            builder.active_custom_page_id
                ? { kind: "custom", id: builder.active_custom_page_id }
                : { kind: "system", page_id: builder.active_page },
        [builder.active_custom_page_id, builder.active_page],
    );

    const activeSections = useMemo<SectionInstance[]>(
        () => activePageSections(builder.config, editTarget),
        [builder.config, editTarget],
    );

    /** Per-page counts → badge in the tree. */
    const sectionCounts = useMemo<Partial<Record<PageId, number>>>(() => {
        const out: Partial<Record<PageId, number>> = {};
        for (const p of builder.config.pages) {
            out[p.page_id] = p.sections.length;
        }
        return out;
    }, [builder.config.pages]);

    const handleSectionsChange = useCallback(
        (next: SectionInstance[]): void => {
            builder.setConfig((prev) =>
                withActivePageSections(prev, editTarget, () => next),
            );
        },
        [builder, editTarget],
    );

    // The active page's SEO meta (E1) + its update handler.
    const activePageMeta = useMemo(
        () =>
            editTarget.kind === "custom"
                ? builder.active_custom_page?.meta
                : builder.config.pages.find(
                      (p) => p.page_id === editTarget.page_id,
                  )?.meta,
        [editTarget, builder.config.pages, builder.active_custom_page],
    );
    const handlePageMetaChange = useCallback(
        (next: PageMeta): void => {
            builder.setConfig(
                (prev) => withActivePageMeta(prev, editTarget, next),
                "Edited page SEO",
            );
        },
        [builder, editTarget],
    );

    const handleAddSection = useCallback(
        (instance: SectionInstance, insertAt?: number): void => {
            const next =
                typeof insertAt === "number" && insertAt >= 0
                    ? (() => {
                          const arr = activeSections.slice();
                          const clamped = Math.min(insertAt, arr.length);
                          arr.splice(clamped, 0, instance);
                          return arr;
                      })()
                    : [...activeSections, instance];
            handleSectionsChange(next);
            // Open edit panel for the newly added section.
            set_editing_section_id(instance.id);
            onEditSection?.(instance.id);
        },
        [activeSections, handleSectionsChange, onEditSection],
    );

    /* ── Spacing handle commit ─────────────────────────────────── */

    const handleSectionSpacingChange = useCallback(
        (section_id: string, bottom_px: number): void => {
            // Drag committed → resume config-push (the setConfig below re-fires
            // the effect, which posts the committed config to the iframe).
            spacing_dragging_ref.current = false;
            builder.setConfig(
                (prev) =>
                    withActivePageSections(prev, editTarget, (sections) => {
                        const sec_idx = sections.findIndex(
                            (s) => s.id === section_id,
                        );
                        if (sec_idx < 0) return sections;
                        const next = sections.slice();
                        next[sec_idx] = {
                            ...next[sec_idx],
                            spacing: {
                                ...(next[sec_idx].spacing ?? {}),
                                bottom_px,
                            },
                        };
                        return next;
                    }),
                "Resized spacing",
            );
        },
        [builder, editTarget],
    );

    // Live spacing-drag feedback: stream a transient page config (selected
    // section's bottom spacing only) to the iframe without committing — the
    // iframe reflows in place; the commit happens on mouseup.
    const handleSpacingPreview = useCallback(
        (section_id: string, bottom_px: number): void => {
            spacing_dragging_ref.current = true;
            const page = builder.config.pages.find(
                (p) => p.page_id === builder.active_page,
            );
            if (!page) return;
            const nextPage: PageConfig = {
                ...page,
                sections: page.sections.map((s) =>
                    s.id === section_id
                        ? { ...s, spacing: { ...(s.spacing ?? {}), bottom_px } }
                        : s,
                ),
            };
            bridge.postPageConfigUpdate(nextPage);
        },
        [builder.config, builder.active_page, bridge],
    );

    /* ── DnD: picker card → preview insertion ─────────────────── */

    const pointer_sensor = useSensor(PointerSensor, {
        // 10px so existing click handlers aren't hijacked.
        activationConstraint: { distance: 10 },
    });
    const dnd_sensors = useSensors(pointer_sensor);

    // The drag-active value drove LivePreview's canvas drop-zones, which move
    // onto the iframe overlay in step 5; the DnD handlers keep the setter
    // wired meanwhile so re-enabling it is a one-line change.
    const [, set_picker_drag_active] = useState<boolean>(false);
    const dragged_manifest_type_ref = useRef<string | null>(null);

    const handleDndDragStart = useCallback((e: DragStartEvent): void => {
        const data = e.active.data.current as
            | { sectionType?: string; manifestType?: string }
            | undefined;
        const t = data?.manifestType ?? data?.sectionType ?? null;
        if (!t) return;
        dragged_manifest_type_ref.current = t;
        set_picker_drag_active(true);
    }, []);

    const handleDndDragCancel = useCallback((): void => {
        dragged_manifest_type_ref.current = null;
        set_picker_drag_active(false);
    }, []);

    const handleDndDragEnd = useCallback(
        (e: DragEndEvent): void => {
            const t = dragged_manifest_type_ref.current;
            dragged_manifest_type_ref.current = null;
            set_picker_drag_active(false);
            if (!t) return;
            const overData = e.over?.data.current as
                | { insertAt?: number }
                | undefined;
            if (!e.over || typeof overData?.insertAt !== "number") return;
            const entry = getManifestEntry(t);
            if (!entry) return;
            // Build the instance the same way the picker would.
            const instance: SectionInstance = {
                id:
                    typeof crypto !== "undefined" &&
                    typeof crypto.randomUUID === "function"
                        ? crypto.randomUUID()
                        : `sec_${Date.now().toString(36)}_${Math.random()
                              .toString(36)
                              .slice(2, 10)}`,
                type: entry.type,
                enabled: true,
                base: JSON.parse(JSON.stringify(entry.defaultProps)) as Record<
                    string,
                    unknown
                >,
                label: "",
            };
            handleAddSection(instance, overData.insertAt);
            // Close the picker on successful drop.
            set_picker_open(false);
        },
        [handleAddSection],
    );

    const handleEditSection = useCallback(
        (id: string): void => {
            set_editing_section_id(id);
            onEditSection?.(id);
        },
        [onEditSection],
    );

    const handleApplyTemplate = useCallback(
        (sections: SectionInstance[]): void => {
            // Replace the current page's sections wholesale. Originals
            // are discarded — the picker confirmation warned the
            // merchant.
            handleSectionsChange(sections);
            set_editing_section_id(null);
            set_selected_section_id(null);
        },
        [handleSectionsChange],
    );

    const handleSaveSectionAsPreset = useCallback(
        async (id: string, presetName: string): Promise<void> => {
            const section = activeSections.find((s) => s.id === id);
            if (!section) return;
            await sectionPresets.create(presetName, section);
        },
        [activeSections, sectionPresets],
    );

    const handleDeletePreset = useCallback(
        async (id: string): Promise<void> => {
            await sectionPresets.remove(id);
        },
        [sectionPresets],
    );

    /** Toggle inline expansion of a section row inside the Inspector. */
    const handleToggleExpanded = useCallback(
        (id: string): void => {
            set_editing_section_id((curr) => (curr === id ? null : id));
            onEditSection?.(id);
        },
        [onEditSection],
    );

    /* ── Overlay → config mutations ────────────────────────────── */

    const handleOverlayDelete = useCallback(
        (id: string): void => {
            handleSectionsChange(activeSections.filter((s) => s.id !== id));
            set_selected_section_id((curr) => (curr === id ? null : curr));
            if (editing_section_id === id) set_editing_section_id(null);
        },
        [activeSections, editing_section_id, handleSectionsChange],
    );

    /* ── Inline text editing → mutate the section's base config ──── */
    //
    // Routes the edit through `builder.patchField` so the in-memory
    // update is applied AND a small PATCH is fired to
    // /api/store-config-v2/patch — avoiding the 50–100KB full-config
    // round-trip on slow networks. The hook still has a debounced
    // full-save as a safety net.
    const handleInlineEdit = useCallback(
        (
            section_id: string,
            field_path: string,
            locale: LocaleCode,
            next_value: string,
        ): void => {
            // Resolve the page's location in the config so we can build a
            // path-based patch. Custom pages live under `custom_pages[]`
            // (keyed by id), system pages under `pages[]` (keyed by page_id).
            const rootKey =
                editTarget.kind === "custom" ? "custom_pages" : "pages";
            const page_idx =
                editTarget.kind === "custom"
                    ? customPageIndexById(
                          builder.config.custom_pages,
                          editTarget.id,
                      )
                    : builder.config.pages.findIndex(
                          (p) => p.page_id === editTarget.page_id,
                      );
            if (page_idx < 0) return;
            const sections = activePageSections(builder.config, editTarget);
            const sec_idx = sections.findIndex((s) => s.id === section_id);
            if (sec_idx < 0) return;
            const baseSegs = parsePathSegments(field_path);
            const absolutePath: (string | number)[] = [
                rootKey,
                page_idx,
                "sections",
                sec_idx,
                "base",
                ...baseSegs,
                locale,
            ];
            builder.patchField(absolutePath, next_value);
        },
        [builder, editTarget, builder.config],
    );

    // Inline edits happen inside the iframe (contenteditable); the bridge
    // streams committed values out. The editor supplies the active locale and
    // routes them through the same patch path the legacy DOM preview used.
    useEffect(() => {
        return bridge.onInlineEditCommit((e) => {
            handleInlineEdit(
                e.section_id,
                e.field_path,
                builder.active_locale,
                e.value,
            );
        });
    }, [bridge, handleInlineEdit, builder.active_locale]);

    const handleAddVariant = useCallback(
        (section_id: string): void => {
            set_editing_section_id(section_id);
            onEditSection?.(section_id);
        },
        [onEditSection],
    );

    const handleOverlayAction = useCallback(
        (action: PreviewOverlayAction): void => {
            const idx = activeSections.findIndex((s) => s.id === action.section_id);
            if (idx < 0) return;
            if (action.kind === "duplicate") {
                const source = activeSections[idx];
                const clone: SectionInstance = {
                    ...source,
                    id: generateSectionId(),
                    base: deepCloneJson(source.base),
                    variants: source.variants
                        ? source.variants.map((v) => ({
                              ...v,
                              override: deepCloneJson(v.override),
                          }))
                        : undefined,
                };
                const next = [...activeSections];
                next.splice(idx + 1, 0, clone);
                handleSectionsChange(next);
                return;
            }
            if (action.kind === "up") {
                if (idx === 0) return;
                const next = [...activeSections];
                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                handleSectionsChange(next);
                return;
            }
            if (action.kind === "down") {
                if (idx >= activeSections.length - 1) return;
                const next = [...activeSections];
                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                handleSectionsChange(next);
                return;
            }
        },
        [activeSections, handleSectionsChange],
    );

    /* ── Preview context-menu actions ──────────────────────────── */

    const closePreviewContextMenu = useCallback((): void => {
        set_preview_context_menu(null);
    }, []);

    const handlePreviewContextMenuAction = useCallback(
        (action: LivePreviewContextMenuAction): void => {
            const id = preview_context_menu?.section_id;
            set_preview_context_menu(null);
            if (!id) return;
            switch (action) {
                case "edit":
                    handleEditSection(id);
                    break;
                case "duplicate":
                    handleOverlayAction({ kind: "duplicate", section_id: id });
                    break;
                case "up":
                    handleOverlayAction({ kind: "up", section_id: id });
                    break;
                case "down":
                    handleOverlayAction({ kind: "down", section_id: id });
                    break;
                case "add_variant":
                    handleAddVariant(id);
                    break;
                case "delete":
                    handleOverlayDelete(id);
                    break;
            }
        },
        [
            preview_context_menu,
            handleEditSection,
            handleOverlayAction,
            handleAddVariant,
            handleOverlayDelete,
        ],
    );

    /* ── Section selection scroll-sync helpers ─────────────────── */

    const section_row_refs = useRef<Map<string, HTMLElement | null>>(new Map());
    const registerSectionRow = useCallback(
        (id: string, el: HTMLElement | null): void => {
            if (el === null) section_row_refs.current.delete(id);
            else section_row_refs.current.set(id, el);
        },
        [],
    );

    // Scroll the section-list row into view whenever the in-iframe
    // selection changes.
    useEffect(() => {
        if (!selected_section_id) return;
        const el = section_row_refs.current.get(selected_section_id);
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [selected_section_id]);

    const handleSelectFromList = useCallback(
        (id: string): void => {
            set_selected_section_id(id);
            bridge.scrollToSection(id);
            bridge.requestRect(id);
        },
        [bridge],
    );

    // Resolve a friendly label for the selected section (for the toolbar).
    const selected_section_label = useMemo<string | null>(() => {
        if (!selected_section_id) return null;
        const s = activeSections.find((x) => x.id === selected_section_id);
        if (!s) return null;
        if (s.label?.trim()) return s.label;
        const manifest = getManifestEntry(s.type);
        return manifest?.name.en ?? s.type;
    }, [activeSections, selected_section_id]);

    // Current bottom spacing of the selected section — seeds the drag handle.
    const selected_spacing_bottom_px = useMemo<number>(() => {
        if (!selected_section_id) return 0;
        const s = activeSections.find((x) => x.id === selected_section_id);
        return s?.spacing?.bottom_px ?? 0;
    }, [activeSections, selected_section_id]);

    const previewUrl = useMemo(
        () =>
            buildPreviewUrl(
                storefrontUrl,
                tenant.slug,
                builder.active_page,
                builder.active_breakpoint,
                builder.active_locale,
                activePreviewToken,
            ),
        [
            storefrontUrl,
            tenant.slug,
            builder.active_page,
            builder.active_breakpoint,
            builder.active_locale,
            activePreviewToken,
        ],
    );

    // Stable iframe src for the in-canvas preview. Breakpoint width is
    // applied by <PreviewFrame>; locale/page changes flow to the iframe via
    // the runtime_update / page_id_change postMessage effects above — so a
    // live edit never swaps `src` and reloads the frame. Only a storefront
    // ORIGIN change (a custom domain resolving in prod) re-mints the URL.
    const iframe_initial_page = useRef<PageId>(builder.active_page);
    const iframe_initial_bp = useRef<Breakpoint>(builder.active_breakpoint);
    const iframe_initial_locale = useRef<LocaleCode>(builder.active_locale);
    const iframePreviewUrl = useMemo(
        () =>
            buildPreviewUrl(
                storefrontUrl,
                tenant.slug,
                iframe_initial_page.current,
                iframe_initial_bp.current,
                iframe_initial_locale.current,
                activePreviewToken,
            ),
        [storefrontUrl, tenant.slug, activePreviewToken],
    );

    // Build the `_preview` URL for any device — the PreviewModal swaps the
    // breakpoint while keeping the current page/locale/token.
    const makePreviewUrl = useCallback(
        (bp: Breakpoint): string =>
            buildPreviewUrl(
                storefrontUrl,
                tenant.slug,
                builder.active_page,
                bp,
                builder.active_locale,
                activePreviewToken,
            ),
        [
            storefrontUrl,
            tenant.slug,
            builder.active_page,
            builder.active_locale,
            activePreviewToken,
        ],
    );
    const [preview_modal_open, set_preview_modal_open] = useState(false);

    const healthReport = useMemo(
        () => runHealthChecks(builder.config),
        [builder.config],
    );
    const healthBlocking = useMemo(
        () => blockingChecks(healthReport),
        [healthReport],
    );
    // Health no longer blocks publish — surfaced via PublishConfirmSheet.
    const publishDisabled = !builder.has_unpublished_changes;
    const publishBusy = builder.save_state === "saving";
    // Health does NOT block publishing — these warnings are surfaced
    // (non-blocking) in the PublishConfirmSheet. The tooltip copy must say so,
    // otherwise it contradicts the enabled Publish button.
    const publishBlockedReason = useMemo<string | null>(() => {
        if (healthBlocking.length === 0) return null;
        // Use rule-defined messages instead of raw ids so the tooltip is
        // human-readable. Locale-aware message fields would go here if
        // added; for now `message` is English-only.
        const messages = healthBlocking
            .slice(0, 3)
            .map((c) => c.message ?? c.id);
        const more = healthBlocking.length > 3 ? `, +${healthBlocking.length - 3} more` : "";
        return `${healthBlocking.length} health warning${healthBlocking.length === 1 ? "" : "s"} will be shown before you publish: ${messages.join("; ")}${more}`;
    }, [healthBlocking]);

    // Phase 2d: detect mobile viewport. We keep the desktop 3-pane path
    // unchanged for ≥1024px and swap to MobileEditorShell below.
    const isMobile = useIsMobileEditor();

    // Render-prop used by the mobile inspector drawer to lazily mount
    // SectionEditPanel for the currently-edited section. Hoisted here so
    // we reuse the shell's `activeSections` slice + `onChange` plumbing.
    const renderMobileEditPanel = useCallback(
        (sectionId: string): React.ReactNode => {
            const section = activeSections.find((s) => s.id === sectionId);
            if (!section) return null;
            return (
                <SectionEditPanel
                    instance={section}
                    onChange={(next) => {
                        const idx = activeSections.findIndex(
                            (s) => s.id === sectionId,
                        );
                        if (idx < 0) return;
                        const arr = activeSections.slice();
                        arr[idx] = next;
                        handleSectionsChange(arr);
                    }}
                    onClose={() => set_editing_section_id(null)}
                    tenantId={tenant.id}
                    experiments={builder.config.experiments}
                    segments={builder.config.segments}
                    activeLocale={builder.active_locale}
                    activeBreakpoint={builder.active_breakpoint}
                    inline
                />
            );
        },
        [
            activeSections,
            builder.active_locale,
            builder.config.experiments,
            builder.config.segments,
            handleSectionsChange,
            tenant.id,
        ],
    );

    // Publish ALWAYS opens the confirm sheet — no silent ship.
    // When there are no blocking health checks the sheet still surfaces
    // the "what's changing" diff so the merchant sees what they're
    // about to push live, plus an "All clear" empty state for the
    // health list. When checks block, the sheet routes the merchant to
    // each Fix deep-link via PublishConfirmSheet's fix_action prop.
    const handleOpenPublishSheet = useCallback((): void => {
        set_publish_sheet_open(true);
    }, []);

    const handlePublishAnyway = useCallback((): void => {
        set_publish_sheet_open(false);
        void builder.publish();
    }, [builder]);

    const handlePublishJumpToFix = useCallback(
        (fix: NonNullable<CheckResult["fix_action"]>): void => {
            set_publish_sheet_open(false);
            const go = fix.go_to;
            if (go.kind === "settings") {
                if (go.key === "health") {
                    set_system_screen(null);
                    set_inspector_tab("health");
                } else {
                    set_system_screen(go.key);
                }
                return;
            }
            if (go.kind === "page") {
                set_system_screen(null);
                builder.set_active_page(go.page_id);
                return;
            }
            if (go.kind === "section") {
                set_system_screen(null);
                builder.set_active_page(go.page_id);
                set_selected_section_id(go.section_id);
                set_editing_section_id(go.section_id);
                return;
            }
            if (go.kind === "external") {
                if (typeof window !== "undefined") {
                    window.open(go.href, "_blank", "noopener,noreferrer");
                }
            }
        },
        [builder],
    );

    // Apply a Command Center deep-link (?page=/&section=) once on mount, so a
    // "Fix"/"Edit" click lands on the exact page/section instead of the default.
    const deepLinkAppliedRef = useRef(false);
    useEffect(() => {
        if (deepLinkAppliedRef.current) return;
        deepLinkAppliedRef.current = true;
        if (initialPageId) builder.set_active_page(initialPageId);
        if (initialSectionId) {
            set_selected_section_id(initialSectionId);
            set_editing_section_id(initialSectionId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Pages handled by desktop-only stubs on mobile (don't try to render
    // dense screens at 390px).
    const DESKTOP_ONLY_SETTINGS: readonly SettingsSectionId[] = [
        "brand_kit",
        "experiments",
        "segments",
        "scheduled",
        "versions",
        "i18n",
        "shipping",
        "discounts",
        "bundles",
        "cart_recovery",
        "pixels",
        "loyalty",
        "custom_pages",
        "nav",
        "redirects",
    ] as const;

    if (isMobile) {
        return (
            <EditorLocaleProvider value={builder.active_locale}>
            <DndContext
                sensors={dnd_sensors}
                onDragStart={handleDndDragStart}
                onDragEnd={handleDndDragEnd}
                onDragCancel={handleDndDragCancel}
            >
                {builder.recoverable_backup && (
                    <DraftRecoveryBanner
                        backup={builder.recoverable_backup}
                        onRestore={builder.restore_backup}
                        onDismiss={builder.dismiss_backup}
                    />
                )}
                {system_screen && DESKTOP_ONLY_SETTINGS.includes(system_screen) ? (
                    <div
                        data-testid="editor-shell-v2"
                        className="flex h-[calc(100vh-4rem)] flex-col bg-background"
                    >
                        <MobileDesktopOnlyStub
                            settingId={system_screen}
                            onClose={handleCloseSystemScreen}
                        />
                    </div>
                ) : (
                    <MobileEditorShell
                        tenant={tenant}
                        builder={builder}
                        activeSections={activeSections}
                        sectionCounts={sectionCounts}
                        onSectionsChange={handleSectionsChange}
                        onAddSectionFab={() => {
                            set_picker_insert_at(null);
                            set_picker_open(true);
                        }}
                        onStartFromTemplate={() => set_template_picker_open(true)}
                        onSaveAsPreset={(id, name) => {
                            void handleSaveSectionAsPreset(id, name);
                        }}
                        selectedSectionId={selected_section_id}
                        onSelectSection={set_selected_section_id}
                        editingSectionId={editing_section_id}
                        onToggleExpanded={handleToggleExpanded}
                        onSelectPage={handleSelectPage}
                        onSelectSetting={handleSelectSetting}
                        onJumpToSection={(page, section_id) => {
                            set_system_screen(null);
                            builder.set_active_page(page);
                            set_selected_section_id(section_id);
                            set_editing_section_id(section_id);
                        }}
                        previewProducts={previewProducts}
                        previewCategories={previewCategories}
                        previewAs={preview_as}
                        onChangePreviewAs={set_preview_as}
                        onInlineEdit={handleInlineEdit}
                        onAddVariant={handleAddVariant}
                        onOverlayDelete={handleOverlayDelete}
                        onOverlayAction={(kind, section_id) =>
                            handleOverlayAction({ kind, section_id })
                        }
                        onSpacingChange={handleSectionSpacingChange}
                        onEditSectionFromCanvas={handleEditSection}
                        onPublish={handleOpenPublishSheet}
                        publishDisabled={publishDisabled}
                        publishBusy={publishBusy}
                        publishBlockedReason={publishBlockedReason}
                        isFirstTimeTenant={isFirstTimeTenant}
                        onAddAtIndex={(insertAt) => {
                            set_picker_insert_at(insertAt);
                            set_picker_open(true);
                        }}
                        renderEditPanel={renderMobileEditPanel}
                        renderPreview={(onEditRequest) => (
                            <div
                                ref={preview_container_ref}
                                className="relative flex flex-1 overflow-hidden"
                            >
                                <PreviewFrame
                                    ref={iframe_ref}
                                    url={iframePreviewUrl}
                                    breakpoint="mobile"
                                />
                                <PreviewOverlay
                                    bridge={bridge}
                                    selected_section_id={selected_section_id}
                                    selected_section_label={selected_section_label}
                                    onEditRequest={onEditRequest}
                                    onDeleteRequest={handleOverlayDelete}
                                    onAction={handleOverlayAction}
                                    iframeBounds={iframe_bounds}
                                    contextMenu={preview_context_menu}
                                    onContextMenuClose={closePreviewContextMenu}
                                    onContextMenuAction={handlePreviewContextMenuAction}
                                />
                            </div>
                        )}
                        brandKit={builder.config.brand_kit}
                        onChangeBrandKit={handleBrandKitChange}
                        experiments={builder.config.experiments}
                        segments={builder.config.segments}
                        config={builder.config}
                    />
                )}

                {/* Section picker overlay (full-screen on mobile via its own breakpoints) */}
                <SectionPicker
                    open={picker_open}
                    onClose={() => {
                        set_picker_open(false);
                        set_picker_insert_at(null);
                    }}
                    pageId={builder.active_page}
                    pageLabel={getPageLabel(builder.active_page)}
                    storefrontUrl={storefrontUrl}
                    onAdd={(instance) => {
                        handleAddSection(instance, picker_insert_at ?? undefined);
                        set_picker_insert_at(null);
                    }}
                    presets={sectionPresets.presets}
                    onDeletePreset={(id) => {
                        void handleDeletePreset(id);
                    }}
                />

                <PageTemplatePicker
                    open={template_picker_open}
                    onClose={() => set_template_picker_open(false)}
                    currentSectionCount={activeSections.length}
                    onApply={handleApplyTemplate}
                />

                <PublishConfirmSheet
                    open={publish_sheet_open}
                    blockingChecks={healthBlocking}
                    onClose={() => set_publish_sheet_open(false)}
                    onPublishAnyway={handlePublishAnyway}
                    onJumpToFix={handlePublishJumpToFix}
                    busy={publishBusy}
                    config={builder.config}
                    publishedConfig={publishedConfig ?? null}
                />

                <span className="sr-only" data-testid="editor-shell-business-name">
                    {tenant.business_name}
                </span>
            </DndContext>
            </EditorLocaleProvider>
        );
    }

    return (
        <EditorLocaleProvider value={builder.active_locale}>
        <DndContext
            sensors={dnd_sensors}
            onDragStart={handleDndDragStart}
            onDragEnd={handleDndDragEnd}
            onDragCancel={handleDndDragCancel}
        >
        <div
            data-testid="editor-shell-v2"
            className="flex h-[calc(100vh-4rem)] flex-col bg-background"
        >
            {builder.recoverable_backup && (
                <DraftRecoveryBanner
                    backup={builder.recoverable_backup}
                    onRestore={builder.restore_backup}
                    onDismiss={builder.dismiss_backup}
                />
            )}
            {preview_modal_open && (
                <PreviewModal
                    onClose={() => set_preview_modal_open(false)}
                    initialBreakpoint={builder.active_breakpoint}
                    makeUrl={makePreviewUrl}
                />
            )}
            {/* Top bar */}
            <header
                data-testid="editor-shell-topbar"
                className="sb-glass-bar z-20 flex h-14 shrink-0 items-center justify-between border-b border-(--card-border) px-3 shadow-[0_1px_0_rgba(0,0,0,0.02),0_10px_24px_-18px_rgba(0,0,0,0.25)]"
            >
                <div className="flex items-center gap-2">
                    <Link
                        href="/store"
                        data-testid="editor-shell-back"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/4 hover:text-foreground"
                        aria-label="Back to store builder"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Link>
                    <span
                        aria-hidden="true"
                        className="sb-tile sb-tile--page flex h-8 w-8"
                    >
                        <Store className="h-4 w-4" />
                    </span>
                    <span className="flex min-w-0 flex-col leading-tight">
                        <span
                            data-testid="editor-shell-tenant-name"
                            className="truncate text-sm font-semibold tracking-tight text-foreground"
                        >
                            {tenant.business_name}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Store builder
                        </span>
                    </span>
                </div>

                <div className="flex items-center gap-2.5">
                    <LocaleSelect
                        value={builder.active_locale}
                        onChange={builder.set_active_locale}
                    />
                    <BreakpointToggle
                        value={builder.active_breakpoint}
                        onChange={builder.set_active_breakpoint}
                    />
                    <span
                        aria-hidden="true"
                        className="h-5 w-px bg-(--card-border)"
                    />
                    <div
                        data-testid="undo-redo-group"
                        className="inline-flex items-center gap-0.5 rounded-full border border-(--card-border) bg-(--background-soft) p-1"
                    >
                        <button
                            type="button"
                            data-testid="undo-button"
                            aria-label="Undo"
                            title={
                                builder.can_undo
                                    ? `Undo: ${builder.undo_description ?? "Edit config."}`
                                    : "Nothing to undo"
                            }
                            disabled={!builder.can_undo}
                            onClick={() => builder.undo()}
                            className={
                                "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 " +
                                (builder.can_undo
                                    ? "text-foreground hover:bg-(--card-bg) hover:shadow-(--card-shadow)"
                                    : "cursor-not-allowed text-muted-foreground/40")
                            }
                        >
                            <Undo2 className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            data-testid="redo-button"
                            aria-label="Redo"
                            title={
                                builder.can_redo
                                    ? `Redo: ${builder.redo_description ?? "Edit config."}`
                                    : "Nothing to redo"
                            }
                            disabled={!builder.can_redo}
                            onClick={() => builder.redo()}
                            className={
                                "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150 " +
                                (builder.can_redo
                                    ? "text-foreground hover:bg-(--card-bg) hover:shadow-(--card-shadow)"
                                    : "cursor-not-allowed text-muted-foreground/40")
                            }
                        >
                            <Redo2 className="h-4 w-4" />
                        </button>
                    </div>
                    <span
                        aria-hidden="true"
                        className="h-5 w-px bg-(--card-border)"
                    />
                    <PreviewAsControls
                        value={preview_as}
                        onChange={set_preview_as}
                        segments={builder.config.segments}
                        experiments={builder.config.experiments}
                    />
                    <I18nToolbarPill
                        config={builder.config}
                        onClick={() => set_system_screen("i18n")}
                    />
                    <button
                        type="button"
                        onClick={() => set_preview_modal_open(true)}
                        data-testid="open-accurate-preview"
                        title="Preview at a real device viewport (accurate responsive layout)"
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-(--card-border) bg-(--background-soft) px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                    >
                        <Smartphone className="h-3.5 w-3.5" />
                        <span>Preview</span>
                    </button>
                    <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="open-in-storefront"
                        title="Open production preview in a new tab"
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-(--card-border) bg-(--background-soft) px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-(--border-hover) hover:text-foreground"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open</span>
                    </a>
                </div>

                <div className="flex items-center gap-2.5">
                    <SaveStatePill
                        state={builder.save_state}
                        lastSavedAt={builder.last_saved_at}
                        onRetry={() => {
                            void builder.save_draft();
                        }}
                    />
                    <PublishButton
                        onPublish={handleOpenPublishSheet}
                        disabled={publishDisabled}
                        busy={publishBusy}
                        title={publishBlockedReason ?? undefined}
                    />
                </div>
            </header>

            {/* BUG25: another editor published since we loaded — publishing was
                rejected to avoid clobbering their work; prompt a reload. */}
            {builder.publish_conflict && (
                <div
                    role="alert"
                    data-testid="publish-conflict-banner"
                    className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-5 py-2.5 text-sm text-amber-900"
                >
                    <span>
                        Someone else published changes since you opened the editor.
                        Reload to get the latest before publishing again — your draft is
                        kept.
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            if (typeof window !== "undefined") window.location.reload();
                        }}
                        className="shrink-0 rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-amber-50 transition-opacity hover:opacity-90"
                    >
                        Reload
                    </button>
                </div>
            )}

            {/* Main */}
            <div className="flex flex-1 overflow-hidden">
                <PageTree
                    active={builder.active_page}
                    onSelect={handleSelectPage}
                    onSelectSetting={handleSelectSetting}
                    sectionCounts={sectionCounts}
                />
                <main
                    data-testid="editor-shell-main"
                    className="flex flex-1 overflow-hidden"
                >
                    {system_screen === "brand_kit" ? (
                        <BrandKitEditor
                            value={builder.config.brand_kit}
                            onChange={handleBrandKitChange}
                            tenantId={tenant.id}
                        />
                    ) : system_screen === "versions" ? (
                        <VersionHistoryScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "scheduled" ? (
                        <ScheduledChangesScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "segments" ? (
                        <SegmentsScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "experiments" ? (
                        <ExperimentsScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "i18n" ? (
                        <I18nScreen
                            config={builder.config}
                            onSelectPage={(page) => {
                                set_system_screen(null);
                                builder.set_active_page(page);
                            }}
                            onSelectSection={(page, section_id) => {
                                set_system_screen(null);
                                builder.set_active_page(page);
                                set_selected_section_id(section_id);
                                set_editing_section_id(section_id);
                            }}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "shipping" ? (
                        <ShippingScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "discounts" ? (
                        <DiscountsScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "cart_recovery" ? (
                        <CartRecoveryScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "bundles" ? (
                        <BundlesScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "pixels" ? (
                        <PixelsScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "loyalty" ? (
                        <LoyaltyScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "custom_pages" ? (
                        <CustomPagesScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "nav" ? (
                        <NavBuilderScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : system_screen === "redirects" ? (
                        <RedirectsScreen
                            builder={builder}
                            onClose={handleCloseSystemScreen}
                        />
                    ) : (
                        <>
                            <div
                                ref={preview_container_ref}
                                className="sb-canvas relative flex flex-1 flex-col overflow-hidden"
                            >
                                <FirstRunBanner
                                    tenantId={tenant.id}
                                    visible={isFirstTimeTenant}
                                />
                                <div className="relative flex flex-1 overflow-hidden">
                                    <PreviewFrame
                                        ref={iframe_ref}
                                        url={iframePreviewUrl}
                                        breakpoint={builder.active_breakpoint}
                                    />
                                </div>
                                {/* Click-to-edit overlay — positioned over the
                                    iframe via bounds relative to the canvas
                                    (preview_container_ref). Rings + section
                                    toolbar; inline-edit / insert / spacing-drag
                                    / context-menu land in steps 4-6. */}
                                <PreviewOverlay
                                    bridge={bridge}
                                    selected_section_id={selected_section_id}
                                    selected_section_label={selected_section_label}
                                    onEditRequest={handleEditSection}
                                    onDeleteRequest={handleOverlayDelete}
                                    onAction={handleOverlayAction}
                                    iframeBounds={iframe_bounds}
                                    contextMenu={preview_context_menu}
                                    onContextMenuClose={closePreviewContextMenu}
                                    onContextMenuAction={
                                        handlePreviewContextMenuAction
                                    }
                                    onAddAt={(insertAt) => {
                                        set_picker_insert_at(insertAt);
                                        set_picker_open(true);
                                    }}
                                    selectedSpacingBottomPx={
                                        selected_spacing_bottom_px
                                    }
                                    onSpacingPreview={handleSpacingPreview}
                                    onSpacingChange={handleSectionSpacingChange}
                                />
                            </div>
                            <InspectorRail
                                activeTab={inspector_tab}
                                onChangeTab={set_inspector_tab}
                                pageId={builder.active_page}
                                pageLabel={getPageLabel(builder.active_page)}
                                sections={activeSections}
                                onChangeSections={handleSectionsChange}
                                onAddSection={() => {
                                    set_picker_insert_at(null);
                                    set_picker_open(true);
                                }}
                                selectedSectionId={selected_section_id}
                                onSelectSection={handleSelectFromList}
                                registerRowRef={registerSectionRow}
                                onStartFromTemplate={() =>
                                    set_template_picker_open(true)
                                }
                                onSaveAsPreset={(id, name) => {
                                    void handleSaveSectionAsPreset(id, name);
                                }}
                                expandedSectionId={editing_section_id}
                                onToggleExpanded={handleToggleExpanded}
                                tenantId={tenant.id}
                                activeLocale={builder.active_locale}
                                activeBreakpoint={builder.active_breakpoint}
                                experiments={builder.config.experiments}
                                segments={builder.config.segments}
                                brandKit={builder.config.brand_kit}
                                onChangeBrandKit={handleBrandKitChange}
                                pageMeta={activePageMeta}
                                onChangePageMeta={handlePageMetaChange}
                                storefrontUrl={storefrontUrl}
                                config={builder.config}
                                tenantName={tenant.business_name}
                                onJumpToSetting={handleSelectSetting}
                                onJumpToPage={(page) => {
                                    set_system_screen(null);
                                    builder.set_active_page(page);
                                }}
                                onJumpToSection={(page, section_id) => {
                                    set_system_screen(null);
                                    builder.set_active_page(page);
                                    set_selected_section_id(section_id);
                                    set_editing_section_id(section_id);
                                }}
                            />
                        </>
                    )}
                </main>
            </div>

            {/* Section picker overlay */}
            <SectionPicker
                open={picker_open}
                onClose={() => {
                    set_picker_open(false);
                    set_picker_insert_at(null);
                }}
                pageId={builder.active_page}
                pageLabel={getPageLabel(builder.active_page)}
                storefrontUrl={storefrontUrl}
                onAdd={(instance) => {
                    handleAddSection(
                        instance,
                        picker_insert_at ?? undefined,
                    );
                    set_picker_insert_at(null);
                }}
                presets={sectionPresets.presets}
                onDeletePreset={(id) => {
                    void handleDeletePreset(id);
                }}
            />

            {/* Page-template picker overlay */}
            <PageTemplatePicker
                open={template_picker_open}
                onClose={() => set_template_picker_open(false)}
                currentSectionCount={activeSections.length}
                onApply={handleApplyTemplate}
            />

            {/* Publish confirm sheet — opens when Publish has health warnings */}
            <PublishConfirmSheet
                open={publish_sheet_open}
                blockingChecks={healthBlocking}
                onClose={() => set_publish_sheet_open(false)}
                onPublishAnyway={handlePublishAnyway}
                onJumpToFix={handlePublishJumpToFix}
                busy={publishBusy}
                config={builder.config}
                publishedConfig={publishedConfig ?? null}
            />

            {/* Hidden business-name anchor for downstream selectors. */}
            <span className="sr-only" data-testid="editor-shell-business-name">
                {tenant.business_name}
            </span>
        </div>
        </DndContext>
        </EditorLocaleProvider>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* FirstRunBanner                                                       */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Tiny bento-styled banner shown above the canvas for first-time
 * tenants. Dismissal is persisted per-tenant in localStorage so it
 * doesn't reappear across sessions.
 */
function FirstRunBanner({
    tenantId,
    visible,
}: {
    tenantId: string;
    visible: boolean;
}): React.ReactElement | null {
    const storageKey = `schneiders.builder.first_run_banner.dismissed.${tenantId}`;
    const [dismissed, setDismissed] = useState<boolean>(true);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const stored = window.localStorage.getItem(storageKey);
            setDismissed(stored === "true");
        } catch {
            setDismissed(false);
        }
    }, [storageKey]);

    if (!visible || dismissed) return null;

    const handleDismiss = (): void => {
        setDismissed(true);
        try {
            if (typeof window !== "undefined") {
                window.localStorage.setItem(storageKey, "true");
            }
        } catch {
            /* ignore */
        }
    };

    return (
        <div
            data-testid="editor-shell-first-run-banner"
            className="mx-3 mt-3 flex items-center gap-3 rounded-xl border border-(--card-border) bg-gradient-to-r from-pink-500/10 via-amber-500/10 to-violet-500/10 px-4 py-3 text-sm"
        >
            <span aria-hidden="true" className="text-base">
                ✨
            </span>
            <p className="flex-1 text-foreground/90">
                This is your homepage. Click any text to edit. Hit Publish when
                you're ready.
            </p>
            <button
                type="button"
                aria-label="Dismiss first-run banner"
                data-testid="editor-shell-first-run-banner-dismiss"
                onClick={handleDismiss}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
            >
                ×
            </button>
        </div>
    );
}

/** Relative "N min ago" label for the recovery banner timestamp. */
function relativeTimeFrom(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    const mins = Math.round(diff / 60_000);
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
    const days = Math.round(hrs / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Crash-recovery banner — shown when a local backup newer than the DB draft is
 * found on mount (BUG4). Restoring is undoable (routes through applyConfig).
 */
function DraftRecoveryBanner({
    backup,
    onRestore,
    onDismiss,
}: {
    backup: { saved_at: number };
    onRestore: () => void;
    onDismiss: () => void;
}) {
    return (
        <div
            data-testid="editor-shell-recovery-banner"
            className="fixed inset-x-0 top-2 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-xl border border-amber-400/50 bg-amber-50/95 px-4 py-2.5 text-sm shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur"
        >
            <span aria-hidden="true" className="text-base">
                ⏱️
            </span>
            <p className="flex-1 text-amber-900">
                Unsaved changes from {relativeTimeFrom(backup.saved_at)} were
                recovered.
            </p>
            <button
                type="button"
                onClick={onRestore}
                data-testid="editor-shell-recovery-restore"
                className="inline-flex h-7 items-center rounded-md bg-amber-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
            >
                Restore
            </button>
            <button
                type="button"
                aria-label="Dismiss recovery banner"
                onClick={onDismiss}
                data-testid="editor-shell-recovery-dismiss"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-900/60 transition-colors hover:bg-amber-500/15 hover:text-amber-900"
            >
                ×
            </button>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Internal helpers                                                     */
/* ─────────────────────────────────────────────────────────────────── */

function generateSectionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function deepCloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Parse a path like `foo.bar[2].baz` into an ordered list of string keys
 * and numeric array indices. Used for inline-edit field-paths emitted by
 * section components.
 */
function parsePathSegments(path: string): Array<string | number> {
    if (!path) return [];
    const segs: Array<string | number> = [];
    const parts = path.split(".");
    for (const part of parts) {
        // Match `name`, `name[0]`, `[0]`, possibly nested `[0][1]`.
        const bracketMatch = /^([^\[\]]*)(.*)$/.exec(part);
        if (!bracketMatch) continue;
        const head = bracketMatch[1];
        const rest = bracketMatch[2];
        if (head) segs.push(head);
        const indexRe = /\[(\d+)\]/g;
        let m: RegExpExecArray | null;
        while ((m = indexRe.exec(rest)) !== null) {
            segs.push(Number(m[1]));
        }
    }
    return segs;
}

