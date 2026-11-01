"use client";

import { useLanguage } from "@/hooks/use-language";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Box,
    ChefHat,
    Info,
    Loader2,
    Plus,
    Trash2,
    Save,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { productRepository } from "@/lib/repositories/product-repository";
import type { Product } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";

type BomUnit = "per_order" | "per_item" | "per_unit";

interface BomItemRow {
    id: string;
    product_id: string;
    supply_id: string;
    quantity: number;
    unit: BomUnit;
    notes: string | null;
}

interface DraftRule {
    // Either id (existing) or temp key (new).
    key: string;
    id: string | null;
    supply_id: string | null;
    quantity: number;
    unit: BomUnit;
}

const UNIT_COPY: Record<BomUnit, { label: string; short: string; description: string }> = {
    per_order: { label: "recipe.unit.perOrder", short: "recipe.unit.perOrder.short", description: "recipe.unit.perOrder.desc" },
    per_item: { label: "recipe.unit.perItem", short: "recipe.unit.perItem.short", description: "recipe.unit.perItem.desc" },
    per_unit: { label: "recipe.unit.perUnit", short: "recipe.unit.perUnit.short", description: "recipe.unit.perUnit.desc" },
};

interface RecipeSectionProps {
    productId: string | null;
    productName?: string;
}

