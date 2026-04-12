"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Plus,
    X,
    Layers,
    Eye,
    Save,
    ChevronDown,
    Package,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

// =============================================
// TYPES
// =============================================

export interface CollectionRule {
    field: string;
    operator: string;
    value: string | number | boolean;
    value2?: number;
    conjunction: "and" | "or";
}

interface SmartCollectionBuilderProps {
    collection?: {
        id: string;
        name: string;
        description?: string;
        rules_json: CollectionRule[];
        is_active: boolean;
    };
    products: Array<{
        id: string;
        price: number;
        cost?: number;
        stock_quantity: number;
        times_sold?: number;
        category_id?: string | null;
        product_type: string;
        is_visible?: boolean;
    }>;
    onSave: (data: {
        name: string;
        description: string;
        rules_json: CollectionRule[];
        is_active: boolean;
    }) => void;
    onCancel: () => void;
}

type Product = SmartCollectionBuilderProps["products"][number];

// =============================================
// CONSTANTS
// =============================================

interface FieldDef {
    key: string;
    label: string;
    type: "numeric" | "text" | "boolean";
}

const FIELDS: FieldDef[] = [
    { key: "category", label: "Category", type: "text" },
    { key: "price", label: "Price", type: "numeric" },
    { key: "cost", label: "Cost", type: "numeric" },
    { key: "margin", label: "Margin", type: "numeric" },
    { key: "stock", label: "Stock", type: "numeric" },
    { key: "sales", label: "Sales", type: "numeric" },
    { key: "health_score", label: "Health Score", type: "text" },
    { key: "product_type", label: "Product Type", type: "text" },
    { key: "is_visible", label: "Visibility", type: "boolean" },
    { key: "tag", label: "Tag", type: "text" },
];

const NUMERIC_OPERATORS = [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" },
    { value: "gte", label: ">=" },
    { value: "lte", label: "<=" },
    { value: "between", label: "between" },
];

const TEXT_OPERATORS = [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "contains", label: "contains" },
];

const BOOLEAN_OPERATORS = [
    { value: "is_true", label: "is true" },
    { value: "is_false", label: "is false" },
];

function getOperatorsForField(fieldKey: string) {
    const field = FIELDS.find((f) => f.key === fieldKey);
    if (!field) return TEXT_OPERATORS;
    switch (field.type) {
        case "numeric":
            return NUMERIC_OPERATORS;
        case "boolean":
            return BOOLEAN_OPERATORS;
        default:
            return TEXT_OPERATORS;
    }
}

function getFieldType(fieldKey: string): FieldDef["type"] {
    return FIELDS.find((f) => f.key === fieldKey)?.type ?? "text";
}

// =============================================
// RULE EVALUATOR (pure utility)
// =============================================

function getProductFieldValue(
    product: Product,
    field: string
): string | number | boolean | null {
    switch (field) {
        case "category":
            return product.category_id ?? null;
        case "price":
            return product.price;
        case "cost":
            return product.cost ?? 0;
        case "margin": {
            const cost = product.cost ?? 0;
            if (product.price === 0) return 0;
            return Math.round(((product.price - cost) / product.price) * 100);
        }
        case "stock":
            return product.stock_quantity;
        case "sales":
            return product.times_sold ?? 0;
        case "product_type":
            return product.product_type;
        case "is_visible":
            return product.is_visible ?? true;
        case "health_score":
            // health_score is not on the product type directly; treat as text
            return "";
        case "tag":
            // Tags require a join; in client-side evaluation without tag data, treat as empty
            return "";
        default:
            return null;
    }
}

