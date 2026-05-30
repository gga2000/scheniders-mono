"use client";

import { useRef } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { PackageX, CheckCircle, XCircle, ArrowRightLeft, ImageIcon, MessageSquare } from "lucide-react";
import { formatIQD, cn } from "@/lib/utils";
import type { QCItem, QCResolution } from "@/types/product";
import { QCStatusBadge } from "./qc-status-badge";
import { QCAgingChip } from "./qc-aging-chip";
import { QC_REASON_META, autoTagReason } from "./qc-constants";
import { useLanguage } from "@/components/providers/language-provider";
import { useIsMobile } from "@/hooks/use-mobile";

interface QCCardGridProps {
    items: QCItem[];
    selectedIds: Set<string>;
    focusedId?: string | null;
    onToggleSelect: (id: string) => void;
    onOpenDetail: (item: QCItem) => void;
    onQuickResolve: (item: QCItem, resolution: QCResolution) => void;
    showResolutionActions?: boolean;
}

export function QCCardGrid({
    items,
    selectedIds,
    focusedId,
    onToggleSelect,
    onOpenDetail,
    onQuickResolve,
    showResolutionActions = true,
}: QCCardGridProps) {
    const isMobile = useIsMobile(768);
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.map((item, idx) => (
                <QCGridCard
                    key={item.id}
                    item={item}
                    idx={idx}
                    selected={selectedIds.has(item.id)}
                    focused={focusedId === item.id}
                    isMobile={isMobile}
                    onToggleSelect={onToggleSelect}
                    onOpenDetail={onOpenDetail}
                    onQuickResolve={onQuickResolve}
                    showResolutionActions={showResolutionActions}
                />
            ))}
        </div>
    );
}

interface QCGridCardProps {
    item: QCItem;
    idx: number;
    selected: boolean;
    focused: boolean;
    isMobile: boolean;
    onToggleSelect: (id: string) => void;
    onOpenDetail: (item: QCItem) => void;
    onQuickResolve: (item: QCItem, resolution: QCResolution) => void;
    showResolutionActions: boolean;
}

// Swipe thresholds (physical, not directional — do not flip for RTL)
const SWIPE_FRACTION = 0.4; // 40% of card width
const SWIPE_MIN_PX = 80; // floor for narrow cards
const SWIPE_VELOCITY = 500; // px/sec — velocity shortcut

