"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    GripVertical,
    ChevronDown,
    Trash2,
    Image,
    ShoppingBag,
    LayoutGrid,
    Info,
    Quote,
    Star,
    Mail,
    Megaphone,
    Images,
    HelpCircle,
    FileText,
    MessageCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getSectionDefinition } from "@/lib/section-registry";
import type { SectionConfig } from "@scheniders/shared";

// ── Icon Map ──

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Image,
    ShoppingBag,
    LayoutGrid,
    Info,
    Quote,
    Star,
    Mail,
    Megaphone,
    Images,
    HelpCircle,
    FileText,
    MessageCircle,
};

// ── Props ──

interface SortableSectionItemProps {
    section: SectionConfig;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onToggleEnabled: (enabled: boolean) => void;
    onRemove?: () => void;
    onUpdateData: (data: Record<string, unknown>) => void;
    tenantId: string;
}

// ── Completion Indicator ──

function CompletionDot({ score }: { score: number }) {
    if (score === 100) {
        return <div className="w-2.5 h-2.5 rounded-full bg-green-500" title="Complete" />;
    }
    if (score > 0) {
        return <div className="w-2.5 h-2.5 rounded-full bg-amber-400" title={`${score}% complete`} />;
    }
    return <div className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600" title="Not started" />;
}

// ── Main Component ──

export function SortableSectionItem({
    section,
    isExpanded,
    onToggleExpand,
    onToggleEnabled,
    onRemove,
    onUpdateData,
    tenantId,
}: SortableSectionItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: section.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const def = getSectionDefinition(section.type);
    const IconComponent = def ? ICON_MAP[def.icon] : null;
    const completionScore = def ? def.completionCheck(section.data) : 100;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "rounded-xl border bg-(--card-bg) transition-shadow",
                isDragging
                    ? "border-primary shadow-lg z-10 opacity-90"
                    : "border-(--card-border)",
                !section.enabled && "opacity-60"
            )}
        >
            {/* Header row */}
            <div className="flex items-center gap-2 px-3 py-2.5">
                {/* Drag handle */}
                <button
                    type="button"
                    aria-label={`Drag to reorder ${def?.label || section.type}`}
                    className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="w-4 h-4" />
                </button>

                {/* Icon */}
                {IconComponent && (
                    <div className="w-6 h-6 rounded-md bg-muted/30 flex items-center justify-center">
                        <IconComponent className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                )}

                {/* Label + completion */}
                <button
                    type="button"
                    onClick={onToggleExpand}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                    <span className="text-sm font-medium truncate">
                        {def?.label || section.type}
                    </span>
                    <CompletionDot score={section.enabled ? completionScore : 0} />
                </button>

                {/* Enable/disable switch */}
                <button
                    type="button"
                    role="switch"
                    aria-checked={section.enabled}
                    aria-label={`Toggle ${def?.label || section.type} visibility`}
                    onClick={() => onToggleEnabled(!section.enabled)}
                    className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                        section.enabled ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
                    )}
                >
                    <span
                        className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform mt-0.5",
                            section.enabled ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0.5 rtl:-translate-x-0.5"
                        )}
                    />
                </button>

                {/* Remove button (only for custom sections) */}
                {onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label={`Remove ${def?.label || section.type} section`}
                        className="p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}

                {/* Expand chevron */}
                <button
                    type="button"
                    onClick={onToggleExpand}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? "Collapse" : "Expand"} ${def?.label || section.type}`}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ChevronDown
                        className={cn(
                            "w-4 h-4 transition-transform",
                            isExpanded && "rotate-180"
                        )}
                    />
                </button>
            </div>

            {/* Expanded content */}
            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-1 border-t border-(--card-border)">
                            <SectionEditorDispatch
                                section={section}
                                onUpdateData={onUpdateData}
                                tenantId={tenantId}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Editor Dispatch ──
// Routes to the correct inline editor based on section type.
// Built-in sections (hero, about, contact) are handled by the top-level
// EditorPanel, so we show a note here. Custom sections get their own editors.

import dynamic from "next/dynamic";

const TestimonialsEditor = dynamic(() =>
    import("./testimonials-editor").then((m) => ({ default: m.TestimonialsEditor })),
    { loading: () => <EditorSkeleton /> }
);
const FeaturedCarouselEditor = dynamic(() =>
    import("./featured-carousel-editor").then((m) => ({ default: m.FeaturedCarouselEditor })),
    { loading: () => <EditorSkeleton /> }
);
const NewsletterEditor = dynamic(() =>
    import("./newsletter-editor").then((m) => ({ default: m.NewsletterEditor })),
    { loading: () => <EditorSkeleton /> }
);
const PromotionsEditor = dynamic(() =>
    import("./promotions-editor").then((m) => ({ default: m.PromotionsEditor })),
    { loading: () => <EditorSkeleton /> }
);
const GalleryEditor = dynamic(() =>
    import("./gallery-editor").then((m) => ({ default: m.GalleryEditor })),
    { loading: () => <EditorSkeleton /> }
);
const FaqEditor = dynamic(() =>
    import("./faq-editor").then((m) => ({ default: m.FaqEditor })),
    { loading: () => <EditorSkeleton /> }
);
const PoliciesEditor = dynamic(() =>
    import("./policies-editor").then((m) => ({ default: m.PoliciesEditor })),
    { loading: () => <EditorSkeleton /> }
);

function EditorSkeleton() {
    return (
        <div className="space-y-3 animate-pulse">
            <div className="h-8 bg-muted/30 rounded-lg w-3/4" />
            <div className="h-8 bg-muted/30 rounded-lg w-1/2" />
        </div>
    );
}

function SectionEditorDispatch({
    section,
    onUpdateData,
    tenantId,
}: {
    section: SectionConfig;
    onUpdateData: (data: Record<string, unknown>) => void;
    tenantId: string;
}) {
    switch (section.type) {
        case "hero":
        case "about":
        case "contact":
        case "products":
        case "categories":
            return (
                <p className="text-xs text-muted-foreground py-2">
                    Edit this section in the panel above.
                </p>
            );
        case "testimonials":
            return (
                <TestimonialsEditor
                    data={section.data}
                    onUpdate={onUpdateData}
                    tenantId={tenantId}
                />
            );
        case "featured_carousel":
            return (
                <FeaturedCarouselEditor
                    data={section.data}
                    onUpdate={onUpdateData}
                    tenantId={tenantId}
                />
            );
        case "newsletter":
            return (
                <NewsletterEditor data={section.data} onUpdate={onUpdateData} />
            );
        case "promotions":
            return (
                <PromotionsEditor data={section.data} onUpdate={onUpdateData} />
            );
        case "gallery":
            return (
                <GalleryEditor
                    data={section.data}
                    onUpdate={onUpdateData}
                    tenantId={tenantId}
                />
            );
        case "faq":
            return <FaqEditor data={section.data} onUpdate={onUpdateData} />;
        case "policies":
            return <PoliciesEditor data={section.data} onUpdate={onUpdateData} />;
        default:
            return (
                <p className="text-xs text-muted-foreground py-2">
                    No editor available for this section type.
                </p>
            );
    }
}