function evaluateSingleRule(product: Product, rule: CollectionRule): boolean {
    const fieldValue = getProductFieldValue(product, rule.field);
    const fieldType = getFieldType(rule.field);

    if (fieldType === "boolean") {
        const boolVal = typeof fieldValue === "boolean" ? fieldValue : Boolean(fieldValue);
        return rule.operator === "is_true" ? boolVal : !boolVal;
    }

    if (fieldType === "numeric") {
        const numVal = typeof fieldValue === "number" ? fieldValue : Number(fieldValue);
        const ruleVal = typeof rule.value === "number" ? rule.value : Number(rule.value);
        switch (rule.operator) {
            case "is":
                return numVal === ruleVal;
            case "is_not":
                return numVal !== ruleVal;
            case "gt":
                return numVal > ruleVal;
            case "lt":
                return numVal < ruleVal;
            case "gte":
                return numVal >= ruleVal;
            case "lte":
                return numVal <= ruleVal;
            case "between":
                return numVal >= ruleVal && numVal <= (rule.value2 ?? ruleVal);
            default:
                return false;
        }
    }

    // Text / enum
    const strVal = String(fieldValue ?? "").toLowerCase();
    const ruleStr = String(rule.value).toLowerCase();
    switch (rule.operator) {
        case "is":
            return strVal === ruleStr;
        case "is_not":
            return strVal !== ruleStr;
        case "contains":
            return strVal.includes(ruleStr);
        default:
            return false;
    }
}

export function evaluateRules(
    rules: CollectionRule[],
    products: Product[]
): string[] {
    if (rules.length === 0) return products.map((p) => p.id);

    return products
        .filter((product) => {
            let result = evaluateSingleRule(product, rules[0]);

            for (let i = 1; i < rules.length; i++) {
                const ruleResult = evaluateSingleRule(product, rules[i]);
                // The conjunction on rule[i] says how to combine with the previous result
                if (rules[i].conjunction === "and") {
                    result = result && ruleResult;
                } else {
                    result = result || ruleResult;
                }
            }

            return result;
        })
        .map((p) => p.id);
}

// =============================================
// DEFAULT RULE
// =============================================

function createDefaultRule(): CollectionRule {
    return {
        field: "price",
        operator: "gt",
        value: 0,
        conjunction: "and",
    };
}

// =============================================
// COMPONENT
// =============================================