function QCGridCard({
    item,
    idx,
    selected,
    focused,
    isMobile,
    onToggleSelect,
    onOpenDetail,
    onQuickResolve,
    showResolutionActions,
}: QCGridCardProps) {
    const { t } = useLanguage();
    const cardRef = useRef<HTMLDivElement>(null);
    const x = useMotionValue(0);

    const reasonCat = item.reason_category || autoTagReason(item.reason);
    const reasonMeta = QC_REASON_META[reasonCat];
    const value = (item.product?.cost || 0) * item.quantity;
    const photoCount = item.photos?.length || 0;
    const firstPhoto = item.photos?.[0];

    const canSwipe =
        isMobile &&
        showResolutionActions &&
        (item.status === "pending_inspection" || item.status === "in_inspection");

    // Opacity of the reveal layers scales with drag distance.
    // Right-swipe reveals the emerald (restock) layer on the left side.
    // Left-swipe reveals the rose (write-off) layer on the right side.
    const restockOpacity = useTransform(x, [0, 40, 140], [0, 0.35, 1]);
    const writeOffOpacity = useTransform(x, [-140, -40, 0], [1, 0.35, 0]);
    const restockIconScale = useTransform(x, [0, 60, 140], [0.6, 0.9, 1.15]);
    const writeOffIconScale = useTransform(x, [-140, -60, 0], [1.15, 0.9, 0.6]);

    const handleDragEnd = (_e: unknown, info: PanInfo) => {
        if (!canSwipe) return;
        const width = cardRef.current?.offsetWidth ?? 0;
        const threshold = Math.max(width * SWIPE_FRACTION, SWIPE_MIN_PX);
        const { offset, velocity } = info;
        const passedRight = offset.x > threshold || velocity.x > SWIPE_VELOCITY;
        const passedLeft = offset.x < -threshold || velocity.x < -SWIPE_VELOCITY;

        if (passedRight) {
            onQuickResolve(item, "restocked");
        } else if (passedLeft) {
            onQuickResolve(item, "written_off");
        }
        // In all cases the motion.div springs back to x=0 via dragSnapToOrigin.
    };

    return (
        <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(idx * 0.03, 0.3) }}
            whileHover={!canSwipe ? { y: -3 } : undefined}
            drag={canSwipe ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.35}
            dragSnapToOrigin
            // Require ~8px of movement before drag kicks in so taps still open the drawer.
            dragDirectionLock
            onDragEnd={handleDragEnd}
            style={canSwipe ? { x, touchAction: "pan-y" } : undefined}
            className={cn(
                "group relative bg-[var(--card-bg)] border rounded-2xl overflow-hidden shadow-[var(--card-shadow)] hover:shadow-lg transition-shadow cursor-pointer",
                selected ? "border-amber-500 ring-2 ring-amber-500/30" : "border-[var(--card-border)]",
                focused && !selected && "ring-2 ring-amber-400/70"
            )}
            onClick={() => onOpenDetail(item)}
        >
            {/* Mobile swipe reveal layers — pointer-events-none so they never steal taps. */}
            {canSwipe && (
                <>
                    <motion.div
                        aria-hidden
                        style={{ opacity: restockOpacity }}
                        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-start bg-emerald-500 px-6"
                    >
                        <motion.div
                            style={{ scale: restockIconScale }}
                            className="flex items-center gap-2 text-white"
                        >
                            <CheckCircle className="w-8 h-8" />
                            <span className="text-sm font-semibold">
                                {t("qc.swipe.restock")}
                            </span>
                        </motion.div>
                    </motion.div>
                    <motion.div
                        aria-hidden
                        style={{ opacity: writeOffOpacity }}
                        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-end bg-rose-500 px-6"
                    >
                        <motion.div
                            style={{ scale: writeOffIconScale }}
                            className="flex items-center gap-2 text-white"
                        >
                            <span className="text-sm font-semibold">
                                {t("qc.swipe.writeOff")}
                            </span>
                            <XCircle className="w-8 h-8" />
                        </motion.div>
                    </motion.div>
                </>
            )}

            {/* Card foreground — sits above the reveal layers */}
            <div className="relative z-10 bg-[var(--card-bg)]">
                {/* Select checkbox */}
                <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect(item.id)}
                        className="w-4 h-4 rounded border-[var(--card-border)] accent-amber-500 shadow-sm"
                    />
                </div>

                {/* Aging chip */}
                <div className="absolute top-3 right-3 z-10">
                    <QCAgingChip createdAt={item.created_at} compact />
                </div>

                {/* Image or photo evidence preview */}
                <div className="aspect-[4/3] bg-gradient-to-br from-[var(--background)] to-[var(--card-bg)] relative">
                    {firstPhoto ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={firstPhoto} alt="QC evidence" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                            <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 bg-black/60 text-white rounded-md text-xs font-medium backdrop-blur-sm">
                                <ImageIcon className="w-3 h-3" />
                                {photoCount}
                            </span>
                        </>
                    ) : item.product?.image_url ? (
                        <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" loading="lazy" draggable={false} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <PackageX className="w-10 h-10 text-muted/40" />
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <h4 className="font-semibold text-sm text-foreground truncate">
                                {item.product?.name || t("qc.unknownProduct")}
                            </h4>
                            {item.product?.sku && <p className="text-xs text-muted">{item.product.sku}</p>}
                        </div>
                        <QCStatusBadge status={item.status} />
                    </div>

                    <div className="flex items-center justify-between text-xs">
                        {(() => {
                            const ReasonIcon = reasonMeta.icon;
                            return (
                                <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium", reasonMeta.bg, reasonMeta.color)}>
                                    <ReasonIcon className="w-3 h-3" />
                                    {t(`qc.reason.${reasonCat}`)}
                                </span>
                            );
                        })()}
                        <span className="font-semibold text-foreground tabular-nums">{item.quantity} × {formatIQD(item.product?.cost || 0)}</span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
                        <div>
                            <p className="text-[10px] text-muted uppercase tracking-wider">{t("qc.detail.valueAtRisk")}</p>
                            <p className="font-bold tabular-nums text-foreground">{formatIQD(value)}</p>
                        </div>
                        {item.notes && (
                            <MessageSquare className="w-4 h-4 text-violet-500" />
                        )}
                    </div>

                    {/* Quick actions (desktop hover) */}
                    {showResolutionActions && (item.status === "pending_inspection" || item.status === "in_inspection") && (
                        <div
                            className="hidden md:flex items-center gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => onQuickResolve(item, "restocked")}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 text-xs font-medium transition"
                            >
                                <CheckCircle className="w-3.5 h-3.5" />
                                {t("qc.bulk.restock")}
                            </button>
                            <button
                                onClick={() => onQuickResolve(item, "written_off")}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 text-xs font-medium transition"
                            >
                                <XCircle className="w-3.5 h-3.5" />
                                {t("qc.bulk.writeOff")}
                            </button>
                            <button
                                onClick={() => onQuickResolve(item, "returned_to_supplier")}
                                title={t("qc.bulk.return")}
                                className="p-1.5 rounded-lg bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 transition"
                            >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Mobile swipe hint (first visible, subtle) */}
                    {canSwipe && (
                        <p className="md:hidden text-[10px] text-muted/70 text-center pt-1 select-none">
                            {t("qc.swipe.hint")}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
