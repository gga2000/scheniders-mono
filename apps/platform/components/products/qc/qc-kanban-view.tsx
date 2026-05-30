"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { PackageX, Camera } from "lucide-react";
import { formatIQD, cn } from "@/lib/utils";
import type { QCItem, QCStatus } from "@/types/product";
import { QCAgingChip } from "./qc-aging-chip";
import { QC_STATUS_META, QC_REASON_META, autoTagReason } from "./qc-constants";
import { useLanguage } from "@/components/providers/language-provider";

const COLUMNS: { id: QCStatus; dropHintKey: string }[] = [
    { id: "pending_inspection", dropHintKey: "qc.kanban.drop.pending" },
    { id: "in_inspection", dropHintKey: "qc.kanban.drop.inInspection" },
    { id: "restocked", dropHintKey: "qc.kanban.drop.restocked" },
    { id: "written_off", dropHintKey: "qc.kanban.drop.writtenOff" },
    { id: "returned_to_supplier", dropHintKey: "qc.kanban.drop.returned" },
];

interface QCKanbanViewProps {
    items: QCItem[];
    focusedId?: string | null;
    onOpenDetail: (item: QCItem) => void;
    onMoveStatus: (item: QCItem, toStatus: QCStatus) => void;
}

export function QCKanbanView({ items, focusedId, onOpenDetail, onMoveStatus }: QCKanbanViewProps) {
    const { t } = useLanguage();
    const [dragOver, setDragOver] = useState<QCStatus | null>(null);

    const grouped = useMemo(() => {
        const map: Record<QCStatus, QCItem[]> = {
            pending_inspection: [],
            in_inspection: [],
            restocked: [],
            written_off: [],
            returned_to_supplier: [],
        };
        for (const item of items) map[item.status]?.push(item);
        return map;
    }, [items]);

    const handleDrop = (e: React.DragEvent, toStatus: QCStatus) => {
        e.preventDefault();
        setDragOver(null);
        const id = e.dataTransfer.getData("text/plain");
        const item = items.find((i) => i.id === id);
        if (item && item.status !== toStatus) onMoveStatus(item, toStatus);
    };

    return (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
            {COLUMNS.map(({ id, dropHintKey }) => {
                const meta = QC_STATUS_META[id];
                const colItems = grouped[id];
                const totalValue = colItems.reduce((s, i) => s + (i.product?.cost || 0) * i.quantity, 0);
                const isDragOver = dragOver === id;

                return (
                    <div
                        key={id}
                        className="flex-1 min-w-[260px] snap-start"
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(id);
                        }}
                        onDragLeave={() => setDragOver((prev) => (prev === id ? null : prev))}
                        onDrop={(e) => handleDrop(e, id)}
                    >
                        <div
                            className={cn(
                                "rounded-2xl p-3 h-full transition-colors",
                                isDragOver
                                    ? "bg-amber-500/15 border-2 border-dashed border-amber-500"
                                    : "bg-[var(--background)]/50 border border-[var(--card-border)]"
                            )}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className={cn("w-2 h-2 rounded-full", meta.dot)} />
                                    <h3 className="font-bold text-sm">{t(`qc.status.${id}`)}</h3>
                                    <span className="px-1.5 py-0.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md text-xs font-medium">
                                        {colItems.length}
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs text-muted mb-3 tabular-nums">
                                {t("qc.kanban.columnValue")} <span className="font-medium text-foreground">{formatIQD(totalValue)}</span>
                            </p>

                            {isDragOver && (
                                <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-800 text-xs font-medium text-center">
                                    {t(dropHintKey)}
                                </div>
                            )}

                            <div className="space-y-2 min-h-[100px]">
                                {colItems.length === 0 && !isDragOver && (
                                    <div className="text-center py-6 text-xs text-muted italic">{t("qc.kanban.noItems")}</div>
                                )}
                                {colItems.map((item) => {
                                    const reasonCat = item.reason_category || autoTagReason(item.reason);
                                    const reasonMeta = QC_REASON_META[reasonCat];
                                    const focused = focusedId === item.id;
                                    return (
                                        <motion.button
                                            key={item.id}
                                            layout
                                            whileHover={{ y: -2 }}
                                            draggable
                                            onDragStart={(e: any) => {
                                                e.dataTransfer.setData("text/plain", item.id);
                                                e.dataTransfer.effectAllowed = "move";
                                            }}
                                            onClick={() => onOpenDetail(item)}
                                            className={cn(
                                                "w-full text-left bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2.5 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all",
                                                focused && "ring-2 ring-amber-400/70"
                                            )}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--background)] flex-shrink-0 flex items-center justify-center">
                                                    {item.product?.image_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={item.product.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                                    ) : (
                                                        <PackageX className="w-5 h-5 text-muted" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium text-sm truncate">{item.product?.name || t("qc.unknownProduct")}</p>
                                                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                        {(() => {
                                                            const ReasonIcon = reasonMeta.icon;
                                                            return (
                                                                <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium", reasonMeta.bg, reasonMeta.color)}>
                                                                    <ReasonIcon className="w-2.5 h-2.5" />
                                                                    {t(`qc.reason.${reasonCat}`)}
                                                                </span>
                                                            );
                                                        })()}
                                                        <QCAgingChip createdAt={item.created_at} compact />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--card-border)]">
                                                <span className="text-xs font-semibold tabular-nums">
                                                    {item.quantity}× {formatIQD(item.product?.cost || 0)}
                                                </span>
                                                {item.photos && item.photos.length > 0 && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium"><Camera className="w-3 h-3" /> {item.photos.length}</span>
                                                )}
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
