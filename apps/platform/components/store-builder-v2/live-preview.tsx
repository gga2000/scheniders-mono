"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type {
    Breakpoint,
    LocaleCode,
    PageConfig,
    PageId,
    RuntimeContext,
    SectionInstance,
    StoreConfigV2,
} from "@scheniders/shared";
import { buildBrandKitVars, LOCALE_LABELS } from "@scheniders/shared";
import { RenderPage, RenderSection } from "@scheniders/sections";
import "@scheniders/sections";
import type {
    SectionRenderContext,
    Tenant as SectionTenant,
    Product as SectionProduct,
    Category as SectionCategory,
} from "@scheniders/sections";
import { cn } from "@/lib/utils";
import {
    LivePreviewOverlay,
    type LivePreviewAction,
    type OverlayRect,
} from "./live-preview-overlay";
import {
    LivePreviewContextMenu,
    type LivePreviewContextMenuAction,
} from "./live-preview-context-menu";

/** Minimal tenant shape needed for inline preview — everything else is
 * synthesized so sections that don't read those fields render correctly. */
export interface LivePreviewTenant {
    id: string;
    slug: string;
    business_name: string;
}

function synthesizeTenant(t: LivePreviewTenant): SectionTenant {
    return {
        id: t.id,
        slug: t.slug,
        business_name: t.business_name,
        plan: "free",
        status: "active",
        branding: {} as SectionTenant["branding"],
        settings: {} as SectionTenant["settings"],
    } as SectionTenant;
}

const BREAKPOINT_WIDTH: Record<Breakpoint, string> = {
    mobile: "390px",
    tablet: "820px",
    desktop: "100%",
};

export interface LivePreviewProps {
    config: StoreConfigV2;
    pageId: PageId;
    breakpoint: Breakpoint;
    locale: LocaleCode;
    tenant: LivePreviewTenant;
    products?: SectionProduct[];
    categories?: SectionCategory[];
    governorate?: RuntimeContext["governorate"];
    audienceSegments?: string[];
    abTestArms?: Record<string, string>;
    onSectionClick?: (sectionId: string) => void;
    selectedSectionId?: string | null;
    /** Friendly label for the selected section (shown in the toolbar). */
    selectedSectionLabel?: string | null;
    onEditSection?: (sectionId: string) => void;
    onDeleteSection?: (sectionId: string) => void;
    onSectionAction?: (kind: LivePreviewAction, sectionId: string) => void;
    /**
     * Inline-edit commit callback. Fired (debounced ~300ms) while typing
     * into a `[data-i18n-field]` element, on Enter, and on blur (commit).
     * Not fired on Escape (revert).
     */
    onInlineEdit?: (
        sectionId: string,
        fieldPath: string,
        locale: LocaleCode,
        nextValue: string,
    ) => void;
    /**
     * Fire when the merchant chooses "Add variant" from the right-click
     * context menu. EditorShell opens the section edit panel.
     */
    onAddVariant?: (sectionId: string) => void;
    /**
     * Whether a section picker drag is active. When true the preview
     * renders blue insertion drop zones between every pair of sections
     * (plus one above the first / below the last). Whatever zone the
     * cursor is over highlights via the @dnd-kit `over` event.
     */
    pickerDragActive?: boolean;
    /**
     * Called when the merchant drops a spacing-handle drag. The wrapping
     * section's `bottom_px` is updated. EditorShell forwards this into
     * `setConfig` with description "Resized spacing" for undo support.
     */
    onSpacingChange?: (sectionId: string, bottomPx: number) => void;
    /**
     * Fire when the merchant clicks a Notion-style `+` button between
     * sections (or above the first / below the last). EditorShell opens
     * the section picker with `picker_insert_at = insertAt`.
     */
    onAddAt?: (insertAt: number) => void;
}

