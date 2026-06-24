"use client";

// =====================================================================
// PreviewOverlay — click-to-edit visual overlay
// =====================================================================
// Layered on top of the storefront preview iframe. Reads hover/selected
// rects out of `useIframeBridge` and renders dashed/solid rings around
// the corresponding section. The selected ring also gets a floating
// toolbar (Edit / Duplicate / Up / Down / Delete).
//
// The container is `pointer-events-none` so the iframe stays clickable;
// only the toolbar opts back into `pointer-events-auto`.
// =====================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import {
    ArrowDown,
    ArrowUp,
    Copy,
    Pencil,
    Plus,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
    PreviewRect,
    UseIframeBridgeReturn,
} from "@/hooks/use-iframe-bridge";
import {
    LivePreviewContextMenu,
    type LivePreviewContextMenuAction,
} from "./live-preview-context-menu";

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export type PreviewOverlayActionKind = "duplicate" | "up" | "down";

export interface PreviewOverlayAction {
    kind: PreviewOverlayActionKind;
    section_id: string;
}

/** Open right-click menu state, in iframe-local viewport coords. */
export interface PreviewOverlayContextMenu {
    section_id: string;
    x: number;
    y: number;
}

export interface PreviewOverlayProps {
    bridge: UseIframeBridgeReturn;
    selected_section_id: string | null;
    selected_section_label?: string | null;
    onEditRequest: (section_id: string) => void;
    onDeleteRequest: (section_id: string) => void;
    onAction: (action: PreviewOverlayAction) => void;
    /** Bounds of the iframe in the editor viewport — aligns overlay coords. */
    iframeBounds: DOMRect | null;
    /** Open context menu (null when closed). Coords are iframe-local. */
    contextMenu?: PreviewOverlayContextMenu | null;
    onContextMenuClose?: () => void;
    onContextMenuAction?: (action: LivePreviewContextMenuAction) => void;
    /**
     * Click a Notion-style `+` between sections. `insertAt` is the index the
     * new section should land at (0 = before the first, length = after last).
     * Derived from `bridge.state.all_rects`.
     */
    onAddAt?: (insertAt: number) => void;
    /** Current bottom spacing (px) of the selected section — seeds the drag. */
    selectedSpacingBottomPx?: number;
    /** Live drag feedback — editor posts a transient config to the iframe. */
    onSpacingPreview?: (section_id: string, bottom_px: number) => void;
    /** Drag committed — editor writes the spacing into the config (undoable). */
    onSpacingChange?: (section_id: string, bottom_px: number) => void;
}

const SPACING_SNAP_PX = 4;
const SPACING_MAX_PX = 200;

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

