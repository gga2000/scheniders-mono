"use client";

// =====================================================================
// BlockLayersPanel — sub-element selection strip
// =====================================================================
// Rendered ABOVE the section's property accordion in the Inspector
// "Blocks" tab when a section is expanded. Walks the rendered DOM of
// the matching section in the live preview and lists every editable
// sub-element ([data-i18n-field] / [data-layer]).
//
//   • hovering a row outlines the matching DOM element via the
//     `data-layer-hover` attribute (CSS owns the visual).
//   • clicking a row:
//       – text layer → fires `onEditLayer({field})` so the parent can
//         enter inline-edit on the matching canvas element.
//       – non-text layer → scrolls the matching AutoForm field into
//         view + focuses its first input.
// =====================================================================

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactElement,
} from "react";
import { Image as ImageIcon, Layers as LayersIcon, Square, Type } from "lucide-react";
import {
    applyLayerHover,
    clearAllLayerHovers,
    clearLayerHover,
    findLayers,
    type Layer,
    type LayerKind,
} from "@/lib/layer-walk";
import { cn } from "@/lib/utils";

export interface BlockLayersPanelProps {
    /** id of the section in the live preview (`[data-section-id]`). */
    sectionId: string;
    /**
     * Optional explicit root to walk. When omitted the panel queries the
     * document for `[data-section-id="${sectionId}"]` and observes it.
     * Pass-in is mainly used by tests.
     */
    rootEl?: HTMLElement | null;
    /**
     * Fired when the merchant clicks a text layer. The parent (the
     * live preview) responds by entering inline-edit on that field.
     */
    onEditLayer?: (info: { field?: string; layerId?: string; el: HTMLElement }) => void;
    /**
     * Test-only override for the query selector base. Defaults to the
     * global document.
     */
    queryRoot?: ParentNode;
}

function LayerIcon({ kind, className }: { kind: LayerKind; className?: string }): ReactElement {
    const cls = cn("h-3.5 w-3.5 shrink-0", className);
    switch (kind) {
        case "text":
            return <Type className={cls} aria-hidden="true" />;
        case "image":
            return <ImageIcon className={cls} aria-hidden="true" />;
        case "button":
            return <Square className={cls} aria-hidden="true" />;
        default:
            return <LayersIcon className={cls} aria-hidden="true" />;
    }
}

function findAutoFormFieldContainer(
    autoFormRootSelector: string,
    layer: Layer,
    queryRoot: ParentNode,
): HTMLElement | null {
    // Match by the `layerId` (data-layer attr) or by the field path —
    // both feed into AutoForm's testid: auto-form-root.<key>...
    const key = layer.layerId ?? layer.field;
    if (!key) return null;
    // Strip array indexers / nested dots so the lookup matches the
    // top-level key the AutoForm renders for.
    const topLevel = key.split(/[.[]/)[0];
    const candidates = queryRoot.querySelectorAll<HTMLElement>(
        `${autoFormRootSelector} [data-testid^="auto-form-root.${topLevel}"]`,
    );
    return candidates[0] ?? null;
}

export function BlockLayersPanel(props: BlockLayersPanelProps): ReactElement | null {
    const { sectionId, rootEl, onEditLayer, queryRoot } = props;
    const [layers, setLayers] = useState<Layer[]>([]);
    const hoveredKeyRef = useRef<string | null>(null);

    const refresh = useCallback((): void => {
        const root =
            rootEl ??
            (typeof document !== "undefined"
                ? (document.querySelector(
                      `[data-section-id="${cssEscape(sectionId)}"]`,
                  ) as HTMLElement | null)
                : null);
        setLayers(findLayers(root));
    }, [rootEl, sectionId]);

    // Initial discovery + MutationObserver so the list stays fresh as
    // section content changes (e.g. inline-edit committing new text).
    useEffect(() => {
        refresh();
        const root =
            rootEl ??
            (typeof document !== "undefined"
                ? (document.querySelector(
                      `[data-section-id="${cssEscape(sectionId)}"]`,
                  ) as HTMLElement | null)
                : null);
        if (!root || typeof MutationObserver === "undefined") return;

        const mo = new MutationObserver(() => refresh());
        mo.observe(root, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["data-i18n-field", "data-layer", "data-layer-label"],
        });
        return () => mo.disconnect();
    }, [refresh, rootEl, sectionId]);

    // Clear hovers on unmount.
    useEffect(() => {
        return () => clearAllLayerHovers(document);
    }, []);

    const handleHover = useCallback(
        (layer: Layer | null): void => {
            if (hoveredKeyRef.current && layer?.key !== hoveredKeyRef.current) {
                clearAllLayerHovers(document);
            }
            if (layer) {
                applyLayerHover(layer.el);
                hoveredKeyRef.current = layer.key;
            } else {
                hoveredKeyRef.current = null;
            }
        },
        [],
    );

    const handleClick = useCallback(
        (layer: Layer): void => {
            clearLayerHover(layer.el);
            if (layer.kind === "text" && layer.field) {
                onEditLayer?.({ field: layer.field, layerId: layer.layerId, el: layer.el });
                return;
            }
            // Non-text → scroll the matching AutoForm field into view.
            const root = queryRoot ?? document;
            const container = findAutoFormFieldContainer(
                `[data-testid="section-edit-panel-base"]`,
                layer,
                root,
            );
            if (container) {
                container.scrollIntoView({ behavior: "smooth", block: "center" });
                const focusable = container.querySelector<HTMLElement>(
                    "input, textarea, select, button",
                );
                focusable?.focus({ preventScroll: true });
            }
            onEditLayer?.({ field: layer.field, layerId: layer.layerId, el: layer.el });
        },
        [onEditLayer, queryRoot],
    );

    if (layers.length === 0) {
        return (
            <div
                data-testid="block-layers-panel-empty"
                className="rounded-md border border-dashed border-(--card-border) px-3 py-2 text-[11px] text-muted-foreground"
            >
                No editable layers detected
            </div>
        );
    }

    return (
        <section
            data-testid="block-layers-panel"
            className="rounded-md border border-(--card-border) bg-(--card-bg)"
        >
            <header className="flex items-center gap-1.5 border-b border-(--card-border) px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <LayersIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Layers
                <span
                    data-testid="block-layers-panel-count"
                    className="ml-auto rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-bold text-foreground/70"
                >
                    {layers.length}
                </span>
            </header>
            <ul className="flex flex-col">
                {layers.map((layer) => (
                    <li key={layer.key}>
                        <button
                            type="button"
                            data-testid={`block-layers-panel-row-${layer.key}`}
                            data-layer-kind={layer.kind}
                            onPointerEnter={() => handleHover(layer)}
                            onPointerLeave={() => handleHover(null)}
                            onFocus={() => handleHover(layer)}
                            onBlur={() => handleHover(null)}
                            onClick={() => handleClick(layer)}
                            className={cn(
                                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-foreground/85",
                                "transition-colors hover:bg-muted/40 hover:text-foreground",
                                "focus:bg-muted/40 focus:outline-none",
                            )}
                        >
                            <LayerIcon kind={layer.kind} className="text-muted-foreground" />
                            <span className="truncate">{layer.label}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** Minimal CSS.escape polyfill — matches the live-preview impl. */
function cssEscape(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
