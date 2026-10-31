"use client";

import { useState, useMemo, useCallback, useId } from "react";
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
    horizontalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    Plus,
    Settings,
    Trash2,
    X,
    GripVertical,
    ChevronDown,
    Palette,
    Ruler,
    Layers,
    Sparkles,
    SquareAsterisk,
    AlertTriangle,
    Info,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { VariantOptionType, OptionValueMetadata } from "@/types/product";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProductOptionFormData {
    id?: string;
    name: string;
    values: string[];
    option_type?: VariantOptionType;
    values_metadata?: OptionValueMetadata[];
}

interface VariantOptionsBuilderProps {
    options: ProductOptionFormData[];
    onChange: (options: ProductOptionFormData[]) => void;
    disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_OPTION_GROUPS = 5;
const COMBINATION_WARNING_THRESHOLD = 100;

const OPTION_TYPE_CONFIG: Record<
    VariantOptionType,
    { icon: typeof Palette; defaultName: string }
> = {
    color: { icon: Palette, defaultName: "Color" },
    size: { icon: Ruler, defaultName: "Size" },
    material: { icon: Layers, defaultName: "Material" },
    style: { icon: Sparkles, defaultName: "Style" },
    custom: { icon: SquareAsterisk, defaultName: "" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeCombinations(options: ProductOptionFormData[]): number {
    if (options.length === 0) return 0;
    return options.reduce((acc, opt) => {
        const count = opt.values.length;
        return count > 0 ? acc * count : acc;
    }, 1);
}

function generateStableId(prefix: string, index: number): string {
    return `${prefix}-${index}`;
}

// ---------------------------------------------------------------------------
// SortableValueChip — individual value within an option group
// ---------------------------------------------------------------------------

interface SortableValueChipProps {
    id: string;
    value: string;
    metadata?: OptionValueMetadata;
    optionType: VariantOptionType;
    disabled: boolean;
    onRemove: () => void;
    onMetadataEdit: (meta: Partial<OptionValueMetadata>) => void;
}

function SortableValueChip({
    id,
    value,
    metadata,
    optionType,
    disabled,
    onRemove,
    onMetadataEdit,
}: SortableValueChipProps) {
    const [editingHex, setEditingHex] = useState(false);
    const [editingMeasurement, setEditingMeasurement] = useState(false);
    const [editingDescription, setEditingDescription] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const hexColor = metadata?.hex || "#cccccc";

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group relative inline-flex items-center gap-1.5 px-2.5 py-1 bg-[var(--pastel-blue)] text-blue-800 rounded-lg text-sm font-medium ${isDragging ? "shadow-lg opacity-90 z-50" : ""}`}
        >
            {/* Drag handle — visible on hover */}
            {!disabled && (
                <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing touch-none text-blue-500 hover:text-blue-700 -ml-1 transition-opacity"
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="w-3 h-3" />
                </button>
            )}

            {/* Color swatch for color type */}
            {optionType === "color" && (
                <button
                    type="button"
                    onClick={() => !disabled && setEditingHex(!editingHex)}
                    className="w-4 h-4 rounded-full border border-blue-300 flex-shrink-0"
                    style={{ backgroundColor: hexColor }}
                    title={metadata?.hex || "Click to set color"}
                />
            )}

            <span>{value}</span>

            {/* Size measurement badge */}
            {optionType === "size" && metadata?.measurement && (
                <span className="text-[10px] text-blue-600 opacity-75">
                    {metadata.measurement}
                </span>
            )}

            {/* Material description tooltip indicator */}
            {optionType === "material" && metadata?.description && (
                <span
                    className="cursor-help"
                    title={metadata.description}
                >
                    <Info className="w-3 h-3 text-blue-500" />
                </span>
            )}

            {/* Remove button */}
            {!disabled && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="text-blue-600 hover:text-blue-900"
                >
                    <X className="w-3 h-3" />
                </button>
            )}

            {/* Hex editor popover for color type */}
            {optionType === "color" && editingHex && !disabled && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg p-3 flex items-center gap-2">
                    <div
                        className="w-8 h-8 rounded-lg border border-[var(--card-border)]"
                        style={{ backgroundColor: metadata?.hex || "#cccccc" }}
                    />
                    <input
                        type="text"
                        value={metadata?.hex || ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            onMetadataEdit({ hex: val });
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                                setEditingHex(false);
                            }
                        }}
                        onBlur={() => setEditingHex(false)}
                        placeholder="#FF0000"
                        autoFocus
                        className="w-24 px-2 py-1 bg-[var(--background)] border border-[var(--card-border)] rounded-md text-xs text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                    />
                </div>
            )}

            {/* Measurement editor popover for size type */}
            {optionType === "size" && editingMeasurement && !disabled && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg p-3">
                    <input
                        type="text"
                        value={metadata?.measurement || ""}
                        onChange={(e) => onMetadataEdit({ measurement: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                                setEditingMeasurement(false);
                            }
                        }}
                        onBlur={() => setEditingMeasurement(false)}
                        placeholder="e.g. 42cm"
                        autoFocus
                        className="w-28 px-2 py-1 bg-[var(--background)] border border-[var(--card-border)] rounded-md text-xs text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                    />
                </div>
            )}

            {/* Description editor popover for material type */}
            {optionType === "material" && editingDescription && !disabled && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg p-3">
                    <input
                        type="text"
                        value={metadata?.description || ""}
                        onChange={(e) => onMetadataEdit({ description: e.target.value })}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                                setEditingDescription(false);
                            }
                        }}
                        onBlur={() => setEditingDescription(false)}
                        placeholder="e.g. 100% organic"
                        autoFocus
                        className="w-40 px-2 py-1 bg-[var(--background)] border border-[var(--card-border)] rounded-md text-xs text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                    />
                </div>
            )}

            {/* Context click to edit metadata for size/material */}
            {optionType === "size" && !editingMeasurement && !disabled && (
                <button
                    type="button"
                    onClick={() => setEditingMeasurement(true)}
                    className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-700 transition-opacity"
                    title="Edit measurement"
                >
                    <Ruler className="w-3 h-3" />
                </button>
            )}
            {optionType === "material" && !editingDescription && !disabled && (
                <button
                    type="button"
                    onClick={() => setEditingDescription(true)}
                    className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-700 transition-opacity"
                    title="Edit description"
                >
                    <Info className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// SortableOptionGroup — a single option group (e.g., "Color", "Size")
// ---------------------------------------------------------------------------

interface SortableOptionGroupProps {
    id: string;
    option: ProductOptionFormData;
    groupIndex: number;
    disabled: boolean;
    valueInput: string;
    onValueInputChange: (value: string) => void;
    onUpdateName: (name: string) => void;
    onUpdateType: (type: VariantOptionType) => void;
    onAddValue: (raw: string) => void;
    onRemoveValue: (valueIndex: number) => void;
    onReorderValues: (oldIndex: number, newIndex: number) => void;
    onUpdateValueMetadata: (valueIndex: number, meta: Partial<OptionValueMetadata>) => void;
    onRemoveGroup: () => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
}

function SortableOptionGroup({
    id,
    option,
    groupIndex,
    disabled,
    valueInput,
    onValueInputChange,
    onUpdateName,
    onUpdateType,
    onAddValue,
    onRemoveValue,
    onReorderValues,
    onUpdateValueMetadata,
    onRemoveGroup,
    t,
}: SortableOptionGroupProps) {
    const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const optionType: VariantOptionType = option.option_type || "custom";
    const TypeIcon = OPTION_TYPE_CONFIG[optionType].icon;

    const valueSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const valueIds = option.values.map((_, vi) => generateStableId(`val-${groupIndex}`, vi));

    const handleValueDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = valueIds.indexOf(active.id as string);
            const newIndex = valueIds.indexOf(over.id as string);
            if (oldIndex !== -1 && newIndex !== -1) {
                onReorderValues(oldIndex, newIndex);
            }
        },
        [valueIds, onReorderValues]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            onAddValue(valueInput);
        }
    };

    const handleTypeSelect = (type: VariantOptionType) => {
        onUpdateType(type);
        const config = OPTION_TYPE_CONFIG[type];
        if (config.defaultName && !option.name) {
            onUpdateName(config.defaultName);
        }
        setTypeDropdownOpen(false);
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`bg-[var(--background)] rounded-xl border border-[var(--card-border)] p-4 ${isDragging ? "shadow-lg opacity-90 z-50" : ""}`}
        >
            {/* Group header */}
            <div className="flex items-start gap-3">
                {/* Drag handle */}
                {!disabled && (
                    <button
                        type="button"
                        className="mt-2 cursor-grab active:cursor-grabbing touch-none text-muted hover:text-foreground transition-colors"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical className="w-4 h-4" />
                    </button>
                )}

                <div className="flex-1 space-y-3">
                    {/* Type selector + name input row */}
                    <div className="flex items-center gap-2">
                        {/* Option type dropdown */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => !disabled && setTypeDropdownOpen(!typeDropdownOpen)}
                                disabled={disabled}
                                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground hover:bg-[var(--background)] transition-colors"
                            >
                                <TypeIcon className="w-4 h-4 text-muted" />
                                <span className="capitalize text-xs">
                                    {t(`products.variants.type.${optionType}`) || optionType}
                                </span>
                                <ChevronDown className="w-3 h-3 text-muted" />
                            </button>

                            {typeDropdownOpen && (
                                <div className="absolute top-full left-0 mt-1 z-50 w-48 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg overflow-hidden">
                                    {(Object.keys(OPTION_TYPE_CONFIG) as VariantOptionType[]).map(
                                        (type) => {
                                            const config = OPTION_TYPE_CONFIG[type];
                                            const Icon = config.icon;
                                            return (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => handleTypeSelect(type)}
                                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--background)] transition-colors ${
                                                        optionType === type
                                                            ? "bg-[var(--pastel-blue)] text-blue-800"
                                                            : "text-foreground"
                                                    }`}
                                                >
                                                    <Icon className="w-4 h-4" />
                                                    <span className="capitalize">
                                                        {t(`products.variants.type.${type}`) || type}
                                                    </span>
                                                </button>
                                            );
                                        }
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Name input */}
                        <input
                            type="text"
                            value={option.name}
                            onChange={(e) => onUpdateName(e.target.value)}
                            placeholder={
                                t("products.variants.optionNamePlaceholder")
                            }
                            readOnly={disabled}
                            className="flex-1 px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                        />
                    </div>

                    {/* Values area */}
                    <div>
                        <label className="block text-xs text-muted mb-1.5">
                            {t("products.variants.optionValues")}
                        </label>

                        <DndContext
                            sensors={valueSensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleValueDragEnd}
                        >
                            <SortableContext
                                items={valueIds}
                                strategy={horizontalListSortingStrategy}
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    {option.values.map((value, valueIndex) => {
                                        const meta = option.values_metadata?.[valueIndex];
                                        return (
                                            <SortableValueChip
                                                key={valueIds[valueIndex]}
                                                id={valueIds[valueIndex]}
                                                value={value}
                                                metadata={meta}
                                                optionType={optionType}
                                                disabled={disabled}
                                                onRemove={() => onRemoveValue(valueIndex)}
                                                onMetadataEdit={(m) =>
                                                    onUpdateValueMetadata(valueIndex, m)
                                                }
                                            />
                                        );
                                    })}

                                    {/* Value input + add button */}
                                    {!disabled && (
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="text"
                                                value={valueInput}
                                                onChange={(e) => onValueInputChange(e.target.value)}
                                                onKeyDown={handleKeyDown}
                                                placeholder={
                                                    t("products.variants.typeAndPress")
                                                }
                                                className="min-w-[140px] px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => onAddValue(valueInput)}
                                                className="p-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg hover:bg-[var(--pastel-green)] transition-colors"
                                                title={t("products.variants.addValue")}
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </div>
                </div>

                {/* Remove group button */}
                {!disabled && (
                    <button
                        type="button"
                        onClick={onRemoveGroup}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors mt-1"
                        title={t("products.variants.removeOption")}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function VariantOptionsBuilder({
    options,
    onChange,
    disabled,
}: VariantOptionsBuilderProps) {
    const { t } = useLanguage();
    const [valueInputs, setValueInputs] = useState<Record<number, string>>({});

    const dndId = useId();

    const groupSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Stable IDs for option groups
    const groupIds = useMemo(
        () => options.map((_, i) => generateStableId("opt", i)),
        [options]
    );

    // Combination count
    const combinationCount = useMemo(() => computeCombinations(options), [options]);
    const showCombinationWarning =
        combinationCount > COMBINATION_WARNING_THRESHOLD;
    const atMaxGroups = options.length >= MAX_OPTION_GROUPS;

    // --- Group-level handlers ---

    const addOption = useCallback(() => {
        if (atMaxGroups) return;
        onChange([
            ...options,
            { name: "", values: [], option_type: "custom", values_metadata: [] },
        ]);
    }, [options, onChange, atMaxGroups]);

    const removeOption = useCallback(
        (index: number) => {
            const updated = options.filter((_, i) => i !== index);
            onChange(updated);
            setValueInputs((prev) => {
                const next = { ...prev };
                delete next[index];
                return next;
            });
        },
        [options, onChange]
    );

    const updateOptionName = useCallback(
        (index: number, name: string) => {
            const updated = options.map((opt, i) =>
                i === index ? { ...opt, name } : opt
            );
            onChange(updated);
        },
        [options, onChange]
    );

    const updateOptionType = useCallback(
        (index: number, option_type: VariantOptionType) => {
            const updated = options.map((opt, i) =>
                i === index ? { ...opt, option_type } : opt
            );
            onChange(updated);
        },
        [options, onChange]
    );

    const addValue = useCallback(
        (optionIndex: number, raw: string) => {
            const value = raw.trim();
            if (!value) return;
            const option = options[optionIndex];
            if (option.values.some((v) => v.toLowerCase() === value.toLowerCase()))
                return;

            const optionType = option.option_type || "custom";
            const newMeta: OptionValueMetadata = { label: value };
            if (optionType === "color") newMeta.hex = "#cccccc";

            const updated = options.map((opt, i) =>
                i === optionIndex
                    ? {
                          ...opt,
                          values: [...opt.values, value],
                          values_metadata: [
                              ...(opt.values_metadata || []),
                              newMeta,
                          ],
                      }
                    : opt
            );
            onChange(updated);
            setValueInputs((prev) => ({ ...prev, [optionIndex]: "" }));
        },
        [options, onChange]
    );

    const removeValue = useCallback(
        (optionIndex: number, valueIndex: number) => {
            const updated = options.map((opt, i) =>
                i === optionIndex
                    ? {
                          ...opt,
                          values: opt.values.filter((_, vi) => vi !== valueIndex),
                          values_metadata: (opt.values_metadata || []).filter(
                              (_, vi) => vi !== valueIndex
                          ),
                      }
                    : opt
            );
            onChange(updated);
        },
        [options, onChange]
    );

    const reorderValues = useCallback(
        (optionIndex: number, oldIndex: number, newIndex: number) => {
            const updated = options.map((opt, i) => {
                if (i !== optionIndex) return opt;
                return {
                    ...opt,
                    values: arrayMove(opt.values, oldIndex, newIndex),
                    values_metadata: arrayMove(
                        opt.values_metadata || [],
                        oldIndex,
                        newIndex
                    ),
                };
            });
            onChange(updated);
        },
        [options, onChange]
    );

    const updateValueMetadata = useCallback(
        (
            optionIndex: number,
            valueIndex: number,
            meta: Partial<OptionValueMetadata>
        ) => {
            const updated = options.map((opt, i) => {
                if (i !== optionIndex) return opt;
                const metaArr = [...(opt.values_metadata || [])];
                // Ensure array is long enough
                while (metaArr.length <= valueIndex) {
                    metaArr.push({ label: opt.values[metaArr.length] || "" });
                }
                metaArr[valueIndex] = { ...metaArr[valueIndex], ...meta };
                return { ...opt, values_metadata: metaArr };
            });
            onChange(updated);
        },
        [options, onChange]
    );

    // --- Group drag handler ---

    const handleGroupDragEnd = useCallback(
        (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over || active.id === over.id) return;
            const oldIndex = groupIds.indexOf(active.id as string);
            const newIndex = groupIds.indexOf(over.id as string);
            if (oldIndex !== -1 && newIndex !== -1) {
                onChange(arrayMove(options, oldIndex, newIndex));
                // Remap value inputs
                setValueInputs((prev) => {
                    const next: Record<number, string> = {};
                    const reordered = arrayMove(
                        Object.entries(prev).map(([k, v]) => ({
                            idx: Number(k),
                            val: v,
                        })),
                        oldIndex,
                        newIndex
                    );
                    reordered.forEach((item, i) => {
                        next[i] = item.val;
                    });
                    return next;
                });
            }
        },
        [groupIds, options, onChange]
    );

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    {t("products.variants.title")}
                </h2>
                {!disabled && (
                    <div className="flex items-center gap-2">
                        {atMaxGroups && (
                            <span className="text-xs text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {t("products.variants.maxOptions")}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={addOption}
                            disabled={atMaxGroups}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                atMaxGroups
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                    : "bg-[var(--pastel-mint)] text-teal-700 hover:bg-[var(--pastel-green)]"
                            }`}
                        >
                            <Plus className="w-4 h-4" />
                            {t("products.variants.addOption")}
                        </button>
                    </div>
                )}
            </div>

            {/* Combination warning */}
            {showCombinationWarning && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>
                        {t("products.variants.combinationWarning", {
                            count: combinationCount,
                        }) ||
                            `This will create ${combinationCount} variants. Large variant counts may slow performance.`}
                    </span>
                </div>
            )}

            {/* Empty state */}
            {options.length === 0 ? (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Settings className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        {t("products.variants.noOptions")}
                    </p>
                </div>
            ) : (
                <DndContext
                    id={dndId}
                    sensors={groupSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleGroupDragEnd}
                >
                    <SortableContext
                        items={groupIds}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-3">
                            {options.map((option, index) => (
                                <SortableOptionGroup
                                    key={option.id || groupIds[index]}
                                    id={groupIds[index]}
                                    option={option}
                                    groupIndex={index}
                                    disabled={!!disabled}
                                    valueInput={valueInputs[index] || ""}
                                    onValueInputChange={(v) =>
                                        setValueInputs((prev) => ({
                                            ...prev,
                                            [index]: v,
                                        }))
                                    }
                                    onUpdateName={(name) => updateOptionName(index, name)}
                                    onUpdateType={(type) => updateOptionType(index, type)}
                                    onAddValue={(raw) => addValue(index, raw)}
                                    onRemoveValue={(vi) => removeValue(index, vi)}
                                    onReorderValues={(oldI, newI) =>
                                        reorderValues(index, oldI, newI)
                                    }
                                    onUpdateValueMetadata={(vi, meta) =>
                                        updateValueMetadata(index, vi, meta)
                                    }
                                    onRemoveGroup={() => removeOption(index)}
                                    t={t}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
}