const SCROLL_HIDE_DEBOUNCE_MS = 120;

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function PreviewOverlay(props: PreviewOverlayProps): ReactElement | null {
    const {
        bridge,
        selected_section_id,
        selected_section_label,
        onEditRequest,
        onDeleteRequest,
        onAction,
        iframeBounds,
        contextMenu,
        onContextMenuClose,
        onContextMenuAction,
        onAddAt,
        selectedSpacingBottomPx,
        onSpacingPreview,
        onSpacingChange,
    } = props;

    const { state, requestRect } = bridge;

    // Track whether the iframe is currently scrolling — if so, hide hover
    // ring and refresh the selected rect on every scroll tick.
    const [scrolling, setScrolling] = useState<boolean>(false);
    const last_scroll_y_ref = useRef<number | null>(null);

    useEffect(() => {
        // Skip the initial mount — only react to actual scroll deltas.
        if (last_scroll_y_ref.current === null) {
            last_scroll_y_ref.current = state.scroll_y;
            return;
        }
        if (last_scroll_y_ref.current === state.scroll_y) return;
        last_scroll_y_ref.current = state.scroll_y;
        setScrolling(true);
        const t = setTimeout(
            () => setScrolling(false),
            SCROLL_HIDE_DEBOUNCE_MS,
        );
        // Re-query the selected section's rect on every scroll event so
        // the selection ring follows.
        if (selected_section_id) requestRect(selected_section_id);
        return () => clearTimeout(t);
    }, [state.scroll_y, selected_section_id, requestRect]);

    const hovered_rect: PreviewRect | null =
        state.hovered_section_id && state.hovered_section_id !== selected_section_id
            ? state.hovered_rect
            : null;

    // Selected rect = latest rect_update for this section, falling back to
    // the click rect that seeded rect_updates.
    const selected_rect: PreviewRect | null = selected_section_id
        ? (state.rect_updates[selected_section_id] ?? null)
        : null;

    // Insert-`+` gap slots derived from every section's rect (document order):
    // one above each section, plus one below the last. Coords are iframe-local,
    // which map directly to this container (positioned at the iframe bounds).
    const insert_gaps = useMemo<{ top: number; left: number; width: number; insertAt: number }[]>(() => {
        if (!onAddAt) return [];
        const rects = state.all_rects;
        if (rects.length === 0) return [];
        const gaps = rects.map((r, i) => ({
            top: r.rect.top,
            left: r.rect.left,
            width: r.rect.width,
            insertAt: i,
        }));
        const last = rects[rects.length - 1].rect;
        gaps.push({
            top: last.top + last.height,
            left: last.left,
            width: last.width,
            insertAt: rects.length,
        });
        return gaps;
    }, [state.all_rects, onAddAt]);

    const handleEdit = useCallback(() => {
        if (selected_section_id) onEditRequest(selected_section_id);
    }, [onEditRequest, selected_section_id]);

    const handleDelete = useCallback(() => {
        if (!selected_section_id) return;
        onDeleteRequest(selected_section_id);
    }, [onDeleteRequest, selected_section_id]);

    const handleAction = useCallback(
        (kind: PreviewOverlayActionKind): void => {
            if (!selected_section_id) return;
            onAction({ kind, section_id: selected_section_id });
        },
        [onAction, selected_section_id],
    );

    /* ── Spacing-drag handle ──────────────────────────────────────── */
    // The handle sits at the selected section's bottom edge. Dragging it
    // streams a transient config to the iframe (live reflow) and commits on
    // release. `current` extends the handle visually while we wait for the
    // re-measured rect to catch up.
    const [spacingDrag, setSpacingDrag] = useState<{
        section_id: string;
        startY: number;
        startBottom: number;
        current: number;
    } | null>(null);
    // Mirror of `current` so the mouseup handler reads the latest value
    // without re-installing the listeners on every mousemove.
    const spacingValueRef = useRef<number>(0);

    const beginSpacingDrag = useCallback(
        (e: React.MouseEvent): void => {
            if (!selected_section_id) return;
            e.preventDefault();
            const start = selectedSpacingBottomPx ?? 0;
            spacingValueRef.current = start;
            setSpacingDrag({
                section_id: selected_section_id,
                startY: e.clientY,
                startBottom: start,
                current: start,
            });
        },
        [selected_section_id, selectedSpacingBottomPx],
    );

    useEffect(() => {
        if (!spacingDrag) return;
        const { section_id, startY, startBottom } = spacingDrag;
        const onMove = (e: MouseEvent): void => {
            const raw = startBottom + (e.clientY - startY);
            const snapped = Math.round(raw / SPACING_SNAP_PX) * SPACING_SNAP_PX;
            const clamped = Math.max(0, Math.min(SPACING_MAX_PX, snapped));
            spacingValueRef.current = clamped;
            setSpacingDrag((cur) =>
                cur && cur.current !== clamped ? { ...cur, current: clamped } : cur,
            );
            onSpacingPreview?.(section_id, clamped);
        };
        const onUp = (): void => {
            onSpacingChange?.(section_id, spacingValueRef.current);
            setSpacingDrag(null);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp, { once: true });
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        // Re-install only when a new drag starts, not on every value tick.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spacingDrag?.section_id]);

    if (!iframeBounds) return null;

    return (
        <div
            data-testid="preview-overlay"
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
                top: iframeBounds.top,
                left: iframeBounds.left,
                width: iframeBounds.width,
                height: iframeBounds.height,
            }}
        >
            {/* Insert-`+` gaps between sections — hidden while scrolling (rects
                go stale), inline-editing, or the context menu is open. */}
            {onAddAt && !scrolling && !state.inline_editing && !contextMenu
                ? insert_gaps.map((g) => (
                      <InsertGap
                          key={g.insertAt}
                          top={g.top}
                          left={g.left}
                          width={g.width}
                          onClick={() => onAddAt(g.insertAt)}
                      />
                  ))
                : null}

            {/* Hover ring (mint, dashed) — hidden during scroll */}
            {hovered_rect && !scrolling ? (
                <Ring rect={hovered_rect} kind="hover" testId="preview-overlay-hover-ring" />
            ) : null}

            {/* Selected ring (pink, solid) + toolbar */}
            {selected_section_id && selected_rect ? (
                <>
                    <Ring
                        rect={selected_rect}
                        kind="selected"
                        testId="preview-overlay-selected-ring"
                    />
                    <Toolbar
                        rect={selected_rect}
                        iframe_height={iframeBounds.height}
                        section_label={selected_section_label ?? "Section"}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onDuplicate={() => handleAction("duplicate")}
                        onUp={() => handleAction("up")}
                        onDown={() => handleAction("down")}
                    />
                    {onSpacingChange && onSpacingPreview && !state.inline_editing ? (
                        <SpacingHandle
                            rect={selected_rect}
                            dragValue={
                                spacingDrag &&
                                spacingDrag.section_id === selected_section_id
                                    ? spacingDrag.current
                                    : null
                            }
                            dragDelta={
                                spacingDrag &&
                                spacingDrag.section_id === selected_section_id
                                    ? spacingDrag.current - spacingDrag.startBottom
                                    : 0
                            }
                            onMouseDown={beginSpacingDrag}
                        />
                    ) : null}
                </>
            ) : null}

            {/* Right-click context menu — coords are iframe-local, which maps
                directly to this container (positioned at the iframe bounds). */}
            {contextMenu && onContextMenuClose && onContextMenuAction ? (
                <LivePreviewContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={onContextMenuClose}
                    onAction={onContextMenuAction}
                />
            ) : null}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* InsertGap — Notion-style `+` between sections                         */
/* ─────────────────────────────────────────────────────────────────── */

interface InsertGapProps {
    top: number;
    left: number;
    width: number;
    onClick: () => void;
}

/** Slim full-width hit-zone centred on a section boundary; the `+` pill and
 *  hairline only appear on hover so the canvas stays uncluttered. */
function InsertGap({ top, left, width, onClick }: InsertGapProps): ReactElement {
    return (
        <button
            type="button"
            data-testid="preview-overlay-insert-gap"
            aria-label="Insert section here"
            onClick={onClick}
            className="group pointer-events-auto absolute flex -translate-y-1/2 items-center justify-center"
            style={{ top, left, width, height: 20 }}
        >
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-pink-500 opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
        </button>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* SpacingHandle — drag the selected section's bottom spacing             */
/* ─────────────────────────────────────────────────────────────────── */

interface SpacingHandleProps {
    rect: PreviewRect;
    /** Current px value while dragging (null when idle). */
    dragValue: number | null;
    /** How far the handle has moved from the drag start (px). */
    dragDelta: number;
    onMouseDown: (e: React.MouseEvent) => void;
}

function SpacingHandle({
    rect,
    dragValue,
    dragDelta,
    onMouseDown,
}: SpacingHandleProps): ReactElement {
    const dragging = dragValue !== null;
    // Sit at the section's bottom edge; while dragging, follow the cursor by
    // the delta until the re-measured rect catches up.
    const top = rect.top + rect.height + dragDelta;
    return (
        <div
            data-testid="preview-overlay-spacing-handle"
            onMouseDown={onMouseDown}
            className="group pointer-events-auto absolute flex -translate-y-1/2 cursor-ns-resize items-center justify-center"
            style={{ top, left: rect.left, width: rect.width, height: 16 }}
        >
            <span
                className={cn(
                    "h-1 w-12 rounded-full transition-colors",
                    dragging
                        ? "bg-pink-500"
                        : "bg-pink-500/50 group-hover:bg-pink-500",
                )}
            />
            {dragging ? (
                <span
                    data-testid="preview-overlay-spacing-readout"
                    className="absolute right-1 rounded bg-pink-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
                >
                    {dragValue}px
                </span>
            ) : null}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Ring                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

interface RingProps {
    rect: PreviewRect;
    kind: "hover" | "selected";
    testId: string;
}

function Ring({ rect, kind, testId }: RingProps): ReactElement {
    return (
        <div
            data-testid={testId}
            data-kind={kind}
            className={cn(
                "pointer-events-none absolute rounded-md",
                kind === "hover"
                    ? "border-2 border-dashed border-emerald-400/80"
                    : "border-2 border-solid border-pink-500",
            )}
            style={{
                top: rect.top - 6,
                left: rect.left - 6,
                width: rect.width + 12,
                height: rect.height + 12,
            }}
        />
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Toolbar                                                              */
/* ─────────────────────────────────────────────────────────────────── */

interface ToolbarProps {
    rect: PreviewRect;
    iframe_height: number;
    section_label: string;
    onEdit: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onUp: () => void;
    onDown: () => void;
}

const TOOLBAR_HEIGHT = 32;
const TOOLBAR_GAP = 8;
/** When the section is too close to the top, flip the toolbar below. */
const FLIP_THRESHOLD = 60;

function Toolbar(props: ToolbarProps): ReactElement {
    const {
        rect,
        section_label,
        onEdit,
        onDelete,
        onDuplicate,
        onUp,
        onDown,
    } = props;

    const flip_below = rect.top < FLIP_THRESHOLD;
    const top = flip_below
        ? rect.top + rect.height + TOOLBAR_GAP
        : rect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP;

    return (
        <div
            data-testid="preview-overlay-toolbar"
            data-flip-below={flip_below ? "true" : "false"}
            className="pointer-events-auto absolute z-10 flex h-8 items-center gap-1 rounded-md border border-pink-500 bg-pink-500 px-1.5 text-white shadow-lg"
            style={{
                top,
                left: rect.left,
                maxWidth: Math.max(160, rect.width + 12),
            }}
        >
            <span
                className="truncate px-1 text-xs font-semibold tracking-tight"
                data-testid="preview-overlay-toolbar-label"
            >
                {section_label}
            </span>
            <span className="h-4 w-px bg-white/40" aria-hidden="true" />
            <ToolbarButton
                testId="preview-overlay-toolbar-edit"
                aria_label="Edit section"
                onClick={onEdit}
            >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
                testId="preview-overlay-toolbar-duplicate"
                aria_label="Duplicate section"
                onClick={onDuplicate}
            >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
                testId="preview-overlay-toolbar-up"
                aria_label="Move section up"
                onClick={onUp}
            >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
                testId="preview-overlay-toolbar-down"
                aria_label="Move section down"
                onClick={onDown}
            >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
                testId="preview-overlay-toolbar-delete"
                aria_label="Delete section"
                onClick={onDelete}
            >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
        </div>
    );
}

interface ToolbarButtonProps {
    testId: string;
    aria_label: string;
    onClick: () => void;
    children: React.ReactNode;
}

function ToolbarButton({
    testId,
    aria_label,
    onClick,
    children,
}: ToolbarButtonProps): ReactElement {
    return (
        <button
            type="button"
            data-testid={testId}
            aria-label={aria_label}
            onClick={onClick}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-white transition-colors hover:bg-white/20"
        >
            {children}
        </button>
    );
}
