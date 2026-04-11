"use client";

import { useState, useCallback } from "react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SortableSectionItem } from "./sortable-section-item";
import {
    SECTION_REGISTRY,
    getSectionDefinition,
    createDefaultSection,
    getAvailableSectionTypes,
} from "@/lib/section-registry";
import type { SectionConfig } from "@scheniders/shared";
import type { UseStoreBuilderReturn } from "@/hooks/use-store-builder";

interface SectionManagerProps {
    builder: UseStoreBuilderReturn;
    tenantId: string;
}

export function SectionManager({ builder, tenantId }: SectionManagerProps) {
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (over && active.id !== over.id) {
                const oldIndex = builder.sectionsOrder.indexOf(active.id as string);
                const newIndex = builder.sectionsOrder.indexOf(over.id as string);
                const newOrder = arrayMove(builder.sectionsOrder, oldIndex, newIndex);
                builder.reorderSections(newOrder);
            }
        },
        [builder]
    );

    const handleAddSection = useCallback(
        (type: string) => {
            const section = createDefaultSection(type);
            if (section) {
                builder.addSection(section);
                setExpandedSection(section.id);
            }
            setShowAddMenu(false);
        },
        [builder]
    );

    const availableTypes = getAvailableSectionTypes(builder.sections);

    // Build ordered sections list: match sectionsOrder, then include any sections not in order
    const orderedSections = builder.sectionsOrder
        .map((id) => {
            // For built-in sections (hero, products, categories, about, contact), create virtual entries
            const existing = builder.sections.find((s) => s.id === id);
            if (existing) return existing;

            // Virtual section for built-in types referenced by sectionsOrder
            const def = getSectionDefinition(id);
            if (def) {
                return {
                    id,
                    type: id,
                    enabled: true,
                    data: def.defaultData,
                } as SectionConfig;
            }
            return null;
        })
        .filter(Boolean) as SectionConfig[];

    return (
        <div className="space-y-3" data-tour-id="section-manager">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={orderedSections.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2">
                        {orderedSections.map((section) => (
                            <SortableSectionItem
                                key={section.id}
                                section={section}
                                isExpanded={expandedSection === section.id}
                                onToggleExpand={() =>
                                    setExpandedSection(
                                        expandedSection === section.id ? null : section.id
                                    )
                                }
                                onToggleEnabled={(enabled) =>
                                    builder.toggleSection(section.id, enabled)
                                }
                                onRemove={
                                    // Only allow removing custom sections (not built-in ones)
                                    !["hero", "products", "categories", "about", "contact"].includes(section.type)
                                        ? () => builder.removeSection(section.id)
                                        : undefined
                                }
                                onUpdateData={(data) =>
                                    builder.updateSection(section.id, { data })
                                }
                                tenantId={tenantId}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            {/* Add Section Button */}
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setShowAddMenu(!showAddMenu)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-(--card-border) text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Section
                </button>

                <AnimatePresence>
                    {showAddMenu && (
                        <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 right-0 mt-2 z-20 bg-(--card-bg) border border-(--card-border) rounded-xl shadow-lg overflow-hidden"
                        >
                            <div className="p-2 max-h-64 overflow-y-auto">
                                {availableTypes.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-muted-foreground text-center">
                                        All section types have been added
                                    </p>
                                ) : (
                                    availableTypes.map((def) => (
                                        <button
                                            key={def.type}
                                            type="button"
                                            onClick={() => handleAddSection(def.type)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm hover:bg-muted/30 transition-colors"
                                        >
                                            <span className="text-muted-foreground text-xs font-medium">
                                                {def.label}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/60 mr-auto">
                                                {def.labelAr}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
