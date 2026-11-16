"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Tags, Plus, Pencil, Trash2, Filter, GitCompare, AlertTriangle, Check, LayoutList } from "lucide-react";
import { resolveI18n, type ProductAttributeDef } from "@scheniders/shared";
import {
    useAttributeDefsQuery,
    useAttributeUsageQuery,
    useAddAttributeDefMutation,
    useUpdateAttributeDefMutation,
    useDeleteAttributeDefMutation,
    useAddAttributeTemplateMutation,
} from "@/hooks/use-product-attributes-query";
import { useBusinessTypes } from "@/hooks/use-tenant";
import { ATTRIBUTE_TEMPLATES, attributeTemplatesFor, type AttributeTemplate } from "@/lib/business-types";
import {
    AttributeFormModal,
    toWrite,
    type AttributeFormData,
} from "@/components/products/attribute-form-modal";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** A one-line preview of what the attribute holds, per kind. */
function summarise(def: ProductAttributeDef, locale: string): string {
    const label = (l?: Record<string, string>) =>
        (locale === "ar" ? l?.ar ?? l?.en : l?.en ?? l?.ar) ?? "";
    switch (def.kind) {
        case "enum":
            return def.options.map((o) => label(o.label_i18n) || o.value).join(" · ");
        case "group_list":
            return def.group_keys.map((g) => label(g.label_i18n) || g.key).join(" → ");
        case "range":
            return `${def.range_min} – ${def.range_max} ${label(def.unit_i18n)}`.trim();
        default:
            return "";
    }
}