export function SmartCollectionBuilder({
    collection,
    products,
    onSave,
    onCancel,
}: SmartCollectionBuilderProps) {
    const { t } = useLanguage();

    const [name, setName] = useState(collection?.name ?? "");
    const [description, setDescription] = useState(collection?.description ?? "");
    const [rules, setRules] = useState<CollectionRule[]>(
        collection?.rules_json?.length ? collection.rules_json : [createDefaultRule()]
    );
    const [isActive, setIsActive] = useState(collection?.is_active ?? true);
    const [showPreview, setShowPreview] = useState(false);

    const matchingIds = useMemo(() => evaluateRules(rules, products), [rules, products]);

    const updateRule = useCallback(
        (index: number, patch: Partial<CollectionRule>) => {
            setRules((prev) =>
                prev.map((r, i) => {
                    if (i !== index) return r;
                    const updated = { ...r, ...patch };
                    // Reset operator and value when field changes
                    if (patch.field && patch.field !== r.field) {
                        const newType = getFieldType(patch.field);
                        if (newType === "boolean") {
                            updated.operator = "is_true";
                            updated.value = true;
                        } else if (newType === "numeric") {
                            updated.operator = "gt";
                            updated.value = 0;
                        } else {
                            updated.operator = "is";
                            updated.value = "";
                        }
                        delete updated.value2;
                    }
                    return updated;
                })
            );
        },
        []
    );

    const removeRule = useCallback((index: number) => {
        setRules((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
    }, []);

    const addRule = useCallback(() => {
        setRules((prev) => [...prev, createDefaultRule()]);
    }, []);

    const handleSave = () => {
        onSave({
            name: name.trim(),
            description: description.trim(),
            rules_json: rules,
            is_active: isActive,
        });
    };

    const inputClass = cn(
        "px-4 py-3 bg-[var(--background)] border border-[var(--card-border)]",
        "rounded-xl text-foreground placeholder:text-muted",
        "focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]",
        "text-sm"
    );

    const selectClass = cn(
        "px-3 py-2 bg-[var(--background)] border border-[var(--card-border)]",
        "rounded-xl text-foreground text-sm appearance-none",
        "focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]",
        "cursor-pointer"
    );

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
            {/* Header */}
            <div className="flex items-center gap-2 mb-6">
                <Layers className="w-5 h-5 text-muted" />
                <h2 className="text-lg font-semibold text-foreground">
                    {collection
                        ? (t?.("Edit Collection") ?? "Edit Collection")
                        : (t?.("New Smart Collection") ?? "New Smart Collection")}
                </h2>
            </div>

            {/* Name & Description */}
            <div className="space-y-4 mb-6">
                <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                        {t?.("Collection Name") ?? "Collection Name"}
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t?.("e.g. High Margin Products") ?? "e.g. High Margin Products"}
                        className={cn(inputClass, "w-full")}
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                        {t?.("Description") ?? "Description"}
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t?.("Optional description...") ?? "Optional description..."}
                        rows={2}
                        className={cn(inputClass, "w-full resize-none")}
                    />
                </div>
            </div>

            {/* Rules */}
            <div className="mb-6">
                <label className="block text-xs font-medium text-muted mb-3">
                    {t?.("Rules") ?? "Rules"}
                </label>

                <div className="space-y-2">
                    <AnimatePresence initial={false}>
                        {rules.map((rule, index) => (
                            <motion.div
                                key={index}
                                layout
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.15 }}
                                className={cn(
                                    "flex flex-wrap items-center gap-2 p-3 rounded-xl",
                                    "bg-[var(--background)] border border-[var(--card-border)]"
                                )}
                            >
                                {/* Conjunction (hidden for first rule) */}
                                {index > 0 && (
                                    <div className="relative">
                                        <select
                                            value={rule.conjunction}
                                            onChange={(e) =>
                                                updateRule(index, {
                                                    conjunction: e.target.value as "and" | "or",
                                                })
                                            }
                                            className={cn(selectClass, "w-20 pr-7")}
                                        >
                                            <option value="and">AND</option>
                                            <option value="or">OR</option>
                                        </select>
                                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                                    </div>
                                )}
                                {index === 0 && (
                                    <span className="text-xs font-medium text-muted w-20 text-center">
                                        {t?.("Where") ?? "Where"}
                                    </span>
                                )}

                                {/* Field */}
                                <div className="relative">
                                    <select
                                        value={rule.field}
                                        onChange={(e) =>
                                            updateRule(index, { field: e.target.value })
                                        }
                                        className={cn(selectClass, "w-36 pr-7")}
                                    >
                                        {FIELDS.map((f) => (
                                            <option key={f.key} value={f.key}>
                                                {t?.(f.label) ?? f.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                                </div>

                                {/* Operator */}
                                <div className="relative">
                                    <select
                                        value={rule.operator}
                                        onChange={(e) =>
                                            updateRule(index, { operator: e.target.value })
                                        }
                                        className={cn(selectClass, "w-28 pr-7")}
                                    >
                                        {getOperatorsForField(rule.field).map((op) => (
                                            <option key={op.value} value={op.value}>
                                                {t?.(op.label) ?? op.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
                                </div>

                                {/* Value input(s) — hidden for boolean */}
                                {getFieldType(rule.field) !== "boolean" && (
                                    <>
                                        <input
                                            type={
                                                getFieldType(rule.field) === "numeric"
                                                    ? "number"
                                                    : "text"
                                            }
                                            value={
                                                typeof rule.value === "boolean"
                                                    ? ""
                                                    : rule.value
                                            }
                                            onChange={(e) =>
                                                updateRule(index, {
                                                    value:
                                                        getFieldType(rule.field) === "numeric"
                                                            ? Number(e.target.value)
                                                            : e.target.value,
                                                })
                                            }
                                            placeholder={t?.("Value") ?? "Value"}
                                            className={cn(selectClass, "w-28")}
                                        />

                                        {/* Second value for "between" */}
                                        {rule.operator === "between" && (
                                            <>
                                                <span className="text-xs text-muted">
                                                    {t?.("and") ?? "and"}
                                                </span>
                                                <input
                                                    type="number"
                                                    value={rule.value2 ?? ""}
                                                    onChange={(e) =>
                                                        updateRule(index, {
                                                            value2: Number(e.target.value),
                                                        })
                                                    }
                                                    placeholder={t?.("Value") ?? "Value"}
                                                    className={cn(selectClass, "w-28")}
                                                />
                                            </>
                                        )}
                                    </>
                                )}

                                {/* Remove rule */}
                                <button
                                    type="button"
                                    onClick={() => removeRule(index)}
                                    disabled={rules.length <= 1}
                                    className={cn(
                                        "ml-auto p-1.5 text-muted hover:text-red-500 transition-colors rounded-lg",
                                        "disabled:opacity-30 disabled:cursor-not-allowed"
                                    )}
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                <button
                    type="button"
                    onClick={addRule}
                    className={cn(
                        "mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium",
                        "text-muted hover:text-foreground hover:bg-[var(--background)]",
                        "transition-colors"
                    )}
                >
                    <Plus className="w-4 h-4" />
                    {t?.("Add Rule") ?? "Add Rule"}
                </button>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 mb-6">
                <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={cn(
                        "relative w-10 h-6 rounded-full transition-colors",
                        isActive
                            ? "bg-[var(--pastel-mint)]"
                            : "bg-[var(--card-border)]"
                    )}
                >
                    <motion.div
                        animate={{ x: isActive ? 18 : 2 }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
                    />
                </button>
                <span className="text-sm text-foreground">
                    {isActive
                        ? (t?.("Active") ?? "Active")
                        : (t?.("Inactive") ?? "Inactive")}
                </span>
            </div>

            {/* Preview */}
            <div className="mb-6">
                <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium w-full",
                        "bg-[var(--background)] border border-[var(--card-border)]",
                        "hover:border-[var(--pastel-yellow)] transition-colors"
                    )}
                >
                    <Eye className="w-4 h-4 text-muted" />
                    <span className="text-foreground">
                        {t?.("Preview") ?? "Preview"}
                    </span>
                    <span className="ml-auto text-xs text-muted tabular-nums">
                        {matchingIds.length} / {products.length}{" "}
                        {t?.("products match") ?? "products match"}
                    </span>
                    <ChevronDown
                        className={cn(
                            "w-4 h-4 text-muted transition-transform",
                            showPreview && "rotate-180"
                        )}
                    />
                </button>

                <AnimatePresence>
                    {showPreview && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-2 p-4 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                                {matchingIds.length === 0 ? (
                                    <p className="text-sm text-muted text-center py-4">
                                        {t?.("No products match these rules") ??
                                            "No products match these rules"}
                                    </p>
                                ) : (
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                        {matchingIds.slice(0, 50).map((id) => {
                                            const product = products.find((p) => p.id === id);
                                            if (!product) return null;
                                            return (
                                                <div
                                                    key={id}
                                                    className="flex items-center gap-2 text-sm py-1"
                                                >
                                                    <Package className="w-3.5 h-3.5 text-muted shrink-0" />
                                                    <span className="text-foreground truncate">
                                                        {product.product_type}
                                                    </span>
                                                    <span className="ml-auto text-xs text-muted tabular-nums shrink-0">
                                                        {product.price.toLocaleString()}
                                                    </span>
                                                    <span className="text-xs text-muted shrink-0">
                                                        | {t?.("Stock") ?? "Stock"}: {product.stock_quantity}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        {matchingIds.length > 50 && (
                                            <p className="text-xs text-muted text-center pt-2">
                                                +{matchingIds.length - 50}{" "}
                                                {t?.("more") ?? "more"}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 justify-end">
                <button
                    type="button"
                    onClick={onCancel}
                    className={cn(
                        "px-4 py-2.5 rounded-lg text-sm font-medium",
                        "bg-[var(--background)] text-foreground",
                        "hover:bg-[var(--card-border)] transition-colors"
                    )}
                >
                    {t?.("Cancel") ?? "Cancel"}
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!name.trim()}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium",
                        "bg-[var(--pastel-mint)] text-teal-700",
                        "disabled:opacity-50 transition-colors"
                    )}
                >
                    <Save className="w-4 h-4" />
                    {t?.("Save Collection") ?? "Save Collection"}
                </button>
            </div>
        </div>
    );
}
