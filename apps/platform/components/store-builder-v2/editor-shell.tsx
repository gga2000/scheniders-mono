"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
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
import {
    useIframeBridge,
    type PreviewPageConfig,
} from "@/hooks/use-iframe-bridge";
import { useStorefrontUrl } from "@/hooks/use-storefront-url";
import { getManifestEntry, sectionDisplayName } from "@/lib/sections-manifest";
import { PageTree, getPageLabel, type SettingsSectionId } from "./page-tree";
import { PreviewModal } from "./preview-modal";
import {
    PreviewOverlay,
    type PreviewOverlayAction,
    type PreviewOverlayContextMenu,
} from "./preview-overlay";
import type { LivePreviewContextMenuAction } from "./live-preview-context-menu";
import {
    EMPTY_PREVIEW_AS,
    type PreviewAsState,
} from "./preview-as-controls";
import { PreviewFrame } from "./preview-frame";
import { SectionPicker } from "./section-picker";
import { PageTemplatePicker } from "./page-template-picker";
import { useSectionPresets } from "@/hooks/use-section-presets";
import { templatesForPage } from "@/lib/page-templates";
import { checkCopyMessage } from "@/lib/health-check-copy";
import { InspectorRail, type InspectorTab } from "./inspector-rail";
import { cn } from "@/lib/utils";
import { EditorLocaleProvider } from "@/lib/editor-locale-context";
import { EditorModeProvider, type EditorMode } from "@/lib/editor-mode-context";
import { useUserPreferences, PREFERENCE_KEYS } from "@/hooks/use-user-preferences";
import { STRINGS, t, tFormat } from "@/lib/editor-i18n";
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
import { SystemScreenRouter } from "./system-screen-router";
import { EditorToolbar } from "./editor-toolbar";
import {
    DraftRecoveryBanner,
    FirstRunBanner,
    ModeElevatedToast,
    ModeIntroPopover,
    PublishSuccessDialog,
    WelcomeCard,
} from "./editor-banners";
import {
    DEV_PREVIEW_TOKEN,
    buildPreviewUrl,
    deepCloneJson,
    generateSectionId,
    parsePathSegments,
} from "@/lib/editor-shell-utils";

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
    /**
     * Deep-link the Inspector rail to a specific tab on mount (e.g. the
     * Command Center "SEO" tile opens the per-page SEO tab). Defaults to
     * "blocks". SEO/Health are inspector tabs, not full-screen system
     * screens, so they travel via this prop rather than `?screen=`.
     */
    initialInspectorTab?: InspectorTab | null;
    /**
     * True when the merchant just arrived from the onboarding wizard
     * (?welcome=1) — shows the one-time Arabic welcome card instead of
     * the plain first-run banner.
     */
    initialWelcome?: boolean;
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
        initialInspectorTab,
        initialWelcome,
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

    // Inspector rail tab (Blocks / Style / SEO / Health). A Command Center
    // deep-link (?tab=) can preselect a tab on mount.
    const [inspector_tab, set_inspector_tab] = useState<InspectorTab>(
        initialInspectorTab ?? "blocks",
    );

    /* ── Simple ⇄ Advanced editor mode ─────────────────────────────── */
    // A per-USER view preference (never data). SSR + first paint always
    // render Simple — the saved preference hydrates after mount, which is
    // safe because Simple is the default for everyone anyway.
    const { getPreference, setPreference, userId } = useUserPreferences();
    const [editor_mode, set_editor_mode_state] = useState<EditorMode>("simple");
    // Deep links can target Advanced-only surfaces (Health fix-actions,
    // Command Center tiles). Honor the intent by elevating for this visit
    // (session-only — the preference is NOT overwritten).
    const deepLinkNeedsAdvanced =
        (initialSystemScreen != null && initialSystemScreen !== "brand_kit") ||
        initialInspectorTab === "seo";
    const [mode_elevated_toast, set_mode_elevated_toast] = useState<boolean>(false);
    // Preferences are USER-scoped; at mount the auth user is often still
    // resolving, so the key reads as `anonymous` and misses the saved
    // value. Re-hydrate whenever userId lands — but never override a
    // choice the merchant made in this session.
    const modeTouchedRef = useRef<boolean>(false);
    const deepLinkElevatedRef = useRef<boolean>(false);
    useEffect(() => {
        if (modeTouchedRef.current) return;
        const saved = getPreference<EditorMode>(PREFERENCE_KEYS.EDITOR_MODE);
        if (saved === "advanced") {
            set_editor_mode_state("advanced");
        } else if (deepLinkNeedsAdvanced && !deepLinkElevatedRef.current) {
            deepLinkElevatedRef.current = true;
            set_editor_mode_state("advanced");
            set_mode_elevated_toast(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate on auth landing only
    }, [userId]);
    // One-time "what is Advanced?" intro, shown on the first MANUAL switch.
    const [mode_intro_open, set_mode_intro_open] = useState<boolean>(false);

    /* ── Post-wizard welcome card (2.2) ────────────────────────────── */
    // Shown once per tenant when arriving from the wizard (?welcome=1).
    // While open it replaces the first-run banner — one voice at a time.
    const welcomeStorageKey = `schneiders.builder.welcome.dismissed.${tenant.id}`;
    const [welcome_open, set_welcome_open] = useState<boolean>(false);
    useEffect(() => {
        if (!initialWelcome || typeof window === "undefined") return;
        try {
            if (window.localStorage.getItem(welcomeStorageKey) === "true") return;
        } catch {
            /* storage unavailable — still show once this session */
        }
        set_welcome_open(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
    }, []);
    const dismiss_welcome = useCallback((): void => {
        set_welcome_open(false);
        try {
            if (typeof window !== "undefined") {
                window.localStorage.setItem(welcomeStorageKey, "true");
            }
        } catch {
            /* ignore */
        }
    }, [welcomeStorageKey]);
    const set_editor_mode = useCallback(
        (next: EditorMode): void => {
            modeTouchedRef.current = true;
            set_editor_mode_state(next);
            setPreference(PREFERENCE_KEYS.EDITOR_MODE, next, 0);
            if (next === "advanced") {
                const seen = getPreference<boolean>(
                    PREFERENCE_KEYS.EDITOR_MODE_INTRO_SEEN,
                );
                if (!seen) set_mode_intro_open(true);
            }
        },
        [getPreference, setPreference],
    );
    const dismiss_mode_intro = useCallback((): void => {
        set_mode_intro_open(false);
        setPreference(PREFERENCE_KEYS.EDITOR_MODE_INTRO_SEEN, true, 0);
    }, [setPreference]);
    // Simple hides the tablet breakpoint — never leave the canvas stuck on
    // a breakpoint the toolbar can no longer represent.
    useEffect(() => {
        if (editor_mode === "simple" && builder.active_breakpoint === "tablet") {
            builder.set_active_breakpoint("desktop");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- react to mode flips only
    }, [editor_mode]);
    const editorModeCtx = useMemo(
        () => ({ mode: editor_mode, setMode: set_editor_mode }),
        [editor_mode, set_editor_mode],
    );

    // O3: live-activity badges on the Advanced settings buttons, so a
    // running experiment / scheduled change is discoverable from the rail.
    const settingBadges = useMemo<Partial<Record<SettingsSectionId, number>>>(() => {
        const running = builder.config.experiments.filter(
            (e) => e.status === "running",
        ).length;
        return {
            experiments: running,
            segments: builder.config.segments.length,
            scheduled: builder.config.schedules.length,
        };
    }, [builder.config.experiments, builder.config.segments, builder.config.schedules]);

    // Publish confirm sheet state.
    const [publish_sheet_open, set_publish_sheet_open] = useState<boolean>(false);
    // Post-publish celebration dialog — opened after a successful publish.
    const [publish_success_open, set_publish_success_open] = useState<boolean>(false);
    // True once a publish landed THIS session (keeps the launch-checklist
    // "publish" step honest without a reload).
    const [published_session, set_published_session] = useState<boolean>(false);

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

    // BUG29: pages with no valid templates (category, product, cart…)
    // must not offer "start from a template" — the picker would be empty.
    const hasTemplatesForActivePage = useMemo(
        () => templatesForPage(builder.active_page).length > 0,
        [builder.active_page],
    );

    /* ── Canvas zoom (A1) ─────────────────────────────────────────── */
    const [zoom_setting, set_zoom_setting] = useState<"fit" | 0.5 | 0.75 | 1>(1);
    const [canvas_width, set_canvas_width] = useState<number>(0);
    const canvas_zoom = useMemo<number>(() => {
        if (zoom_setting !== "fit") return zoom_setting;
        const deviceW =
            builder.active_breakpoint === "mobile"
                ? 390
                : builder.active_breakpoint === "tablet"
                  ? 820
                  : null;
        if (deviceW === null || canvas_width <= 0) return 1;
        // 32px = the frame's own padding (p-4 both sides).
        return Math.min(1, (canvas_width - 32) / deviceW);
    }, [zoom_setting, builder.active_breakpoint, canvas_width]);

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
            set_canvas_width(c.width);
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

    // UX-09: switching breakpoint resizes the iframe and reflows its content,
    // but the overlay's rects (selection ring, floating toolbar, insert gaps)
    // were measured at the previous width — the ring visibly overflows the new
    // frame. Re-request fresh rects after the reflow settles (two rAFs lets
    // the iframe finish its own layout pass before we measure).
    useEffect(() => {
        if (typeof window === "undefined") return;
        let raf1 = 0;
        let raf2 = 0;
        raf1 = window.requestAnimationFrame(() => {
            raf2 = window.requestAnimationFrame(() => {
                bridge.requestAllRects();
                if (selected_section_id) bridge.requestRect(selected_section_id);
            });
        });
        return () => {
            window.cancelAnimationFrame(raf1);
            window.cancelAnimationFrame(raf2);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measure only on breakpoint flips; selected id is read fresh
    }, [builder.active_breakpoint, bridge]);

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

    // The page the canvas is currently authoring — a system PageId or a
    // custom page (E4). All section/meta mutations + the iframe preview key
    // off this.
    const editTarget = useMemo<EditTarget>(
        () =>
            builder.active_custom_page_id
                ? { kind: "custom", id: builder.active_custom_page_id }
                : { kind: "system", page_id: builder.active_page },
        [builder.active_custom_page_id, builder.active_page],
    );

    // The active edit target as a PageConfig for the iframe live-renderer.
    // Custom pages are sent with their slug as `page_id` (the renderer treats
    // it as opaque; page-conditioned variants never match a custom slug).
    const activePageConfig = useMemo<PreviewPageConfig | null>(() => {
        if (editTarget.kind === "custom") {
            const cp = builder.active_custom_page;
            return cp
                ? { page_id: cp.slug, sections: cp.sections, meta: cp.meta }
                : null;
        }
        return (
            builder.config.pages.find(
                (p) => p.page_id === editTarget.page_id,
            ) ?? null
        );
    }, [editTarget, builder.config.pages, builder.active_custom_page]);

    // Runtime `page_id` for the iframe — the custom slug when authoring one.
    const activeRuntimePageId: PageId | (string & {}) =
        editTarget.kind === "custom"
            ? (builder.active_custom_page?.slug ?? builder.active_page)
            : builder.active_page;

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
            if (activePageConfig) {
                bridge.postPageConfigUpdate(activePageConfig);
            }
            const runtime: RuntimeContext = {
                page_id: activeRuntimePageId,
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
        activePageConfig,
        activeRuntimePageId,
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

    // Author a custom page's sections in the canvas (E4). Exits any system
    // screen + clears the section selection so the canvas opens fresh.
    const handleSelectCustomPage = useCallback(
        (id: string): void => {
            set_system_screen(null);
            set_selected_section_id(null);
            set_editing_section_id(null);
            builder.set_active_custom_page_id(id);
        },
        [builder],
    );

    const handleBrandKitChange = useCallback(
        (next: BrandKit): void => {
            builder.setConfig(
                (prev) => ({ ...prev, brand_kit: next }),
                t(STRINGS.history.edit_brand_kit, builder.active_locale),
            );
        },
        [builder],
    );

    /* ── Section list <-> config plumbing ─────────────────────────── */

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
            // UX2-12: readable undo history — infer the operation from the
            // shape of the change (all add/delete/reorder/edit flows funnel
            // through here, including the mobile shell and context menu).
            const prevSections = activePageSections(builder.config, editTarget);
            const desc =
                next.length > prevSections.length
                    ? STRINGS.history.add_section
                    : next.length < prevSections.length
                      ? STRINGS.history.delete_section
                      : prevSections.some((s, i) => next[i]?.id !== s.id)
                        ? STRINGS.history.reorder_sections
                        : STRINGS.history.edit_section;
            builder.setConfig(
                (prev) => withActivePageSections(prev, editTarget, () => next),
                t(desc, builder.active_locale),
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
                t(STRINGS.history.edit_page_seo, builder.active_locale),
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
                t(STRINGS.history.resize_spacing, builder.active_locale),
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
            if (!activePageConfig) return;
            const nextPage: PreviewPageConfig = {
                ...activePageConfig,
                sections: activePageConfig.sections.map((s) =>
                    s.id === section_id
                        ? { ...s, spacing: { ...(s.spacing ?? {}), bottom_px } }
                        : s,
                ),
            };
            bridge.postPageConfigUpdate(nextPage);
        },
        [activePageConfig, bridge],
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
        return manifest ? sectionDisplayName(manifest, builder.active_locale) : s.type;
    }, [activeSections, selected_section_id, builder.active_locale]);

    // Current bottom spacing of the selected section — seeds the drag handle.
    const selected_spacing_bottom_px = useMemo<number>(() => {
        if (!selected_section_id) return 0;
        const s = activeSections.find((x) => x.id === selected_section_id);
        return s?.spacing?.bottom_px ?? 0;
    }, [activeSections, selected_section_id]);

    // `storefrontUrl` (from useStorefrontUrl) is window-dependent: it resolves
    // to the prod subdomain during SSR (no window) but to localhost:3001 on the
    // client in dev. Emitting it directly makes the iframe `src` (and the Open
    // link) hydrate-mismatch — React keeps the SSR (prod) value and "won't
    // patch it up", so the local-dev preview loads prod + the bridge origin
    // never matches. Gate every storefront URL behind a client-mount flag so
    // SSR and the first client render agree on a placeholder, then swap in the
    // real (client-resolved) URL post-mount.
    const [client_mounted, set_client_mounted] = useState<boolean>(false);
    useEffect(() => {
        set_client_mounted(true);
    }, []);

    const previewUrl = useMemo(
        () =>
            client_mounted
                ? buildPreviewUrl(
                      storefrontUrl,
                      tenant.slug,
                      builder.active_page,
                      builder.active_breakpoint,
                      builder.active_locale,
                      activePreviewToken,
                  )
                : "",
        [
            client_mounted,
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
            client_mounted
                ? buildPreviewUrl(
                      storefrontUrl,
                      tenant.slug,
                      iframe_initial_page.current,
                      iframe_initial_bp.current,
                      iframe_initial_locale.current,
                      activePreviewToken,
                  )
                : "about:blank",
        [client_mounted, storefrontUrl, tenant.slug, activePreviewToken],
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
        // Localized merchant copy per check (UX2-05) — shared with the
        // Health screen and publish sheet via lib/health-check-copy.
        const messages = healthBlocking
            .slice(0, 3)
            .map((c) => checkCopyMessage(c.id, c.message ?? c.id, builder.active_locale));
        const more =
            healthBlocking.length > 3
                ? tFormat(STRINGS.publish.blocked_tooltip_more, builder.active_locale, {
                      n: healthBlocking.length - 3,
                  })
                : "";
        return (
            tFormat(STRINGS.publish.blocked_tooltip, builder.active_locale, {
                n: healthBlocking.length,
                list: messages.join("؛ "),
            }) + more
        );
    }, [healthBlocking, builder.active_locale]);

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

    const handlePublishAnyway = useCallback(async (): Promise<void> => {
        // Keep the sheet open until we know the publish landed — on failure it
        // stays open so the Publish button doubles as Retry (the sheet surfaces
        // the error via builder.save_state).
        const ok = await builder.publish();
        if (ok) {
            set_publish_sheet_open(false);
            set_publish_success_open(true);
            set_published_session(true);
        }
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
            <EditorModeProvider value={editorModeCtx}>
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
                    pageLabel={getPageLabel(builder.active_page, builder.active_locale)}
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
                    activePageId={builder.active_page}
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
                    error={builder.save_state === "error"}
                    config={builder.config}
                    publishedConfig={publishedConfig ?? null}
                />

                <PublishSuccessDialog
                    open={publish_success_open}
                    onClose={() => set_publish_success_open(false)}
                    storeUrl={storefrontUrl}
                />

                <span className="sr-only" data-testid="editor-shell-business-name">
                    {tenant.business_name}
                </span>
            </DndContext>
            </EditorModeProvider>
            </EditorLocaleProvider>
        );
    }

    return (
        <EditorLocaleProvider value={builder.active_locale}>
        <EditorModeProvider value={editorModeCtx}>
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
            <EditorToolbar
                tenantName={tenant.business_name}
                builder={builder}
                editorMode={editor_mode}
                onChangeMode={set_editor_mode}
                previewAs={preview_as}
                onChangePreviewAs={set_preview_as}
                previewUrl={previewUrl}
                onOpenPreviewModal={() => set_preview_modal_open(true)}
                onOpenI18nScreen={() => set_system_screen("i18n")}
                onPublish={handleOpenPublishSheet}
                publishDisabled={publishDisabled}
                publishBusy={publishBusy}
                publishBlockedReason={publishBlockedReason}
            />

            {/* BUG25: another editor published since we loaded — publishing was
                rejected to avoid clobbering their work; prompt a reload. */}
            {builder.publish_conflict && (
                <div
                    role="alert"
                    data-testid="publish-conflict-banner"
                    className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-5 py-2.5 text-sm text-amber-900"
                >
                    <span>{t(STRINGS.publish.conflict_message, builder.active_locale)}</span>
                    <button
                        type="button"
                        onClick={() => {
                            if (typeof window !== "undefined") window.location.reload();
                        }}
                        className="shrink-0 rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-amber-50 transition-opacity hover:opacity-90"
                    >
                        {t(STRINGS.publish.conflict_reload, builder.active_locale)}
                    </button>
                </div>
            )}

            {/* Post-wizard welcome (one card, three facts, one CTA) */}
            {welcome_open && (
                <WelcomeCard
                    locale={builder.active_locale}
                    onDismiss={dismiss_welcome}
                />
            )}

            {/* One-time Advanced-mode intro (first manual switch) */}
            {mode_intro_open && (
                <ModeIntroPopover
                    locale={builder.active_locale}
                    onDismiss={dismiss_mode_intro}
                />
            )}
            {/* Deep link forced Advanced for this visit */}
            {mode_elevated_toast && (
                <ModeElevatedToast
                    locale={builder.active_locale}
                    onDone={() => set_mode_elevated_toast(false)}
                />
            )}

            {/* Main */}
            <div className="flex flex-1 overflow-hidden">
                <PageTree
                    active={builder.active_page}
                    onSelect={handleSelectPage}
                    onSelectSetting={handleSelectSetting}
                    sectionCounts={sectionCounts}
                    customPages={builder.config.custom_pages}
                    activeCustomPageId={builder.active_custom_page_id}
                    onSelectCustomPage={handleSelectCustomPage}
                    onManageCustomPages={() => handleSelectSetting("custom_pages")}
                    activeSettingId={system_screen}
                    settingBadges={settingBadges}
                />
                <main
                    data-testid="editor-shell-main"
                    className={cn(
                        "flex flex-1 overflow-hidden",
                        system_screen !== null && "flex-col",
                    )}
                >
                    {system_screen !== null ? (
                        <SystemScreenRouter
                            screen={system_screen}
                            builder={builder}
                            tenantId={tenant.id}
                            onClose={handleCloseSystemScreen}
                            onBrandKitChange={handleBrandKitChange}
                            onSelectCustomPage={handleSelectCustomPage}
                            onI18nSelectPage={(page) => {
                                set_system_screen(null);
                                builder.set_active_page(page);
                            }}
                            onI18nSelectSection={(page, section_id) => {
                                set_system_screen(null);
                                builder.set_active_page(page);
                                set_selected_section_id(section_id);
                                set_editing_section_id(section_id);
                            }}
                        />
                    ) : (
                        <>
                            <div
                                ref={preview_container_ref}
                                className="sb-canvas relative flex flex-1 flex-col overflow-hidden"
                            >
                                <FirstRunBanner
                                    tenantId={tenant.id}
                                    visible={isFirstTimeTenant && !welcome_open}
                                    isHome={
                                        builder.active_page === "home" &&
                                        !builder.active_custom_page_id
                                    }
                                    pageLabel={
                                        builder.active_custom_page
                                            ? (builder.active_custom_page.title?.[builder.active_locale] ??
                                              builder.active_custom_page.title?.en ??
                                              builder.active_custom_page.slug)
                                            : getPageLabel(builder.active_page, builder.active_locale)
                                    }
                                />
                                <div className="relative flex flex-1 overflow-hidden">
                                    <PreviewFrame
                                        ref={iframe_ref}
                                        url={iframePreviewUrl}
                                        breakpoint={builder.active_breakpoint}
                                        zoom={canvas_zoom}
                                    />
                                </div>
                                {/* Zoom pill (A1) — bottom-left over the canvas */}
                                <div
                                    data-testid="canvas-zoom-pill"
                                    role="radiogroup"
                                    aria-label={t(STRINGS.toolbar.zoom_group, builder.active_locale)}
                                    className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-0.5 rounded-full border border-(--card-border) bg-(--card-bg)/90 p-1 shadow-(--card-shadow) backdrop-blur-sm"
                                >
                                    {([
                                        ["fit", t(STRINGS.toolbar.zoom_fit, builder.active_locale)],
                                        [0.5, "50%"],
                                        [0.75, "75%"],
                                        [1, "100%"],
                                    ] as const).map(([val, label]) => (
                                        <button
                                            key={String(val)}
                                            type="button"
                                            role="radio"
                                            aria-checked={zoom_setting === val}
                                            data-testid={`canvas-zoom-${val}`}
                                            onClick={() => set_zoom_setting(val)}
                                            className={cn(
                                                "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors",
                                                zoom_setting === val
                                                    ? "bg-foreground text-background"
                                                    : "text-muted-foreground hover:text-foreground",
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
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
                                    zoom={canvas_zoom}
                                />
                                {/* Empty-page card ON the canvas — the rail's
                                    template shelf isn't where a first-timer is
                                    looking; a blank white canvas reads broken. */}
                                {activeSections.length === 0 && (
                                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
                                        <div
                                            data-testid="canvas-empty-state"
                                            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-(--card-border) bg-(--card-bg)/95 p-6 text-center shadow-(--card-shadow-hover) backdrop-blur-sm"
                                        >
                                            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                                                <Plus className="h-5 w-5 text-foreground" aria-hidden="true" />
                                            </div>
                                            <h3 className="text-sm font-semibold text-foreground">
                                                {t(STRINGS.section_list.canvas_empty_title, builder.active_locale)}
                                            </h3>
                                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                                {t(
                                                    hasTemplatesForActivePage
                                                        ? STRINGS.section_list.canvas_empty_hint
                                                        : STRINGS.section_list.canvas_empty_hint_no_templates,
                                                    builder.active_locale,
                                                )}
                                            </p>
                                            <div className="mt-4 flex flex-col gap-2">
                                                <button
                                                    type="button"
                                                    data-testid="canvas-empty-add-block"
                                                    onClick={() => {
                                                        set_picker_insert_at(null);
                                                        set_picker_open(true);
                                                    }}
                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                                >
                                                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                                    {t(STRINGS.section_list.empty_first_button, builder.active_locale)}
                                                </button>
                                                {hasTemplatesForActivePage && (
                                                    <button
                                                        type="button"
                                                        data-testid="canvas-empty-template"
                                                        onClick={() => set_template_picker_open(true)}
                                                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-(--card-border) bg-(--background-soft) px-3 text-sm font-medium text-foreground transition-colors hover:border-(--border-hover)"
                                                    >
                                                        {t(STRINGS.section_list.empty_template_button, builder.active_locale)}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <InspectorRail
                                activeTab={inspector_tab}
                                onChangeTab={set_inspector_tab}
                                pageId={builder.active_page}
                                pageLabel={getPageLabel(builder.active_page, builder.active_locale)}
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
                                hasPublished={hasPublished || published_session}
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
                                onSetWhatsappNumber={(value) => {
                                    builder.setConfig(
                                        (prev) => ({
                                            ...prev,
                                            commerce: {
                                                ...(prev.commerce ?? {}),
                                                whatsapp_number: value,
                                            },
                                        }),
                                        t(
                                            STRINGS.health.launch_whatsapp_history,
                                            builder.active_locale,
                                        ),
                                    );
                                }}
                                onSetDeliveryFee={(feeIqd) => {
                                    builder.setConfig(
                                        (prev) => ({
                                            ...prev,
                                            commerce: {
                                                ...(prev.commerce ?? {}),
                                                shipping: {
                                                    ...(prev.commerce?.shipping ?? {}),
                                                    default_rate: {
                                                        ...(prev.commerce?.shipping
                                                            ?.default_rate ?? {}),
                                                        fee_iqd: feeIqd,
                                                    },
                                                },
                                            },
                                        }),
                                        t(
                                            STRINGS.health.launch_delivery_history,
                                            builder.active_locale,
                                        ),
                                    );
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
                pageLabel={getPageLabel(builder.active_page, builder.active_locale)}
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
                activePageId={builder.active_page}
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
                error={builder.save_state === "error"}
                config={builder.config}
                publishedConfig={publishedConfig ?? null}
            />

            {/* Post-publish celebration — the live-URL handoff moment */}
            <PublishSuccessDialog
                open={publish_success_open}
                onClose={() => set_publish_success_open(false)}
                storeUrl={storefrontUrl}
            />

            {/* Hidden business-name anchor for downstream selectors. */}
            <span className="sr-only" data-testid="editor-shell-business-name">
                {tenant.business_name}
            </span>
        </div>
        </DndContext>
        </EditorModeProvider>
        </EditorLocaleProvider>
    );
}