export function AttributesTab() {
    const { t, language } = useLanguage();
    const { data: defs = [], isLoading } = useAttributeDefsQuery();
    const { data: usage = {} } = useAttributeUsageQuery();
    const addMutation = useAddAttributeDefMutation();
    const updateMutation = useUpdateAttributeDefMutation();
    const deleteMutation = useDeleteAttributeDefMutation();
    const templateMutation = useAddAttributeTemplateMutation();
    const businessTypes = useBusinessTypes();

    const [isModalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<ProductAttributeDef | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<ProductAttributeDef | null>(null);

    const existingKeys = useMemo(() => defs.map((d) => d.key), [defs]);

    // Ready sets (B10): the store's own trade first, then the rest.
    const templates = useMemo(() => {
        const mine = attributeTemplatesFor(businessTypes);
        const mineIds = new Set(mine.map((tpl) => tpl.id));
        return [
            ...mine.map((tpl) => ({ tpl, mine: true })),
            ...ATTRIBUTE_TEMPLATES.filter((tpl) => !mineIds.has(tpl.id)).map((tpl) => ({ tpl, mine: false })),
        ];
    }, [businessTypes]);

    const handleTemplate = async (tpl: AttributeTemplate) => {
        const have = new Set(existingKeys);
        const missing = tpl.attributes.filter((a) => !have.has(a.key));
        if (missing.length === 0) {
            toast({ title: t("attributes.templates.none") });
            return;
        }
        try {
            const after = defs.reduce((max, d) => Math.max(max, d.display_order), 0);
            const added = await templateMutation.mutateAsync({ attributes: missing, after });
            toast({ title: t("attributes.templates.added", { count: added }) });
        } catch (e) {
            toast({
                title: t("attributes.templates.failed"),
                description: e instanceof Error ? e.message : String(e),
                variant: "error",
            });
        }
    };

    const handleSubmit = async (form: AttributeFormData) => {
        const write = toWrite(form);
        if (editing) await updateMutation.mutateAsync({ id: editing.id, ...write });
        else await addMutation.mutateAsync(write);
        toast({ title: t(editing ? "attributes.updated" : "attributes.created") });
    };

    const handleDelete = async (def: ProductAttributeDef) => {
        try {
            await deleteMutation.mutateAsync(def.id);
            toast({ title: t("attributes.deleted") });
        } catch (e) {
            toast({
                title: t("attributes.deleteFailed"),
                description: e instanceof Error ? e.message : String(e),
                variant: "error",
            });
        } finally {
            setConfirmDelete(null);
        }
    };

    const name = (def: ProductAttributeDef) =>
        (language === "ar" ? def.name_i18n.ar ?? def.name_i18n.en : def.name_i18n.en ?? def.name_i18n.ar) ?? def.key;

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Tags className="w-5 h-5" />
                        {t("attributes.title")}
                    </h2>
                    <p className="mt-1 text-sm text-muted">{t("attributes.intro")}</p>
                </div>
                <button
                    onClick={() => {
                        setEditing(null);
                        setModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[var(--ink)] text-white rounded-xl font-medium text-sm"
                >
                    <Plus className="w-4 h-4" />
                    {t("attributes.add")}
                </button>
            </div>

            {!isLoading && (
                <div data-testid="attribute-templates" className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold flex items-center gap-2">
                            <LayoutList className="w-4 h-4" />
                            {t("attributes.templates.title")}
                        </p>
                        <p className="text-xs text-muted">{t("attributes.templates.hint")}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {templates.map(({ tpl, mine }) => {
                            const complete = tpl.attributes.every((a) => existingKeys.includes(a.key));
                            return (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => handleTemplate(tpl)}
                                    disabled={complete || templateMutation.isPending}
                                    title={tpl.attributes.map((a) => resolveI18n(a.name_i18n, language)).join(" · ")}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                                        complete
                                            ? "border-[var(--card-border)] text-muted cursor-default"
                                            : "border-[var(--card-border)] bg-[var(--card-bg)] hover:border-foreground",
                                    )}
                                >
                                    {complete ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                                    <span>{resolveI18n(tpl.name_i18n, language)}</span>
                                    {mine && !complete && (
                                        <span className="rounded-full bg-[var(--pastel-yellow)] px-1.5 text-[11px] font-medium text-foreground">
                                            {t("attributes.templates.yours")}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="space-y-2" aria-busy="true">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-20 rounded-xl bg-[var(--background)] animate-pulse" />
                    ))}
                </div>
            ) : defs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--card-border)] p-10 text-center">
                    <Tags className="w-8 h-8 mx-auto text-muted" />
                    <p className="mt-3 font-medium">{t("attributes.emptyTitle")}</p>
                    <p className="mt-1 text-sm text-muted max-w-md mx-auto">{t("attributes.emptyBody")}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {defs.map((def, i) => {
                        const used = usage[def.id] ?? 0;
                        return (
                            <motion.div
                                key={def.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(i * 0.03, 0.2) }}
                                className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium">{name(def)}</span>
                                            <code className="text-xs text-muted font-mono">{def.key}</code>
                                            <span className="text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--background)] text-muted">
                                                {t(`attributes.kind.${def.kind}`)}
                                            </span>
                                        </div>
                                        {summarise(def, language) && (
                                            <p className="mt-1 text-sm text-muted break-words">{summarise(def, language)}</p>
                                        )}
                                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                                            <span>{t("attributes.usedOn", { count: used })}</span>
                                            {def.is_filterable && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Filter className="w-3 h-3" />
                                                    {t("attributes.filterable")}
                                                </span>
                                            )}
                                            {def.is_comparable && (
                                                <span className="inline-flex items-center gap-1">
                                                    <GitCompare className="w-3 h-3" />
                                                    {t("attributes.comparable")}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <button
                                            onClick={() => {
                                                setEditing(def);
                                                setModalOpen(true);
                                            }}
                                            aria-label={t("common.edit")}
                                            className="p-2 rounded-lg hover:bg-[var(--background)]"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete(def)}
                                            aria-label={t("common.delete")}
                                            className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-[var(--background)]"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {confirmDelete?.id === def.id && (
                                    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                                        <p className="text-sm flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                                            {/* Deleting cascades to the values, so say how many
                                                are about to go rather than asking "are you sure?" */}
                                            <span>{t("attributes.deleteWarning", { count: used })}</span>
                                        </p>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                onClick={() => handleDelete(def)}
                                                disabled={deleteMutation.isPending}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm",
                                                    deleteMutation.isPending && "opacity-50 cursor-not-allowed",
                                                )}
                                            >
                                                {t("attributes.confirmDelete")}
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete(null)}
                                                className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-sm"
                                            >
                                                {t("common.cancel")}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            <AttributeFormModal
                isOpen={isModalOpen}
                onClose={() => setModalOpen(false)}
                onSubmit={handleSubmit}
                def={editing}
                mode={editing ? "edit" : "add"}
                existingKeys={existingKeys}
            />
        </div>
    );
}
