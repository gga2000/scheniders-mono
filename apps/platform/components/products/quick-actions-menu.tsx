"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    MoreVertical,
    Edit,
    Archive,
    ArchiveRestore,
    Eye,
    ShoppingBag,
    Trash2,
    Copy,
    AlertTriangle,
} from "lucide-react";
import { Product } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface QuickActionsMenuProps {
    product: Product;
    onEdit: () => void;
    onArchive: () => void;
    onRestore?: () => void;
    onViewDetails: () => void;
    onViewOrders: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const itemClasses =
    "flex items-center gap-3 px-3 py-2.5 text-sm outline-none cursor-pointer select-none rounded-lg transition-colors data-[highlighted]:bg-[var(--background)]";

export function QuickActionsMenu({
    product,
    onEdit,
    onArchive,
    onRestore,
    onViewDetails,
    onViewOrders,
    onDuplicate,
    onDelete,
    open,
    onOpenChange,
}: QuickActionsMenuProps) {
    const { t } = useLanguage();
    const [confirmingArchive, setConfirmingArchive] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setConfirmingArchive(false);
            setConfirmingDelete(false);
        }
        onOpenChange?.(next);
    };

    return (
        <DropdownMenu.Root
            open={open}
            onOpenChange={handleOpenChange}
        >
            <DropdownMenu.Trigger asChild>
                <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)] min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Product actions"
                >
                    <MoreVertical className="w-4 h-4 text-muted" />
                </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="z-50 w-52 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--card-border)] overflow-hidden p-1 animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* View Details */}
                    <DropdownMenu.Item
                        className={cn(itemClasses, "text-foreground")}
                        onSelect={onViewDetails}
                    >
                        <Eye className="w-4 h-4" />
                        {t("products.actions.viewDetails")}
                    </DropdownMenu.Item>

                    {/* Edit */}
                    <DropdownMenu.Item
                        className={cn(itemClasses, "text-foreground")}
                        onSelect={onEdit}
                    >
                        <Edit className="w-4 h-4" />
                        {t("products.actions.editProduct")}
                    </DropdownMenu.Item>

                    {/* View Orders */}
                    <DropdownMenu.Item
                        className={cn(itemClasses, "text-foreground")}
                        onSelect={onViewOrders}
                    >
                        <ShoppingBag className="w-4 h-4" />
                        {t("products.actions.viewOrders")}
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator className="h-px bg-[var(--card-border)] my-1" />

                    {/* Duplicate */}
                    {onDuplicate && !product.is_archived && (
                        <DropdownMenu.Item
                            className={cn(itemClasses, "text-foreground")}
                            onSelect={onDuplicate}
                        >
                            <Copy className="w-4 h-4" />
                            {t("products.actions.duplicate")}
                        </DropdownMenu.Item>
                    )}

                    <DropdownMenu.Separator className="h-px bg-[var(--card-border)] my-1" />

                    {/* Archive / Restore with inline confirmation */}
                    {product.is_archived && onRestore ? (
                        <DropdownMenu.Item
                            className={cn(itemClasses, "text-green-600")}
                            onSelect={onRestore}
                        >
                            <ArchiveRestore className="w-4 h-4" />
                            {t("products.actions.restore")}
                        </DropdownMenu.Item>
                    ) : confirmingArchive ? (
                        <DropdownMenu.Item
                            className={cn(
                                itemClasses,
                                "text-amber-600 bg-amber-50 dark:bg-amber-950/30 data-[highlighted]:bg-amber-100 dark:data-[highlighted]:bg-amber-950/50"
                            )}
                            onSelect={(e) => {
                                e.preventDefault();
                                onArchive();
                                setConfirmingArchive(false);
                            }}
                        >
                            <AlertTriangle className="w-4 h-4" />
                            {t("products.actions.confirmArchive")}
                        </DropdownMenu.Item>
                    ) : (
                        <DropdownMenu.Item
                            className={cn(itemClasses, "text-amber-600")}
                            onSelect={(e) => {
                                e.preventDefault();
                                setConfirmingArchive(true);
                            }}
                        >
                            <Archive className="w-4 h-4" />
                            {t("products.actions.archive")}
                        </DropdownMenu.Item>
                    )}

                    {/* Delete with inline confirmation (available regardless of archive state) */}
                    {onDelete && (
                        <>
                            {confirmingDelete ? (
                                <DropdownMenu.Item
                                    className={cn(
                                        itemClasses,
                                        "text-rose-600 bg-rose-50 dark:bg-rose-950/30 data-[highlighted]:bg-rose-100 dark:data-[highlighted]:bg-rose-950/50"
                                    )}
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        onDelete();
                                        setConfirmingDelete(false);
                                    }}
                                >
                                    <AlertTriangle className="w-4 h-4" />
                                    <div>
                                        <div>{t("products.actions.confirmDelete")}</div>
                                        <div className="text-[10px] opacity-70">
                                            {t("products.actions.deleteWarning")}
                                        </div>
                                    </div>
                                </DropdownMenu.Item>
                            ) : (
                                <DropdownMenu.Item
                                    className={cn(itemClasses, "text-rose-600")}
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        setConfirmingDelete(true);
                                    }}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {t("products.actions.deletePermanently")}
                                </DropdownMenu.Item>
                            )}
                        </>
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
