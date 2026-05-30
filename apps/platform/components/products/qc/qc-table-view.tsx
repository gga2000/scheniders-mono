"use client";

import { motion } from "framer-motion";
import { CheckCircle, XCircle, PackageX, ImageIcon, MessageSquare, ArrowRightLeft } from "lucide-react";
import { formatIQD, formatDate, cn } from "@/lib/utils";
import type { QCItem } from "@/types/product";
import { QCStatusBadge } from "./qc-status-badge";
import { QCAgingChip } from "./qc-aging-chip";
import { QC_REASON_META, autoTagReason } from "./qc-constants";
import { useLanguage } from "@/components/providers/language-provider";

interface QCTableViewProps {
    items: QCItem[];
    selectedIds: Set<string>;
    focusedId?: string | null;
    onToggleSelect: (id: string) => void;
    onToggleAll: () => void;
    onOpenDetail: (item: QCItem) => void;
    onQuickResolve: (item: QCItem, resolution: "restocked" | "written_off" | "returned_to_supplier") => void;
    showResolutionActions?: boolean;
}

export function QCTableView({
    items,
    selectedIds,
    focusedId,
    onToggleSelect,
    onToggleAll,
    onOpenDetail,
    onQuickResolve,
    showResolutionActions = true,
}: QCTableViewProps) {
    const { t } = useLanguage();
    const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));
    const someSelected = items.some((i) => selectedIds.has(i.id));

    return (
        <div className="bg-[var(--card-bg)] shadow-[var(--card-shadow)] rounded-2xl overflow-hidden border border-[var(--card-border)]">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/60 text-xs uppercase tracking-wider text-muted">
                            <th className="p-3 w-10">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    ref={(el) => {
                                        if (el) el.indeterminate = !allSelected && someSelected;
                                    }}
                                    onChange={onToggleAll}
                                    className="w-4 h-4 rounded border-[var(--card-border)] accent-amber-500"
                                />
                            </th>
                            <th className="p-3 font-semibold">{t("qc.col.product")}</th>
                            <th className="p-3 font-semibold">{t("qc.col.reason")}</th>
                            <th className="p-3 font-semibold">{t("qc.col.qty")}</th>
                            <th className="p-3 font-semibold">{t("qc.col.value")}</th>
                            <th className="p-3 font-semibold">{t("qc.col.age")}</th>
                            <th className="p-3 font-semibold">{t("qc.col.status")}</th>
                            <th className="p-3 font-semibold">{t("qc.col.order")}</th>
                            <th className="p-3 font-semibold">{t("qc.col.entered")}</th>
                            <th className="p-3 font-semibold text-right">{t("qc.col.actions")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--card-border)]">
                        {items.map((item, idx) => {
                            const selected = selectedIds.has(item.id);
                            const focused = focusedId === item.id;
                            const reasonCat = item.reason_category || autoTagReason(item.reason);
                            const reasonMeta = QC_REASON_META[reasonCat];
                            const value = (item.product?.cost || 0) * item.quantity;
                            const photoCount = item.photos?.length || 0;
                            const hasNotes = !!item.notes;

                            return (
                                <motion.tr
                                    key={item.id}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                                    onClick={() => onOpenDetail(item)}
                                    className={cn(
                                        "hover:bg-[var(--background)]/40 transition-colors cursor-pointer",
                                        selected && "bg-amber-500/5",
                                        focused && "ring-2 ring-inset ring-amber-400/70 bg-amber-500/5"
                                    )}
                                >
                                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => onToggleSelect(item.id)}
                                            className="w-4 h-4 rounded border-[var(--card-border)] accent-amber-500"
                                        />
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--background)] flex-shrink-0 flex items-center justify-center">
                                                {item.product?.image_url ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        loading="lazy"
                                                        decoding="async"
                                                        src={item.product.image_url}
                                                        alt={item.product?.name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <PackageX className="w-5 h-5 text-muted" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-foreground truncate max-w-[200px]">{item.product?.name || t("qc.unknownProduct")}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    {item.product?.sku && (
                                                        <span className="text-xs text-muted">{item.product.sku}</span>
                                                    )}
                                                    {(photoCount > 0 || hasNotes) && (
                                                        <div className="flex items-center gap-1">
                                                            {photoCount > 0 && (
                                                                <span className="inline-flex items-center gap-0.5 text-xs text-blue-600">
                                                                    <ImageIcon className="w-3 h-3" />
                                                                    {photoCount}
                                                                </span>
                                                            )}
                                                            {hasNotes && <MessageSquare className="w-3 h-3 text-violet-500" />}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-3">
                                        <div className="flex flex-col gap-1">
                                            {(() => {
                                                const ReasonIcon = reasonMeta.icon;
                                                return (
                                                    <span
                                                        className={cn(
                                                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium w-fit",
                                                            reasonMeta.bg,
                                                            reasonMeta.color
                                                        )}
                                                    >
                                                        <ReasonIcon className="w-3 h-3" />
                                                        {t(`qc.reason.${reasonCat}`)}
                                                    </span>
                                                );
                                            })()}
                                            <span className="text-xs text-muted truncate max-w-[180px]" title={item.reason}>
                                                {item.reason}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-3 font-semibold tabular-nums">{item.quantity}</td>
                                    <td className="p-3 tabular-nums font-medium text-foreground">{formatIQD(value)}</td>
                                    <td className="p-3">
                                        <QCAgingChip createdAt={item.created_at} />
                                    </td>
                                    <td className="p-3">
                                        <QCStatusBadge status={item.status} />
                                    </td>
                                    <td className="p-3 text-sm">
                                        {item.order?.order_id ? (
                                            <span className="font-medium text-[var(--accent)]">#{item.order.order_id}</span>
                                        ) : (
                                            <span className="text-muted">—</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-xs text-muted whitespace-nowrap">{formatDate(item.created_at)}</td>
                                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                        {showResolutionActions && (item.status === "pending_inspection" || item.status === "in_inspection") ? (
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => onQuickResolve(item, "restocked")}
                                                    title={t("qc.bulk.restock")}
                                                    className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => onQuickResolve(item, "written_off")}
                                                    title={t("qc.bulk.writeOff")}
                                                    className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => onQuickResolve(item, "returned_to_supplier")}
                                                    title={t("qc.bulk.return")}
                                                    className="p-1.5 rounded-lg bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 transition"
                                                >
                                                    <ArrowRightLeft className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted float-right">{t("qc.view")}</span>
                                        )}
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
