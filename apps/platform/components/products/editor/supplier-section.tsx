"use client";

import { useState } from "react";
import { Truck, Plus, Building2, ChevronDown, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

export interface SupplierFormData {
    supplier_name: string;
    supplier_contact: string;
    supplier_email: string;
    lead_time_days: number | null;
    minimum_order_quantity: number | null;
    unit_cost: number | null;
    notes: string;
    is_primary: boolean;
}

interface SupplierSectionProps {
    suppliers: SupplierFormData[];
    onChange: (suppliers: SupplierFormData[]) => void;
    /** Unit cost is for admins only (products.manage). */
    showCost?: boolean;
}

const defaultSupplier: SupplierFormData = {
    supplier_name: "",
    supplier_contact: "",
    supplier_email: "",
    lead_time_days: null,
    minimum_order_quantity: null,
    unit_cost: null,
    notes: "",
    is_primary: false,
};

export function SupplierSection({ suppliers, onChange, showCost = true }: SupplierSectionProps) {
    const { t } = useLanguage();
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    const addSupplier = () => {
        const newSuppliers = [...suppliers, { ...defaultSupplier }];
        onChange(newSuppliers);
        setExpandedIndex(newSuppliers.length - 1);
    };

    const removeSupplier = (index: number) => {
        const newSuppliers = suppliers.filter((_, i) => i !== index);
        onChange(newSuppliers);
        if (expandedIndex === index) {
            setExpandedIndex(null);
        } else if (expandedIndex !== null && expandedIndex > index) {
            setExpandedIndex(expandedIndex - 1);
        }
    };

    const updateSupplier = (index: number, updates: Partial<SupplierFormData>) => {
        let newSuppliers = suppliers.map((supplier, i) =>
            i === index ? { ...supplier, ...updates } : supplier
        );

        // If marking as primary, unmark all others
        if (updates.is_primary) {
            newSuppliers = newSuppliers.map((supplier, i) => ({
                ...supplier,
                is_primary: i === index,
            }));
        }

        onChange(newSuppliers);
    };

    const toggleExpand = (index: number) => {
        setExpandedIndex(expandedIndex === index ? null : index);
    };

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={addSupplier}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium hover:bg-[var(--pastel-green)] transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t("products.ed.supplier.add")}
                </button>
            </div>

            {/* Empty state */}
            {suppliers.length === 0 && (
                <div className="p-8 bg-[var(--background)] rounded-xl border border-dashed border-[var(--card-border)] text-center">
                    <Truck className="w-8 h-8 text-muted mx-auto mb-2" />
                    <p className="text-muted text-sm">
                        {t("products.ed.supplier.empty")}
                    </p>
                </div>
            )}

            {/* Supplier cards */}
            {suppliers.map((supplier, index) => {
                const isExpanded = expandedIndex === index;

                return (
                    <div key={index} className="rounded-xl border border-[var(--card-border)] overflow-hidden">
                        {/* Collapsed header */}
                        <button
                            type="button"
                            onClick={() => toggleExpand(index)}
                            className="w-full flex items-center gap-3 p-4 bg-[var(--background)] rounded-xl cursor-pointer hover:border-[var(--ink)]/20 transition-colors text-left"
                        >
                            <div className="w-10 h-10 rounded-lg bg-[var(--card-border)] flex items-center justify-center shrink-0">
                                <Building2 className="w-5 h-5 text-muted" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                    {supplier.supplier_name || t("products.ed.supplier.unnamed")}
                                </p>
                                {supplier.supplier_email && (
                                    <p className="text-xs text-muted truncate">{supplier.supplier_email}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {supplier.is_primary && (
                                    <span className="px-2 py-0.5 bg-[var(--pastel-green)] text-green-800 rounded-full text-xs font-medium">
                                        {t("products.ed.supplier.primary")}
                                    </span>
                                )}
                                {supplier.lead_time_days !== null && supplier.lead_time_days > 0 && (
                                    <span className="text-xs text-muted">{t("products.ed.supplier.days").replace("{days}", String(supplier.lead_time_days))}</span>
                                )}
                                <ChevronDown
                                    className={`w-4 h-4 text-muted transition-transform ${
                                        isExpanded ? "rotate-180" : ""
                                    }`}
                                />
                            </div>
                        </button>

                        {/* Expanded form */}
                        {isExpanded && (
                            <div className="px-4 pb-4 bg-[var(--background)]">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[var(--card-border)]">
                                    {/* Supplier Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            {t("products.ed.supplier.name")} <span className="text-rose-500">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={supplier.supplier_name}
                                            onChange={(e) => updateSupplier(index, { supplier_name: e.target.value })}
                                            placeholder={t("products.ed.supplier.companyPh")}
                                            required
                                            className="w-full px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                        />
                                    </div>

                                    {/* Contact Person */}
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            {t("products.ed.supplier.contact")}
                                        </label>
                                        <input
                                            type="text"
                                            value={supplier.supplier_contact}
                                            onChange={(e) => updateSupplier(index, { supplier_contact: e.target.value })}
                                            placeholder={t("products.ed.supplier.fullNamePh")}
                                            className="w-full px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                        />
                                    </div>

                                    {/* Email */}
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            {t("products.ed.supplier.email")}
                                        </label>
                                        <input
                                            type="email"
                                            value={supplier.supplier_email}
                                            onChange={(e) => updateSupplier(index, { supplier_email: e.target.value })}
                                            placeholder={t("products.ed.supplier.emailPh")}
                                            className="w-full px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                        />
                                    </div>

                                    {/* Lead Time */}
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            {t("products.ed.supplier.lead")}
                                        </label>
                                        <input
                                            type="number"
                                            value={supplier.lead_time_days ?? ""}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                updateSupplier(index, { lead_time_days: val === "" ? null : parseInt(val) || 0 });
                                            }}
                                            placeholder={t("products.ed.supplier.leadPh")}
                                            min={0}
                                            className="w-full px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                        />
                                    </div>

                                    {/* Min Order Qty */}
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            {t("products.ed.supplier.moq")}
                                        </label>
                                        <input
                                            type="number"
                                            value={supplier.minimum_order_quantity ?? ""}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                updateSupplier(index, { minimum_order_quantity: val === "" ? null : parseInt(val) || 0 });
                                            }}
                                            placeholder={t("products.ed.supplier.moqPh")}
                                            min={0}
                                            className="w-full px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                        />
                                    </div>

                                    {/* Unit Cost */}
                                    {showCost && (
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            {t("products.ed.supplier.unitCost")}
                                        </label>
                                        <input
                                            type="number"
                                            value={supplier.unit_cost ?? ""}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                updateSupplier(index, { unit_cost: val === "" ? null : parseFloat(val) || 0 });
                                            }}
                                            placeholder={t("products.ed.supplier.unitCostPh")}
                                            min={0}
                                            className="w-full px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
                                        />
                                    </div>
                                    )}

                                    {/* Notes - full width */}
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            {t("products.ed.supplier.notes")}
                                        </label>
                                        <textarea
                                            value={supplier.notes}
                                            onChange={(e) => updateSupplier(index, { notes: e.target.value })}
                                            placeholder={t("products.ed.supplier.notesPh")}
                                            rows={2}
                                            className="w-full px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all resize-none"
                                        />
                                    </div>

                                    {/* Primary toggle + Delete */}
                                    <div className="md:col-span-2 flex items-center justify-between pt-2">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <span className="text-sm text-foreground font-medium">{t("products.ed.supplier.primarySupplier")}</span>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={supplier.is_primary}
                                                onClick={() => updateSupplier(index, { is_primary: !supplier.is_primary })}
                                                className={`relative w-11 h-6 rounded-full transition-colors ${
                                                    supplier.is_primary ? "bg-emerald-500" : "bg-gray-300"
                                                }`}
                                            >
                                                <span
                                                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${
                                                        supplier.is_primary ? "translate-x-5" : "translate-x-0"
                                                    }`}
                                                />
                                            </button>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => removeSupplier(index)}
                                            className="text-sm text-rose-500 hover:text-rose-700 flex items-center gap-1 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            {t("products.ed.supplier.remove")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
