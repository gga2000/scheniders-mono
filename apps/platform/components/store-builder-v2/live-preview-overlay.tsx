"use client";

import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

export interface OverlayRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

export type LivePreviewAction = "duplicate" | "up" | "down";

export interface LivePreviewOverlayProps {
    hoveredRect: OverlayRect | null;
    selectedRect: OverlayRect | null;
    selectedSectionLabel: string | null;
    onEdit: () => void;
    onDelete: () => void;
    onAction: (kind: LivePreviewAction) => void;
}

export function LivePreviewOverlay({
    hoveredRect,
    selectedRect,
    selectedSectionLabel,
    onEdit,
    onDelete,
    onAction,
}: LivePreviewOverlayProps): ReactElement {
    return (
        <div
            data-testid="live-preview-overlay"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
        >
            {hoveredRect && (!selectedRect || rectsDiffer(hoveredRect, selectedRect)) ? (
                <Ring
                    rect={hoveredRect}
                    kind="hover"
                    testId="live-preview-overlay-hover-ring"
                />
            ) : null}
            {selectedRect ? (
                <>
                    <Ring
                        rect={selectedRect}
                        kind="selected"
                        testId="live-preview-overlay-selected-ring"
                    />
                    <Toolbar
                        rect={selectedRect}
                        sectionLabel={selectedSectionLabel ?? "Section"}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onAction={onAction}
                    />
                </>
            ) : null}
        </div>
    );
}

function rectsDiffer(a: OverlayRect, b: OverlayRect): boolean {
    return a.top !== b.top || a.left !== b.left || a.width !== b.width;
}

interface RingProps {
    rect: OverlayRect;
    kind: "hover" | "selected";
    testId: string;
}

function Ring({ rect, kind, testId }: RingProps): ReactElement {
    return (
        <div
            data-testid={testId}
            data-kind={kind}
            className={cn(
                "pointer-events-none absolute rounded-md transition-[top,left,width,height] duration-75",
                kind === "hover"
                    ? "border-2 border-dashed border-emerald-400/80"
                    : "border-2 border-solid border-pink-500",
            )}
            style={{
                top: rect.top - 4,
                left: rect.left - 4,
                width: rect.width + 8,
                height: rect.height + 8,
            }}
        />
    );
}

interface ToolbarProps {
    rect: OverlayRect;
    sectionLabel: string;
    onEdit: () => void;
    onDelete: () => void;
    onAction: (kind: LivePreviewAction) => void;
}

const TOOLBAR_HEIGHT = 32;
const TOOLBAR_GAP = 8;
const FLIP_THRESHOLD = 60;

function Toolbar({
    rect,
    sectionLabel,
    onEdit,
    onDelete,
    onAction,
}: ToolbarProps): ReactElement {
    const flipBelow = rect.top < FLIP_THRESHOLD;
    const top = flipBelow
        ? rect.top + rect.height + TOOLBAR_GAP
        : rect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP;

    return (
        <div
            data-testid="live-preview-overlay-toolbar"
            data-flip-below={flipBelow ? "true" : "false"}
            className="pointer-events-auto absolute z-10 flex h-8 items-center gap-1 rounded-md border border-pink-500 bg-pink-500 px-1.5 text-white shadow-lg"
            style={{
                top,
                left: rect.left,
                maxWidth: Math.max(180, rect.width + 12),
            }}
        >
            <span
                className="truncate px-1 text-xs font-semibold tracking-tight"
                data-testid="live-preview-overlay-toolbar-label"
            >
                {sectionLabel}
            </span>
            <span className="h-4 w-px bg-white/40" aria-hidden="true" />
            <ToolbarButton
                testId="live-preview-overlay-toolbar-edit"
                ariaLabel="Edit section"
                onClick={onEdit}
            >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
                testId="live-preview-overlay-toolbar-duplicate"
                ariaLabel="Duplicate section"
                onClick={() => onAction("duplicate")}
            >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
                testId="live-preview-overlay-toolbar-up"
                ariaLabel="Move section up"
                onClick={() => onAction("up")}
            >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
                testId="live-preview-overlay-toolbar-down"
                ariaLabel="Move section down"
                onClick={() => onAction("down")}
            >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
                testId="live-preview-overlay-toolbar-delete"
                ariaLabel="Delete section"
                onClick={onDelete}
            >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
        </div>
    );
}

interface ToolbarButtonProps {
    testId: string;
    ariaLabel: string;
    onClick: () => void;
    children: React.ReactNode;
}

function ToolbarButton({
    testId,
    ariaLabel,
    onClick,
    children,
}: ToolbarButtonProps): ReactElement {
    return (
        <button
            type="button"
            data-testid={testId}
            aria-label={ariaLabel}
            onClick={onClick}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-white transition-colors hover:bg-white/20"
        >
            {children}
        </button>
    );
}