export function RecipeSection({ productId, productName }: RecipeSectionProps) {
    const { t } = useLanguage();
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    const [drafts, setDrafts] = useState<DraftRule[] | null>(null);

    // Fetch supplies (as picker options).
    const { data: supplies = [] } = useQuery({
        queryKey: ["recipe-supplies", tenantId],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async () => {
            if (!tenantId) return [] as Product[];
            const [{ data, error }, costs] = await Promise.all([
                supabase
                    .from("products")
                    .select("id, name, sku, stock_quantity, image_url")
                    .eq("tenant_id", tenantId)
                    .eq("is_supply", true)
                    .or("is_archived.is.null,is_archived.eq.false")
                    .order("name", { ascending: true }),
                // Cost is not a readable column; product_costs returns supply costs.
                productRepository.getProductCosts(tenantId),
            ]);
            if (error) throw error;
            return (data ?? []).map((supply) => ({ ...supply, cost: costs.get(supply.id) ?? null })) as Product[];
        },
    });

    // Fetch existing rules for this product.
    const { data: rules = [], isLoading } = useQuery({
        queryKey: ["bom-items", productId, tenantId],
        enabled: !!productId && !!tenantId,
        staleTime: 60_000,
        queryFn: async () => {
            if (!productId || !tenantId) return [] as BomItemRow[];
            const { data, error } = await supabase
                .from("bom_items")
                .select("id, product_id, supply_id, quantity, unit, notes")
                .eq("product_id", productId)
                .eq("tenant_id", tenantId);
            if (error) throw error;
            return (data ?? []) as BomItemRow[];
        },
    });

    // Seed drafts when rules land.
    const activeDrafts: DraftRule[] = useMemo(() => {
        if (drafts !== null) return drafts;
        return rules.map((r) => ({
            key: r.id,
            id: r.id,
            supply_id: r.supply_id,
            quantity: Number(r.quantity),
            unit: r.unit,
        }));
    }, [drafts, rules]);

    const supplyById = useMemo(() => {
        const m = new Map<string, Product>();
        for (const s of supplies) m.set(s.id, s);
        return m;
    }, [supplies]);

    // Running cost preview: (cost per supply × qty) summed across rules, per
    // single order line (per_unit treated as 1 unit for the preview).
    // null = a supply's cost is hidden from this member, so the total is unknown (never 0).
    const packagingCostPerLine = useMemo(() => {
        let total = 0;
        for (const d of activeDrafts) {
            if (!d.supply_id) continue;
            const s = supplyById.get(d.supply_id);
            if (!s) continue;
            if (s.cost == null) return null;
            total += s.cost * d.quantity;
        }
        return total;
    }, [activeDrafts, supplyById]);

    const isDirty = useMemo(() => {
        if (drafts === null) return false;
        if (drafts.length !== rules.length) return true;
        for (const d of drafts) {
            if (!d.id) return true;
            const existing = rules.find((r) => r.id === d.id);
            if (!existing) return true;
            if (
                existing.supply_id !== d.supply_id ||
                Number(existing.quantity) !== d.quantity ||
                existing.unit !== d.unit
            ) {
                return true;
            }
        }
        return false;
    }, [drafts, rules]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!productId || !tenantId) throw new Error("Missing product or tenant");
            const current = activeDrafts;

            // Validate
            const invalid = current.filter(
                (d) => !d.supply_id || d.quantity <= 0
            );
            if (invalid.length > 0) {
                throw new Error(
                    "Every recipe row needs a supply and a quantity greater than 0"
                );
            }

            // Delete rules that were removed.
            const keptIds = new Set(
                current.filter((d) => d.id).map((d) => d.id as string)
            );
            const toDelete = rules
                .filter((r) => !keptIds.has(r.id))
                .map((r) => r.id);
            if (toDelete.length > 0) {
                const { error } = await supabase
                    .from("bom_items")
                    .delete()
                    .in("id", toDelete);
                if (error) throw error;
            }

            // Upsert each rule.
            for (const d of current) {
                if (d.id) {
                    const { error } = await supabase
                        .from("bom_items")
                        .update({
                            supply_id: d.supply_id,
                            quantity: d.quantity,
                            unit: d.unit,
                        })
                        .eq("id", d.id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase.from("bom_items").insert({
                        product_id: productId,
                        supply_id: d.supply_id,
                        quantity: d.quantity,
                        unit: d.unit,
                        tenant_id: tenantId,
                    });
                    if (error) throw error;
                }
            }
        },
        onSuccess: () => {
            toast.success(t("recipe.saved"));
            setDrafts(null);
            queryClient.invalidateQueries({ queryKey: ["bom-items", productId] });
        },
        onError: (err: Error) => {
            // The raw database message is English and technical: show a translated one.
            toast.error(t("recipe.saveFailed"), t("recipe.err.saveGeneric"));
        },
    });

    // ── Helpers ──
    const setRule = (key: string, patch: Partial<DraftRule>) => {
        setDrafts((prev) => {
            const base = prev ?? activeDrafts;
            return base.map((d) => (d.key === key ? { ...d, ...patch } : d));
        });
    };

    const addRule = () => {
        const key = `draft-${Math.random().toString(36).slice(2, 9)}`;
        setDrafts((prev) => {
            const base = prev ?? activeDrafts;
            return [
                ...base,
                {
                    key,
                    id: null,
                    supply_id: null,
                    quantity: 1,
                    unit: "per_item" as BomUnit,
                },
            ];
        });
    };

    const removeRule = (key: string) => {
        setDrafts((prev) => {
            const base = prev ?? activeDrafts;
            return base.filter((d) => d.key !== key);
        });
    };

    const discard = () => setDrafts(null);

    if (!productId) {
        return (
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 text-center text-sm text-muted">
                {t("recipe.saveFirst")}
            </div>
        );
    }

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                        <ChefHat className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm">{t("recipe.title")}</h3>
                        <p className="text-[12px] text-muted mt-0.5 max-w-md">
                            {t("recipe.intro", { name: productName || t("recipe.thisProduct") })}
                        </p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted">
                        {t("recipe.packagingCost")}
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                        {packagingCostPerLine == null ? t("recipe.costUnknown") : formatIQD(packagingCostPerLine)}
                    </div>
                </div>
            </div>

            <div className="p-5 space-y-3">
                {isLoading ? (
                    <div className="py-8 text-center text-sm text-muted">
                        <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                        {t("recipe.loading")}
                    </div>
                ) : activeDrafts.length === 0 ? (
                    <EmptyRecipe onAdd={addRule} />
                ) : (
                    <div className="space-y-2">
                        {activeDrafts.map((d) => (
                            <RuleRow
                                key={d.key}
                                rule={d}
                                supplies={supplies}
                                onChange={(patch) => setRule(d.key, patch)}
                                onRemove={() => removeRule(d.key)}
                            />
                        ))}
                    </div>
                )}

                {activeDrafts.length > 0 && (
                    <button
                        type="button"
                        onClick={addRule}
                        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-[var(--card-border)] text-sm text-muted hover:text-foreground hover:border-teal-300 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        {t("recipe.addSupply")}
                    </button>
                )}

                {activeDrafts.length > 0 && (
                    <div className="rounded-xl bg-teal-50/60 border border-teal-100 px-3 py-2 text-[12px] text-teal-800 flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <p>{t("recipe.note")}</p>
                    </div>
                )}

                {/* Save / discard bar */}
                {isDirty && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
                        <button
                            type="button"
                            onClick={discard}
                            disabled={saveMutation.isPending}
                            className="px-3 py-1.5 text-sm text-muted hover:text-foreground rounded-lg transition-colors disabled:opacity-60"
                        >
                            {t("recipe.discard")}
                        </button>
                        <button
                            type="button"
                            onClick={() => saveMutation.mutate()}
                            disabled={saveMutation.isPending}
                            className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                                "bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
                            )}
                        >
                            {saveMutation.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Save className="w-3.5 h-3.5" />
                            )}
                            {t("recipe.save")}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function EmptyRecipe({ onAdd }: { onAdd: () => void }) {
    const { t } = useLanguage();
    return (
        <div className="rounded-xl border border-dashed border-[var(--card-border)] py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3">
                <Box className="w-5 h-5" />
            </div>
            <p className="font-medium text-sm">{t("recipe.empty")}</p>
            <p className="text-[12px] text-muted mt-1 max-w-xs mx-auto">{t("recipe.emptyHint")}</p>
            <button
                type="button"
                onClick={onAdd}
                className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-500 text-white text-sm font-medium hover:bg-teal-600"
            >
                <Plus className="w-4 h-4" />
                {t("recipe.addFirst")}
            </button>
        </div>
    );
}

