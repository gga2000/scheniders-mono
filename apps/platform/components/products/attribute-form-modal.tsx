"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Tags } from "lucide-react";
import type { ProductAttributeDef } from "@scheniders/shared";
import type { AttributeDefWrite } from "@/hooks/use-product-attributes-query";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

type Kind = ProductAttributeDef["kind"];

/** A row in the enum-options or group-keys editor. */
interface LabelledRow {
    id: string;
    value: string;
    label_en: string;
    label_ar: string;
}

/**
 * Draft state. Deliberately NOT `ProductAttributeDef`: while the merchant is
 * typing, an enum has no options yet and a range has no bounds, so the draft
 * has to be allowed to be invalid. `toWrite` narrows it to the fields the
 * chosen kind actually needs, which is what the database CHECK validates.
 */
export interface AttributeFormData {
    key: string;
    name_en: string;
    name_ar: string;
    kind: Kind;
    options: LabelledRow[];
    groups: LabelledRow[];
    range_min: string;
    range_max: string;
    unit_en: string;
    unit_ar: string;
    is_filterable: boolean;
    is_comparable: boolean;
    display_order: number;
}

const newRow = (): LabelledRow => ({
    id: Math.random().toString(36).slice(2),
    value: "",
    label_en: "",
    label_ar: "",
});

const EMPTY: AttributeFormData = {
    key: "",
    name_en: "",
    name_ar: "",
    kind: "enum",
    options: [newRow()],
    groups: [newRow()],
    range_min: "1",
    range_max: "5",
    unit_en: "",
    unit_ar: "",
    is_filterable: true,
    is_comparable: false,
    display_order: 0,
};

/** Mirrors the database CHECK on `key`: lowercase ASCII, letter-initial. */
export function toAttributeKey(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^[^a-z]+/, "")
        .replace(/_+/g, "_")
        .replace(/_$/, "")
        .slice(0, 63);
}

function i18n(en: string, ar: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (en.trim()) out.en = en.trim();
    if (ar.trim()) out.ar = ar.trim();
    return out;
}

function rowsToOptions(rows: LabelledRow[]) {
    return rows
        .filter((r) => r.value.trim())
        .map((r) => ({ value: toAttributeKey(r.value), label_i18n: i18n(r.label_en, r.label_ar) }));
}

/** Narrow the draft to exactly the columns the chosen kind requires. */
export function toWrite(form: AttributeFormData): AttributeDefWrite {
    const base = {
        key: toAttributeKey(form.key),
        name_i18n: i18n(form.name_en, form.name_ar),
        kind: form.kind,
        is_filterable: form.is_filterable,
        is_comparable: form.is_comparable,
        display_order: form.display_order,
        options: null,
        group_keys: null,
        range_min: null,
        range_max: null,
        unit_i18n: null,
    } satisfies AttributeDefWrite;

    switch (form.kind) {
        case "enum":
            return { ...base, options: rowsToOptions(form.options) };
        case "group_list":
            return { ...base, group_keys: rowsToOptions(form.groups).map((o) => ({ key: o.value, label_i18n: o.label_i18n })) };
        case "range":
            return {
                ...base,
                range_min: Number(form.range_min),
                range_max: Number(form.range_max),
                unit_i18n: i18n(form.unit_en, form.unit_ar),
            };
        default:
            return base;
    }
}

/** Why the Save button is disabled, or null when the draft is valid. */
export function validationError(form: AttributeFormData, t: (k: string) => string): string | null {
    if (!toAttributeKey(form.key)) return t("attributes.error.key");
    if (!form.name_en.trim() && !form.name_ar.trim()) return t("attributes.error.name");
    if (form.kind === "enum" && rowsToOptions(form.options).length === 0) return t("attributes.error.options");
    if (form.kind === "group_list" && rowsToOptions(form.groups).length === 0) return t("attributes.error.groups");
    if (form.kind === "range") {
        const min = Number(form.range_min);
        const max = Number(form.range_max);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return t("attributes.error.rangeNumbers");
        if (max <= min) return t("attributes.error.rangeOrder");
    }
    return null;
}

