"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

interface QuickActionsMenuProps {
    product: Product;
    onEdit: () => void;
    onArchive: () => void;
    onRestore?: () => void;
    onViewDetails: () => void;
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
    onDuplicate,
    onDelete,
    open,
    onOpenChange,
}: QuickActionsMenuProps) {
    const { t } = useLanguage();
    const router = useRouter();
    // Editing is for products.edit; everyone else sees the product, not the buttons.
    const canEdit = usePermission().can(PERMISSIONS.EDIT_PRODUCTS);
    const [confirmingArchive, setConfirmingArchive] = useState(false);

    const handleOpenChange = (next: boolean) => {
        if (!next) {
            setConfirmingArchive(false);
        }
        onOpenChange?.(next);
    };

    return (
        <DropdownMenu.Root
            open={open}
            onOpenChange={handleOpenChange}
        >
            <DropdownMenu.Trigger asChild>
                <Tooltip content={t("products.actions.menuTooltip")} side="top" align="center">
                    <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)] min-w-[44px] min-h-[44px] flex items-center justify-center"
                        aria-label="Product actions"
                    >
                        <MoreVertical className="w-4 h-4 text-muted" />
                    </button>
                </Tooltip>
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
                    {canEdit && (
                        <DropdownMenu.Item
                            className={cn(itemClasses, "text-foreground")}
                            onSelect={onEdit}
                        >
                            <Edit className="w-4 h-4" />
                            {t("products.actions.editProduct")}
                        </DropdownMenu.Item>
                    )}

                    {/* View Orders */}
                    <DropdownMenu.Item
                        className={cn(itemClasses, "text-foreground")}
                        onSelect={() => router.push(`/orders?product=${encodeURIComponent(product.name)}`)}
                    >
                        <ShoppingBag className="w-4 h-4" />
                        {t("products.actions.viewOrders")}
                    </DropdownMenu.Item>

                    <DropdownMenu.Separator className="h-px bg-[var(--card-border)] my-1" />

                    {/* Duplicate */}
                    {canEdit && onDuplicate && !product.is_archived && (
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
                    {!canEdit ? null : product.is_archived && onRestore ? (
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

                    {/* Delete opens the impact dialog, which offers Archive instead. */}
                    {onDelete && (
                        <DropdownMenu.Item
                            className={cn(itemClasses, "text-rose-600")}
                            onSelect={() => onDelete()}
                        >
                            <Trash2 className="w-4 h-4" />
                            {t("products.actions.deletePermanently")}
                        </DropdownMenu.Item>
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