export function LivePreview({
    config,
    pageId,
    breakpoint,
    locale,
    tenant,
    products,
    categories,
    governorate,
    audienceSegments,
    abTestArms,
    onSectionClick,
    selectedSectionId,
    selectedSectionLabel,
    onEditSection,
    onDeleteSection,
    onSectionAction,
    onInlineEdit,
    onAddVariant,
    pickerDragActive,
    onSpacingChange,
    onAddAt,
}: LivePreviewProps) {
    const page = useMemo<PageConfig | undefined>(
        () => config.pages.find((p) => p.page_id === pageId),
        [config.pages, pageId],
    );

    const runtime = useMemo<RuntimeContext>(
        () => ({
            page_id: pageId,
            breakpoint,
            locale,
            audience_segments: audienceSegments ?? [],
            ab_test_arms: abTestArms ?? {},
            governorate,
            product_id: undefined,
            category_id: undefined,
            now: new Date(),
        }),
        [pageId, breakpoint, locale, audienceSegments, abTestArms, governorate],
    );

    const renderCtx = useMemo<Omit<SectionRenderContext, "runtime">>(
        () => ({
            tenant: synthesizeTenant(tenant),
            products: products ?? [],
            categories: categories ?? [],
            product: undefined,
            category: undefined,
        }),
        [tenant, products, categories],
    );

    const brandKitVars = useMemo(
        () => buildBrandKitVars(config.brand_kit),
        [config.brand_kit],
    );

    /**
     * Build the Google Fonts URL based on the brand kit's display + body
     * font names. Always include Material Symbols Outlined for the icon
     * font that section primitives use (TrustPill, etc.).
     */
    const googleFontsHref = useMemo(() => {
        const display = config.brand_kit.typography.display.trim();
        const body = config.brand_kit.typography.body.trim();
        const families: string[] = [];
        if (display) families.push(
            `family=${encodeURIComponent(display).replace(/%20/g, "+")}:wght@400;500;600;700;800;900`,
        );
        if (body && body !== display) families.push(
            `family=${encodeURIComponent(body).replace(/%20/g, "+")}:wght@400;500;600;700`,
        );
        families.push("family=Material+Symbols+Outlined:wght,FILL@100..700,0..1");
        return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
    }, [config.brand_kit.typography.display, config.brand_kit.typography.body]);

    /** Inline CSS to map Tailwind's font-* utility classes (used inside
     * section components) to the brand-kit font families. Also adds the
     * dashed hover affordance on editable text inside the SELECTED
     * section (so unselected sections don't get noisy). */
    const fontUtilityCss = useMemo(() => {
        const display = config.brand_kit.typography.display;
        const body = config.brand_kit.typography.body;
        return `
            [data-bk-fonts] .font-display,
            [data-bk-fonts] .font-headline { font-family: "${display}", system-ui, sans-serif; }
            [data-bk-fonts] .font-body,
            [data-bk-fonts] .font-label { font-family: "${body}", system-ui, sans-serif; }
            [data-bk-fonts] { font-family: "${body}", system-ui, sans-serif; }
            [data-bk-fonts] [data-selected-section="true"] [data-i18n-field] {
                cursor: text;
                transition: outline-color 120ms ease-out;
                outline: 1px dashed transparent;
                outline-offset: 2px;
                border-radius: 2px;
            }
            [data-bk-fonts] [data-selected-section="true"] [data-i18n-field]:hover {
                outline-color: var(--bk-primary, #ec4899);
            }
            [data-bk-fonts] [data-selected-section="true"] [data-i18n-field][data-inline-editing="true"] {
                outline: none;
            }
        `;
    }, [config.brand_kit.typography.display, config.brand_kit.typography.body]);

    const promoBar = config.globals?.promo_bar;

    const width = BREAKPOINT_WIDTH[breakpoint];

    // Refs: scroll viewport + scrollable inner content.
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);

    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [hoveredRect, setHoveredRect] = useState<OverlayRect | null>(null);
    const [selectedRect, setSelectedRect] = useState<OverlayRect | null>(null);

    /* ── Inline edit state ──────────────────────────────────────────── */
    interface InlineEditState {
        sectionId: string;
        fieldPath: string;
        originalValue: string;
        targetEl: HTMLElement;
    }
    const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /* ── Context menu state ─────────────────────────────────────────── */
    interface ContextMenuState {
        sectionId: string;
        x: number;
        y: number;
    }
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    /**
     * Compute a section's bounding rect in viewport-local coordinates
     * (the scrolling container is the viewport; the overlay is its sibling).
     */
    const measureSection = useCallback((id: string): OverlayRect | null => {
        const viewport = viewportRef.current;
        if (!viewport) return null;
        const el = viewport.querySelector(
            `[data-section-id="${cssEscape(id)}"]`,
        ) as HTMLElement | null;
        if (!el) return null;
        const er = el.getBoundingClientRect();
        const vr = viewport.getBoundingClientRect();
        return {
            top: er.top - vr.top,
            left: er.left - vr.left,
            width: er.width,
            height: er.height,
        };
    }, []);

    /* ── Track selected rect: ResizeObserver + scroll/resize listeners ── */
    useEffect(() => {
        if (!selectedSectionId) {
            setSelectedRect(null);
            return;
        }
        const viewport = viewportRef.current;
        if (!viewport) return;
        const update = () => {
            setSelectedRect(measureSection(selectedSectionId));
        };
        update();

        let ro: ResizeObserver | null = null;
        const el = viewport.querySelector(
            `[data-section-id="${cssEscape(selectedSectionId)}"]`,
        ) as HTMLElement | null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(update);
            if (el) ro.observe(el);
            ro.observe(viewport);
        }
        viewport.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            ro?.disconnect();
            viewport.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [selectedSectionId, measureSection, page, breakpoint]);

    /* ── Toggle `data-selected-section` on the wrapping section div ───
     * RenderSection (outside this file) owns the `[data-section-id]`
     * wrapper. We tag it imperatively so the CSS hover affordance can
     * target descendant `[data-i18n-field]` elements only inside the
     * currently selected section. */
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        // Clear any stale attribute.
        viewport
            .querySelectorAll('[data-selected-section="true"]')
            .forEach((el) => {
                (el as HTMLElement).removeAttribute("data-selected-section");
            });
        if (!selectedSectionId) return;
        const el = viewport.querySelector(
            `[data-section-id="${cssEscape(selectedSectionId)}"]`,
        ) as HTMLElement | null;
        if (el) el.setAttribute("data-selected-section", "true");
    }, [selectedSectionId, page, breakpoint]);

    /* ── Track hovered rect ───────────────────────────────────────────── */
    useEffect(() => {
        if (!hoveredId) {
            setHoveredRect(null);
            return;
        }
        setHoveredRect(measureSection(hoveredId));
    }, [hoveredId, measureSection, page, breakpoint, selectedRect]);

    /* ── Hovered i18n field (for the pencil chip) ──────────────────── */
    const [hoveredI18nField, setHoveredI18nField] = useState<{
        el: HTMLElement;
        field: string;
    } | null>(null);
    const [hoveredI18nRect, setHoveredI18nRect] = useState<OverlayRect | null>(
        null,
    );

    /* ── Click + hover capture on the content tree ──────────────────── */
    useEffect(() => {
        const root = contentRef.current;
        if (!root) return;

        const findSectionId = (target: EventTarget | null): string | null => {
            const el = (target as HTMLElement | null)?.closest("[data-section-id]") as
                | HTMLElement
                | null;
            return el?.getAttribute("data-section-id") ?? null;
        };
        const findI18nField = (
            target: EventTarget | null,
        ): { el: HTMLElement; field: string } | null => {
            const el = (target as HTMLElement | null)?.closest(
                "[data-i18n-field]",
            ) as HTMLElement | null;
            if (!el) return null;
            const field = el.getAttribute("data-i18n-field");
            if (!field) return null;
            return { el, field };
        };
        /** True if the click target sits inside an interactive control
         * (anchor/button/input/textarea/select/label) BELOW the i18n
         * field. We still want to edit headings that wrap a link, so
         * only block if the interactive ancestor is INSIDE the field. */
        const isInteractiveDescendant = (
            target: EventTarget | null,
            fieldEl: HTMLElement,
        ): boolean => {
            const tgt = target as HTMLElement | null;
            if (!tgt) return false;
            const interactive = tgt.closest(
                "a, button, input, textarea, select, label, [role='button']",
            ) as HTMLElement | null;
            if (!interactive) return false;
            return fieldEl.contains(interactive) && interactive !== fieldEl;
        };

        const enterInlineEdit = (
            sectionId: string,
            hit: { el: HTMLElement; field: string },
        ): void => {
            const originalValue = hit.el.textContent ?? "";
            hit.el.setAttribute("contenteditable", "true");
            hit.el.setAttribute("data-inline-editing", "true");
            hit.el.focus();
            try {
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(hit.el);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
            } catch {
                /* ignore */
            }
            setInlineEdit({
                sectionId,
                fieldPath: hit.field,
                originalValue,
                targetEl: hit.el,
            });
        };

        const handleClick = (e: MouseEvent) => {
            // Ignore clicks that originate inside the active inline-edit
            // element so the contenteditable can manage its own selection.
            const targetEl = e.target as HTMLElement | null;
            if (
                inlineEdit &&
                targetEl &&
                inlineEdit.targetEl.contains(targetEl)
            ) {
                return;
            }
            const id = findSectionId(e.target);
            if (!id) return;
            // Single-click an editable text inside the SELECTED section →
            // enter inline-edit mode immediately. First-time merchants
            // expect to click-to-edit; dblclick remains as fallback.
            if (onInlineEdit && id === selectedSectionId) {
                const hit = findI18nField(e.target);
                if (hit && !isInteractiveDescendant(e.target, hit.el)) {
                    e.preventDefault();
                    e.stopPropagation();
                    enterInlineEdit(id, hit);
                    return;
                }
            }
            if (onSectionClick) onSectionClick(id);
        };
        const handleMove = (e: MouseEvent) => {
            const id = findSectionId(e.target);
            setHoveredId(id);
            // Pencil-chip hover only matters inside the selected section.
            if (id && id === selectedSectionId) {
                const hit = findI18nField(e.target);
                setHoveredI18nField((curr) => {
                    if (!hit) return null;
                    if (curr && curr.el === hit.el) return curr;
                    return hit;
                });
            } else {
                setHoveredI18nField(null);
            }
        };
        const handleLeave = () => {
            setHoveredId(null);
            setHoveredI18nField(null);
        };

        const handleDoubleClick = (e: MouseEvent) => {
            if (!onInlineEdit) return;
            const sectionId = findSectionId(e.target);
            if (!sectionId || sectionId !== selectedSectionId) return;
            const hit = findI18nField(e.target);
            if (!hit) return;
            if (isInteractiveDescendant(e.target, hit.el)) return;
            e.preventDefault();
            e.stopPropagation();
            enterInlineEdit(sectionId, hit);
        };

        const handleContextMenu = (e: MouseEvent) => {
            const sectionId = findSectionId(e.target);
            if (!sectionId) return;
            e.preventDefault();
            if (onSectionClick) onSectionClick(sectionId);
            const viewport = viewportRef.current;
            const vr = viewport?.getBoundingClientRect();
            setContextMenu({
                sectionId,
                x: vr ? e.clientX - vr.left : e.clientX,
                y: vr ? e.clientY - vr.top : e.clientY,
            });
        };

        root.addEventListener("click", handleClick);
        root.addEventListener("mousemove", handleMove);
        root.addEventListener("mouseleave", handleLeave);
        root.addEventListener("dblclick", handleDoubleClick);
        root.addEventListener("contextmenu", handleContextMenu);
        return () => {
            root.removeEventListener("click", handleClick);
            root.removeEventListener("mousemove", handleMove);
            root.removeEventListener("mouseleave", handleLeave);
            root.removeEventListener("dblclick", handleDoubleClick);
            root.removeEventListener("contextmenu", handleContextMenu);
        };
    }, [onSectionClick, onInlineEdit, selectedSectionId, inlineEdit]);

    /* ── Inline edit: input/keydown/blur on the target element ──── */
    useEffect(() => {
        if (!inlineEdit) return;
        const el = inlineEdit.targetEl;

        const commit = (value: string) => {
            if (onInlineEdit) {
                onInlineEdit(
                    inlineEdit.sectionId,
                    inlineEdit.fieldPath,
                    locale,
                    value,
                );
            }
        };
        const exitEditMode = (revert: boolean) => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
            if (revert) {
                el.textContent = inlineEdit.originalValue;
            } else {
                // Final commit (in case last debounce hadn't fired).
                commit(el.textContent ?? "");
            }
            el.removeAttribute("contenteditable");
            el.removeAttribute("data-inline-editing");
            setInlineEdit(null);
        };

        const onInput = () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                commit(el.textContent ?? "");
            }, 300);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                exitEditMode(false);
            } else if (e.key === "Escape") {
                e.preventDefault();
                exitEditMode(true);
            }
        };
        const onBlur = () => {
            exitEditMode(false);
        };

        el.addEventListener("input", onInput);
        el.addEventListener("keydown", onKeyDown);
        el.addEventListener("blur", onBlur);
        return () => {
            el.removeEventListener("input", onInput);
            el.removeEventListener("keydown", onKeyDown);
            el.removeEventListener("blur", onBlur);
        };
    }, [inlineEdit, locale, onInlineEdit]);

    const handleEdit = useCallback(() => {
        if (selectedSectionId && onEditSection) onEditSection(selectedSectionId);
    }, [selectedSectionId, onEditSection]);

    const handleDelete = useCallback(() => {
        if (selectedSectionId && onDeleteSection) onDeleteSection(selectedSectionId);
    }, [selectedSectionId, onDeleteSection]);

    const handleAction = useCallback(
        (kind: LivePreviewAction) => {
            if (selectedSectionId && onSectionAction)
                onSectionAction(kind, selectedSectionId);
        },
        [selectedSectionId, onSectionAction],
    );

    /* ── Context menu handlers ────────────────────────────────────── */

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleContextMenuAction = useCallback(
        (action: LivePreviewContextMenuAction): void => {
            if (!contextMenu) return;
            const id = contextMenu.sectionId;
            setContextMenu(null);
            switch (action) {
                case "edit":
                    onEditSection?.(id);
                    break;
                case "duplicate":
                    onSectionAction?.("duplicate", id);
                    break;
                case "up":
                    onSectionAction?.("up", id);
                    break;
                case "down":
                    onSectionAction?.("down", id);
                    break;
                case "add_variant":
                    onAddVariant?.(id);
                    break;
                case "delete":
                    onDeleteSection?.(id);
                    break;
            }
        },
        [contextMenu, onEditSection, onSectionAction, onAddVariant, onDeleteSection],
    );

    /* ── Spacing-handle drag state ─────────────────────────────── */

    interface SpacingDragState {
        sectionId: string;
        startY: number;
        startBottomPx: number;
        currentBottomPx: number;
    }
    const [spacingDrag, setSpacingDrag] = useState<SpacingDragState | null>(
        null,
    );
    // Mirror of `currentBottomPx` so the mouseup handler reads the live
    // value without restarting the effect on every mousemove.
    const spacingDragValueRef = useRef<number>(0);

    const beginSpacingDrag = useCallback(
        (sectionId: string, startY: number) => {
            // Initial value is the section's current spacing.bottom_px (or 0).
            const section = page?.sections.find((s) => s.id === sectionId);
            const initial = section?.spacing?.bottom_px ?? 0;
            spacingDragValueRef.current = initial;
            setSpacingDrag({
                sectionId,
                startY,
                startBottomPx: initial,
                currentBottomPx: initial,
            });
        },
        [page],
    );

    useEffect(() => {
        if (!spacingDrag) return;
        const { sectionId, startY, startBottomPx } = spacingDrag;
        const onMove = (e: MouseEvent) => {
            const delta = e.clientY - startY;
            // 1px per pixel, snap to 4px grid, clamp [0, 200].
            const raw = startBottomPx + delta;
            const snapped = Math.round(raw / 4) * 4;
            const clamped = Math.max(0, Math.min(200, snapped));
            spacingDragValueRef.current = clamped;
            setSpacingDrag((cur) =>
                cur && cur.currentBottomPx !== clamped
                    ? { ...cur, currentBottomPx: clamped }
                    : cur,
            );
        };
        const onUp = () => {
            if (onSpacingChange) {
                onSpacingChange(sectionId, spacingDragValueRef.current);
            }
            setSpacingDrag(null);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp, { once: true });
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        // We only want the listeners installed once per drag start —
        // not torn down on every mousemove-driven state change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spacingDrag?.sectionId]);

    /* ── Inline-edit highlight: pink outline + hint pill ─────────── */

    /* ── Track section gap rects (between/around section pairs) ───── */
    //
    // We measure every section's bounding rect to know where to draw
    // a 12px spacing-handle strip and the picker drop zones. The list
    // length is sections.length + 1 (one slot above each section + one
    // below the last).

    const sectionIds = useMemo<string[]>(
        () => (page?.sections.map((s) => s.id) ?? []),
        [page],
    );

    interface GapRect {
        /** y position (viewport-local). */
        top: number;
        left: number;
        width: number;
    }
    const [gapRects, setGapRects] = useState<GapRect[]>([]);

    const measureGaps = useCallback(() => {
        const viewport = viewportRef.current;
        const content = contentRef.current;
        if (!viewport || !content) {
            setGapRects([]);
            return;
        }
        const vr = viewport.getBoundingClientRect();
        const cr = content.getBoundingClientRect();
        const rects: GapRect[] = [];
        if (sectionIds.length === 0) {
            // Single drop zone in an empty page (at the content top).
            rects.push({
                top: cr.top - vr.top + viewport.scrollTop,
                left: 0,
                width: vr.width,
            });
        } else {
            for (let i = 0; i < sectionIds.length; i++) {
                const id = sectionIds[i];
                const el = viewport.querySelector(
                    `[data-section-id="${cssEscape(id)}"]`,
                ) as HTMLElement | null;
                if (!el) continue;
                const er = el.getBoundingClientRect();
                // Gap above this section.
                rects.push({
                    top: er.top - vr.top + viewport.scrollTop,
                    left: er.left - vr.left,
                    width: er.width,
                });
                // Gap below the last section.
                if (i === sectionIds.length - 1) {
                    rects.push({
                        top: er.bottom - vr.top + viewport.scrollTop,
                        left: er.left - vr.left,
                        width: er.width,
                    });
                }
            }
        }
        setGapRects(rects);
    }, [sectionIds]);

    useEffect(() => {
        measureGaps();
        const viewport = viewportRef.current;
        if (!viewport) return;
        const update = () => measureGaps();
        viewport.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(update);
            ro.observe(viewport);
            const content = contentRef.current;
            if (content) ro.observe(content);
        }
        return () => {
            viewport.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            ro?.disconnect();
        };
    }, [measureGaps, breakpoint, page, spacingDrag?.currentBottomPx]);

    /* ── Track hovered i18n field rect for the pencil chip ───────── */
    useEffect(() => {
        if (!hoveredI18nField || inlineEdit) {
            setHoveredI18nRect(null);
            return;
        }
        const viewport = viewportRef.current;
        if (!viewport) return;
        const update = () => {
            const er = hoveredI18nField.el.getBoundingClientRect();
            const vr = viewport.getBoundingClientRect();
            setHoveredI18nRect({
                top: er.top - vr.top,
                left: er.left - vr.left,
                width: er.width,
                height: er.height,
            });
        };
        update();
        viewport.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(update);
            ro.observe(hoveredI18nField.el);
        }
        return () => {
            viewport.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            ro?.disconnect();
        };
    }, [hoveredI18nField, inlineEdit]);

    const [inlineEditRect, setInlineEditRect] = useState<OverlayRect | null>(null);
    useEffect(() => {
        if (!inlineEdit) {
            setInlineEditRect(null);
            return;
        }
        const viewport = viewportRef.current;
        if (!viewport) return;
        const update = () => {
            const er = inlineEdit.targetEl.getBoundingClientRect();
            const vr = viewport.getBoundingClientRect();
            setInlineEditRect({
                top: er.top - vr.top,
                left: er.left - vr.left,
                width: er.width,
                height: er.height,
            });
        };
        update();
        viewport.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(update);
            ro.observe(inlineEdit.targetEl);
        }
        return () => {
            viewport.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            ro?.disconnect();
        };
    }, [inlineEdit]);

    return (
        <div
            data-testid="live-preview"
            data-breakpoint={breakpoint}
            className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/30 p-4"
        >
            <div
                ref={viewportRef}
                data-testid="live-preview-viewport"
                className={cn(
                    "relative h-full overflow-auto rounded-lg border border-(--card-border) bg-white shadow-sm transition-[width] duration-200 ease-out",
                )}
                style={{ width, maxWidth: "100%" }}
            >
                {/* React 19 hoists these to <head> so the fonts load once. */}
                <link rel="stylesheet" href={googleFontsHref} />
                <style>{fontUtilityCss}</style>

                <div
                    ref={contentRef}
                    data-selected-section-id={selectedSectionId ?? undefined}
                    data-bk-fonts=""
                    style={brandKitVars}
                    className="min-h-full bg-(--bk-surface,white) text-(--bk-ink,#111)"
                >
                    {promoBar?.enabled !== false && promoBar ? (
                        <RenderSection
                            instance={promoBar}
                            runtime={runtime}
                            renderCtx={renderCtx}
                        />
                    ) : null}
                    {page ? (
                        <RenderPage
                            page={
                                spacingDrag
                                    ? {
                                          ...page,
                                          sections: page.sections.map((s) =>
                                              s.id === spacingDrag.sectionId
                                                  ? {
                                                        ...s,
                                                        spacing: {
                                                            ...(s.spacing ?? {}),
                                                            bottom_px:
                                                                spacingDrag.currentBottomPx,
                                                        },
                                                    }
                                                  : s,
                                          ),
                                      }
                                    : page
                            }
                            runtime={runtime}
                            renderCtx={renderCtx}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
                            No page config for{" "}
                            <code className="ml-1 rounded bg-muted px-1.5 py-0.5">
                                {pageId}
                            </code>
                        </div>
                    )}
                </div>

                {/* Overlay lives inside the viewport so it scrolls with content */}
                <LivePreviewOverlay
                    hoveredRect={hoveredRect}
                    selectedRect={selectedRect}
                    selectedSectionLabel={selectedSectionLabel ?? null}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onAction={handleAction}
                />

                {/* Pencil-chip hover affordance over editable text */}
                {hoveredI18nRect && !inlineEdit ? (
                    <span
                        data-testid="live-preview-inline-edit-chip"
                        aria-hidden="true"
                        className="pointer-events-none absolute z-20 inline-flex h-5 select-none items-center gap-1 rounded-md px-1.5 font-semibold text-white shadow"
                        style={{
                            top: Math.max(0, hoveredI18nRect.top - 22),
                            left:
                                hoveredI18nRect.left +
                                hoveredI18nRect.width -
                                42,
                            backgroundColor: "var(--bk-primary, #ec4899)",
                            fontSize: "11px",
                            lineHeight: "1",
                        }}
                    >
                        <span aria-hidden="true">✏</span>
                        <span>Edit</span>
                    </span>
                ) : null}

                {/* Inline-edit highlight + hint pill */}
                {inlineEditRect ? (
                    <div
                        data-testid="live-preview-inline-edit-highlight"
                        aria-hidden="true"
                        className="pointer-events-none absolute z-20 rounded-md border-2 border-solid"
                        style={{
                            top: inlineEditRect.top - 4,
                            left: inlineEditRect.left - 4,
                            width: inlineEditRect.width + 8,
                            height: inlineEditRect.height + 8,
                            borderColor: "var(--bk-primary, #ec4899)",
                            boxShadow: "0 0 0 4px rgba(236, 72, 153, 0.15)",
                        }}
                    >
                        <span
                            data-testid="live-preview-inline-edit-hint"
                            className="absolute -top-7 left-0 inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[10px] font-semibold text-white shadow"
                            style={{
                                backgroundColor: "var(--bk-primary, #ec4899)",
                            }}
                        >
                            <span aria-hidden="true">↵</span> save · Esc cancel · (Editing in {LOCALE_LABELS[locale]})
                        </span>
                    </div>
                ) : null}

                {/* Right-click context menu */}
                {contextMenu ? (
                    <LivePreviewContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        onClose={closeContextMenu}
                        onAction={handleContextMenuAction}
                    />
                ) : null}

                {/* Spacing handles — between every pair of sections plus
                    above the first and below the last. Hidden while
                    inline-editing or while a context menu is open so
                    they don't fight the existing selection UX. */}
                {!inlineEdit && !contextMenu && sectionIds.length > 0
                    ? gapRects.map((rect, idx) => {
                          // The strip above each section adjusts the
                          // *previous* section's bottom_px (or the first
                          // section's top_px for idx === 0). For
                          // simplicity / parity with the brief: each
                          // handle resizes the section ABOVE it
                          // (`bottom_px`). The strip above section 0
                          // resizes the first section's `top_px` — but
                          // the brief says to drive `bottom_px` of the
                          // section above, so that strip is skipped.
                          const aboveSectionIdx =
                              idx === 0 ? -1 : idx - 1;
                          if (aboveSectionIdx < 0) return null;
                          const sectionId = sectionIds[aboveSectionIdx];
                          if (!sectionId) return null;
                          const isDragging =
                              spacingDrag?.sectionId === sectionId;
                          const currentValue = isDragging
                              ? spacingDrag.currentBottomPx
                              : page?.sections.find((s) => s.id === sectionId)
                                    ?.spacing?.bottom_px ?? 0;
                          return (
                              <SpacingHandle
                                  key={`spacing-${sectionId}`}
                                  rect={rect}
                                  isDragging={!!isDragging}
                                  valuePx={currentValue}
                                  onBeginDrag={(y) =>
                                      beginSpacingDrag(sectionId, y)
                                  }
                              />
                          );
                      })
                    : null}

                {/* Notion-style `+` insertion buttons — one centered on
                    every gap (above every section + below the last).
                    Hidden while inline-editing, while a context menu is
                    open, or while a picker drag is in progress (the
                    blue drop line covers placement during a drag). */}
                {!inlineEdit && !contextMenu && !pickerDragActive && onAddAt
                    ? gapRects.map((rect, idx) => (
                          <InsertSectionButton
                              key={`insert-${idx}`}
                              insertAt={idx}
                              rect={rect}
                              onAdd={onAddAt}
                              hasSpacingHandle={idx >= 1}
                          />
                      ))
                    : null}

                {/* Picker drop zones — one between every pair of
                    sections + one above the first + one below the last.
                    The cursor's `over` state shows the blue insertion
                    line. Each zone owns its own droppable id encoding
                    the insert index. */}
                {pickerDragActive
                    ? gapRects.map((rect, idx) => (
                          <PickerDropZone
                              key={`drop-${idx}`}
                              insertAt={idx}
                              rect={rect}
                          />
                      ))
                    : null}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Spacing handle strip                                                */
/* ─────────────────────────────────────────────────────────────────── */

interface SpacingHandleProps {
    rect: { top: number; left: number; width: number };
    isDragging: boolean;
    valuePx: number;
    onBeginDrag: (clientY: number) => void;
}

function SpacingHandle({
    rect,
    isDragging,
    valuePx,
    onBeginDrag,
}: SpacingHandleProps): React.ReactElement {
    const [hover, setHover] = useState<boolean>(false);
    const [longPressed, setLongPressed] = useState<boolean>(false);
    const [showHint, setShowHint] = useState<boolean>(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartYRef = useRef<number | null>(null);
    const touchOriginYRef = useRef<number | null>(null);
    const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const visible = isDragging || hover || longPressed;

    const cancelLongPress = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    // Cleanup on unmount.
    useEffect(() => {
        return () => {
            cancelLongPress();
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        };
    }, [cancelLongPress]);

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>): void => {
        const touch = e.touches[0];
        if (!touch) return;
        touchStartYRef.current = touch.clientY;
        touchOriginYRef.current = touch.clientY;
        cancelLongPress();
        longPressTimerRef.current = setTimeout(() => {
            setLongPressed(true);
            setShowHint(true);
            if (touchOriginYRef.current !== null) {
                onBeginDrag(touchOriginYRef.current);
            }
            if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
            hintTimerRef.current = setTimeout(() => setShowHint(false), 1000);
        }, 400);
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>): void => {
        const touch = e.touches[0];
        if (!touch) return;
        const startY = touchStartYRef.current;
        if (startY === null) return;
        if (!longPressed) {
            // Cancel long-press if the merchant moves before fire.
            if (Math.abs(touch.clientY - startY) > 6) {
                cancelLongPress();
                touchStartYRef.current = null;
            }
            return;
        }
        // Once long-pressed, prevent page scroll during drag.
        if (e.cancelable) e.preventDefault();
        // The parent's mousemove handler is keyed to clientY; we
        // synthesize a mousemove event to drive the drag from touch.
        window.dispatchEvent(
            new MouseEvent("mousemove", {
                clientY: touch.clientY,
                bubbles: true,
            }),
        );
    };

    const handleTouchEnd = (): void => {
        cancelLongPress();
        if (longPressed) {
            window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            setLongPressed(false);
        }
        touchStartYRef.current = null;
        touchOriginYRef.current = null;
    };

    return (
        <div
            data-testid="live-preview-spacing-handle"
            data-spacing-value={valuePx}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBeginDrag(e.clientY);
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className="pointer-events-auto absolute z-30 flex cursor-ns-resize items-center justify-center"
            style={{
                top: rect.top - 6,
                left: rect.left,
                width: rect.width,
                height: 12,
                touchAction: "none",
            }}
        >
            {/* Thin gridline at rest — 20% opacity, 100% when active. */}
            <span
                aria-hidden="true"
                data-testid="live-preview-spacing-handle-gridline"
                className="pointer-events-none absolute left-0 right-0 h-px"
                style={{
                    top: 6,
                    backgroundColor: "var(--bk-divider, #e5e7eb)",
                    opacity: visible ? 1 : 0.2,
                    transition: "opacity 120ms ease-out",
                }}
            />
            {visible ? (
                <span
                    data-testid="live-preview-spacing-handle-pill"
                    className="inline-flex h-5 select-none items-center gap-1 rounded-full px-2 text-[10px] font-semibold text-white shadow"
                    style={{
                        backgroundColor: "rgb(16, 185, 129)",
                    }}
                >
                    <span aria-hidden="true">↕</span>
                    {valuePx}px
                </span>
            ) : null}
            {showHint ? (
                <span
                    data-testid="live-preview-spacing-handle-hint"
                    className="pointer-events-none absolute -top-7 inline-flex h-6 select-none items-center whitespace-nowrap rounded-md bg-foreground/90 px-2 text-[10px] font-medium text-background shadow"
                >
                    Drag to adjust spacing
                </span>
            ) : null}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Notion-style `+` insertion button                                   */
/* ─────────────────────────────────────────────────────────────────── */

interface InsertSectionButtonProps {
    insertAt: number;
    rect: { top: number; left: number; width: number };
    onAdd: (insertAt: number) => void;
    /** True if a spacing handle is also rendered at this gap — shifts
     * the `+` left slightly so the spacing pill (rendered to the right
     * of center) doesn't overlap. The `+` stays centered horizontally;
     * the spacing pill is rendered separately and sits centered too,
     * but only one is visible at a time outside hover — so co-existence
     * is mainly a hover concern. We keep both centered. */
    hasSpacingHandle: boolean;
}

function InsertSectionButton({
    insertAt,
    rect,
    onAdd,
    hasSpacingHandle,
}: InsertSectionButtonProps): React.ReactElement {
    const [hover, setHover] = useState<boolean>(false);
    return (
        <div
            data-testid={`live-preview-insert-button-${insertAt}`}
            data-insert-at={insertAt}
            data-has-spacing-handle={hasSpacingHandle ? "true" : "false"}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            // 44px touch target — sits above the 12px gap zone (z-31 so
            // the `+` is on top of the spacing handle's gridline but the
            // spacing pill still wins on hover, since both occupy the
            // same strip).
            className="pointer-events-auto absolute z-30 flex items-center justify-center"
            style={{
                top: rect.top - 22,
                left: rect.left,
                width: rect.width,
                height: 44,
            }}
        >
            <button
                type="button"
                aria-label="Add section here"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAdd(insertAt);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                data-testid={`live-preview-insert-button-${insertAt}-trigger`}
                className="schn-insert-btn group inline-flex h-7 w-7 items-center justify-center rounded-full text-white shadow transition-opacity"
                style={{
                    backgroundColor: "var(--bk-primary, #ec4899)",
                    opacity: hover ? 1 : 0,
                }}
            >
                <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            {/* Always-visible on touch devices so merchants can tap. */}
            <style>{`
                @media (hover: none) {
                    [data-testid="live-preview-insert-button-${insertAt}-trigger"] {
                        opacity: 1 !important;
                    }
                }
            `}</style>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Picker drop-zone strip                                              */
/* ─────────────────────────────────────────────────────────────────── */

interface PickerDropZoneProps {
    insertAt: number;
    rect: { top: number; left: number; width: number };
}

function PickerDropZone({ insertAt, rect }: PickerDropZoneProps): React.ReactElement {
    const { isOver, setNodeRef } = useDroppable({
        id: `live-preview-drop-${insertAt}`,
        data: { insertAt },
    });
    return (
        <div
            ref={setNodeRef}
            data-testid={`live-preview-drop-zone-${insertAt}`}
            data-insert-at={insertAt}
            data-over={isOver ? "true" : "false"}
            className="pointer-events-auto absolute z-40 flex items-center justify-center"
            style={{
                top: rect.top - 12,
                left: rect.left,
                width: rect.width,
                height: 24,
            }}
        >
            {isOver ? (
                <div
                    data-testid={`live-preview-drop-line-${insertAt}`}
                    className="absolute left-0 right-0 h-1 rounded-full"
                    style={{
                        backgroundColor: "var(--bk-primary, #2563eb)",
                        animation: "schn-drop-line-in 120ms ease-out",
                        boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.18)",
                    }}
                />
            ) : null}
        </div>
    );
}

/** Minimal CSS.escape polyfill for older test environments. */
function cssEscape(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