export function fromDef(def: ProductAttributeDef): AttributeFormData {
    const rows = (list: { value?: string; key?: string; label_i18n?: Record<string, string> }[]) =>
        list.map((o) => ({
            id: Math.random().toString(36).slice(2),
            value: o.value ?? o.key ?? "",
            label_en: o.label_i18n?.en ?? "",
            label_ar: o.label_i18n?.ar ?? "",
        }));

    return {
        ...EMPTY,
        key: def.key,
        name_en: def.name_i18n.en ?? "",
        name_ar: def.name_i18n.ar ?? "",
        kind: def.kind,
        options: def.kind === "enum" ? rows(def.options) : [newRow()],
        groups: def.kind === "group_list" ? rows(def.group_keys) : [newRow()],
        range_min: def.kind === "range" ? String(def.range_min) : "1",
        range_max: def.kind === "range" ? String(def.range_max) : "5",
        unit_en: def.kind === "range" ? (def.unit_i18n?.en ?? "") : "",
        unit_ar: def.kind === "range" ? (def.unit_i18n?.ar ?? "") : "",
        is_filterable: def.is_filterable,
        is_comparable: def.is_comparable,
        display_order: def.display_order,
    };
}

const KINDS: Kind[] = ["enum", "range", "group_list", "text", "boolean"];

const inputCls =
    "w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ink)]/20";
const labelCls = "block text-xs font-medium text-muted mb-1";