interface RuleRowProps {
    rule: DraftRule;
    supplies: Product[];
    onChange: (patch: Partial<DraftRule>) => void;
    onRemove: () => void;
}

function RuleRow({ rule, supplies, onChange, onRemove }: RuleRowProps) {
    const { t } = useLanguage();
    const selected = supplies.find((s) => s.id === rule.supply_id);
    const lineCost = selected?.cost == null ? null : selected.cost * rule.quantity;

    return (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_100px_160px_auto] gap-2 items-center">
                {/* Supply picker */}
                <select
                    value={rule.supply_id ?? ""}
                    onChange={(e) =>
                        onChange({ supply_id: e.target.value || null })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
                >
                    <option value="">{t("products.recipe.chooseSupply")}</option>
                    {supplies.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                            {s.sku ? ` · ${s.sku}` : ""}
                        </option>
                    ))}
                </select>

                {/* Quantity */}
                <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={rule.quantity}
                    onChange={(e) =>
                        onChange({
                            quantity: Math.max(
                                0.01,
                                parseFloat(e.target.value) || 0
                            ),
                        })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-200"
                />

                {/* Unit */}
                <select
                    value={rule.unit}
                    onChange={(e) =>
                        onChange({ unit: e.target.value as BomUnit })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
                    title={t(UNIT_COPY[rule.unit].description)}
                >
                    {(
                        ["per_item", "per_unit", "per_order"] as const
                    ).map((u) => (
                        <option key={u} value={u}>
                            {t(UNIT_COPY[u].label)}
                        </option>
                    ))}
                </select>

                {/* Remove */}
                <button
                    type="button"
                    onClick={onRemove}
                    className="p-2 rounded-lg hover:bg-rose-50 hover:text-rose-600 text-muted transition-colors justify-self-end"
                    title={t("products.recipe.removeRule")}
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Cost preview */}
            {selected && (
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                    <span>
                        {rule.quantity} × {selected.name} @{" "}
                        <span className="tabular-nums">
                            {selected.cost == null ? "—" : formatIQD(selected.cost)}
                        </span>
                    </span>
                    <span className="font-semibold text-foreground tabular-nums">
                        {lineCost == null ? "—" : formatIQD(lineCost)} {t(UNIT_COPY[rule.unit].short)}
                    </span>
                </div>
            )}
        </div>
    );
}