export function AttributeFormModal({
    isOpen,
    onClose,
    onSubmit,
    def,
    mode,
    existingKeys,
}: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: AttributeFormData) => Promise<void>;
    def?: ProductAttributeDef | null;
    mode: "add" | "edit";
    existingKeys: string[];
}) {
    const { t } = useLanguage();
    const [form, setForm] = useState<AttributeFormData>(EMPTY);
    const [saving, setSaving] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setForm(def ? fromDef(def) : EMPTY);
        setServerError(null);
    }, [isOpen, def]);

    const set = <K extends keyof AttributeFormData>(k: K, v: AttributeFormData[K]) =>
        setForm((f) => ({ ...f, [k]: v }));

    const duplicateKey = useMemo(() => {
        const key = toAttributeKey(form.key);
        return key.length > 0 && existingKeys.includes(key) && key !== def?.key;
    }, [form.key, existingKeys, def?.key]);

    const error = duplicateKey ? t("attributes.error.duplicate") : validationError(form, t);

    const rowsFor = form.kind === "enum" ? "options" : "groups";
    const rows = form.kind === "enum" ? form.options : form.groups;
    const setRows = (next: LabelledRow[]) => set(rowsFor, next);

    const handleSave = async () => {
        if (error) return;
        setSaving(true);
        setServerError(null);
        try {
            await onSubmit(form);
            onClose();
        } catch (e) {
            // Surface the real reason — usually the database CHECK or the
            // unique (tenant_id, key) constraint. Swallowing it would leave
            // the merchant staring at a modal that just refuses to close.
            setServerError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: 24, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 24, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-[var(--card-bg)] rounded-t-2xl sm:rounded-2xl border border-[var(--card-border)] shadow-xl"
                    >
                        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
                            <div className="flex items-center gap-2 min-w-0">
                                <Tags className="w-5 h-5 shrink-0" />
                                <h2 className="font-semibold truncate">
                                    {mode === "add" ? t("attributes.addTitle") : t("attributes.editTitle")}
                                </h2>
                            </div>
                            <button onClick={onClose} aria-label={t("common.close")} className="p-2 rounded-lg hover:bg-[var(--background)]">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls} htmlFor="attr-name-ar">{t("attributes.nameAr")}</label>
                                    <input
                                        id="attr-name-ar"
                                        className={inputCls}
                                        value={form.name_ar}
                                        // The key is ASCII by constraint, so the Arabic
                                        // name cannot seed it — only the English one does.
                                        onChange={(e) => set("name_ar", e.target.value)}
                                        placeholder="العائلة العطرية"
                                    />
                                </div>
                                <div>
                                    <label className={labelCls} htmlFor="attr-name-en">{t("attributes.nameEn")}</label>
                                    <input
                                        id="attr-name-en"
                                        className={inputCls}
                                        value={form.name_en}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setForm((f) => ({
                                                ...f,
                                                name_en: v,
                                                key: mode === "add" && (!f.key || f.key === toAttributeKey(f.name_en)) ? toAttributeKey(v) : f.key,
                                            }));
                                        }}
                                        placeholder="Scent family"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className={labelCls} htmlFor="attr-key">{t("attributes.key")}</label>
                                <input
                                    id="attr-key"
                                    className={cn(inputCls, "font-mono")}
                                    value={form.key}
                                    onChange={(e) => set("key", e.target.value)}
                                    placeholder="scent_family"
                                />
                                <p className="mt-1 text-xs text-muted">{t("attributes.keyHelp")}</p>
                            </div>

                            <div>
                                <span className={labelCls}>{t("attributes.kind")}</span>
                                <div className="flex flex-wrap gap-2">
                                    {KINDS.map((k) => (
                                        <button
                                            key={k}
                                            type="button"
                                            onClick={() => set("kind", k)}
                                            aria-pressed={form.kind === k}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-sm border transition-colors",
                                                form.kind === k
                                                    ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                                                    : "border-[var(--card-border)] hover:bg-[var(--background)]",
                                            )}
                                        >
                                            {t(`attributes.kind.${k}`)}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-1.5 text-xs text-muted">{t(`attributes.kindHelp.${form.kind}`)}</p>
                            </div>

                            {/* Only the fields this kind needs — the same rule the
                                database CHECK enforces. */}
                            {(form.kind === "enum" || form.kind === "group_list") && (
                                <div>
                                    <span className={labelCls}>
                                        {form.kind === "enum" ? t("attributes.options") : t("attributes.groups")}
                                    </span>
                                    <div className="space-y-2">
                                        {rows.map((row, i) => (
                                            <div key={row.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                                                <input
                                                    className={cn(inputCls, "font-mono text-xs")}
                                                    value={row.value}
                                                    onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                                                    placeholder="oriental"
                                                    aria-label={t("attributes.optionValue")}
                                                />
                                                <input
                                                    className={inputCls}
                                                    value={row.label_ar}
                                                    onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, label_ar: e.target.value } : r)))}
                                                    placeholder="شرقي"
                                                    aria-label={t("attributes.nameAr")}
                                                />
                                                <input
                                                    className={inputCls}
                                                    value={row.label_en}
                                                    onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, label_en: e.target.value } : r)))}
                                                    placeholder="Oriental"
                                                    aria-label={t("attributes.nameEn")}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [newRow()])}
                                                    aria-label={t("common.delete")}
                                                    className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-[var(--background)]"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setRows([...rows, newRow()])}
                                        className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
                                    >
                                        <Plus className="w-4 h-4" />
                                        {form.kind === "enum" ? t("attributes.addOption") : t("attributes.addGroup")}
                                    </button>
                                </div>
                            )}

                            {form.kind === "range" && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div>
                                        <label className={labelCls} htmlFor="attr-min">{t("attributes.rangeMin")}</label>
                                        <input id="attr-min" inputMode="decimal" className={inputCls} value={form.range_min} onChange={(e) => set("range_min", e.target.value)} />
                                    </div>
                                    <div>
                                        <label className={labelCls} htmlFor="attr-max">{t("attributes.rangeMax")}</label>
                                        <input id="attr-max" inputMode="decimal" className={inputCls} value={form.range_max} onChange={(e) => set("range_max", e.target.value)} />
                                    </div>
                                    <div>
                                        <label className={labelCls} htmlFor="attr-unit-ar">{t("attributes.unitAr")}</label>
                                        <input id="attr-unit-ar" className={inputCls} value={form.unit_ar} onChange={(e) => set("unit_ar", e.target.value)} placeholder="من ٥" />
                                    </div>
                                    <div>
                                        <label className={labelCls} htmlFor="attr-unit-en">{t("attributes.unitEn")}</label>
                                        <input id="attr-unit-en" className={inputCls} value={form.unit_en} onChange={(e) => set("unit_en", e.target.value)} placeholder="of 5" />
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={form.is_filterable} onChange={(e) => set("is_filterable", e.target.checked)} />
                                    {t("attributes.filterable")}
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={form.is_comparable} onChange={(e) => set("is_comparable", e.target.checked)} />
                                    {t("attributes.comparable")}
                                </label>
                            </div>

                            {serverError && (
                                <p role="alert" className="text-sm text-red-500 break-words">{serverError}</p>
                            )}
                        </div>

                        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-[var(--card-border)] bg-[var(--card-bg)]">
                            <span className="text-xs text-muted min-h-[1rem]">{error ?? ""}</span>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm">
                                    {t("common.cancel")}
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={!!error || saving}
                                    className={cn(
                                        "px-4 py-2 rounded-lg bg-[var(--ink)] text-white text-sm font-medium",
                                        (!!error || saving) && "opacity-50 cursor-not-allowed",
                                    )}
                                >
                                    {saving ? t("common.saving") : t("common.save")}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
