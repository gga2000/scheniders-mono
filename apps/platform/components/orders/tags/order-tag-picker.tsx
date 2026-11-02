"use client";

import { useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { Check, Pencil, Plus, Tag } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { useToast } from "@/hooks/use-toast";
import { useOrderTagMutations, useOrderTags, useSetOrderTags } from "@/hooks/use-order-tags";
import { PERMISSIONS } from "@/lib/permissions";
import {
    ORDER_TAG_COLORS,
    ORDER_TAG_NAME_MAX,
    ORDER_TAG_SWATCH,
    cleanTagName,
    nextTagColor,
    tagsOf,
    toggleTagId,
    type OrderTag,
    type TagColor,
} from "@/lib/orders/order-tags";
import type { Order } from "@/types/order";
import { OrderTagChip } from "./order-tag-chip";

// The card and the table row open the order on click; the picker's clicks,
// including those inside its portal, stay with the picker.
const stop = (e: SyntheticEvent) => e.stopPropagation();

interface OrderTagPickerProps {
    order: Pick<Order, "id" | "tag_ids">;
    /** Table cell: at most two chips, then "+n". */
    compact?: boolean;
    className?: string;
}

/** An order's named tags, with a picker to add, remove, create and manage them. */
export function OrderTagPicker({ order, compact = false, className }: OrderTagPickerProps) {
    const { t } = useLanguage();
    const { tags } = useOrderTags();
    const { can } = usePermission();
    const [open, setOpen] = useState(false);
    const own = tagsOf(order.tag_ids, tags);
    const shown = compact ? own.slice(0, 2) : own;
    const more = own.length - shown.length;

    const chips = shown.map((tag) => <OrderTagChip key={tag.id} tag={tag} />);
    if (!can(PERMISSIONS.EDIT_ORDERS)) {
        return own.length > 0 ? <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>{chips}</span> : null;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    onClick={stop}
                    onDoubleClick={stop}
                    aria-label={t("orders.tags.edit")}
                    title={own.length > 0 ? own.map((x) => x.name).join(", ") : t("orders.tags.add")}
                    className={cn("group inline-flex flex-wrap items-center gap-1 rounded-full text-start", className)}
                >
                    {chips}
                    {more > 0 && <span className="text-[11px] font-bold text-muted">+{more}</span>}
                    {own.length === 0 ? (
                        <span className="inline-flex h-6 items-center gap-1 px-2 rounded-full border border-dashed border-gray-300 text-[11px] font-semibold text-muted group-hover:border-gray-400 group-hover:text-foreground dark:border-white/20">
                            <Tag className="w-3 h-3" aria-hidden="true" />
                            {!compact && t("orders.tags.add")}
                        </span>
                    ) : (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                collisionPadding={16}
                className="w-64 p-0 rounded-xl overflow-hidden shadow-xl z-[9999] dark:bg-gray-900"
                onClick={stop}
                onDoubleClick={stop}
                onContextMenu={stop}
            >
                {open && <TagPanel orderId={order.id} current={order.tag_ids ?? []} tags={tags} />}
            </PopoverContent>
        </Popover>
    );
}

function TagPanel({ orderId, current, tags }: { orderId: string; current: string[]; tags: readonly OrderTag[] }) {
    const { t } = useLanguage();
    const { toast } = useToast();
    const setOrderTags = useSetOrderTags();
    const { create } = useOrderTagMutations();
    const [query, setQuery] = useState("");
    const [pickedColor, setPickedColor] = useState<TagColor | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    const fail = (err: unknown) =>
        toast({ variant: "error", title: t("orders.tags.saveFailed"), description: err instanceof Error ? err.message : undefined });

    const toggle = (tagId: string) =>
        setOrderTags.mutate({ orderId, tagIds: toggleTagId(current, tagId), previous: current }, { onError: fail });

    const needle = query.trim().toLocaleLowerCase();
    const matches = needle ? tags.filter((x) => x.name.toLocaleLowerCase().includes(needle)) : tags;
    const newName = cleanTagName(query, tags);
    const newColor = pickedColor ?? nextTagColor(tags);

    const createAndAdd = () => {
        if (!newName || create.isPending) return;
        create.mutate(
            { name: newName, color: newColor },
            {
                onSuccess: (tag) => {
                    setQuery("");
                    setPickedColor(null);
                    setOrderTags.mutate({ orderId, tagIds: [...current, tag.id], previous: current }, { onError: fail });
                },
                onError: fail,
            },
        );
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (matches.length === 1 && matches[0].name.toLocaleLowerCase() === needle) toggle(matches[0].id);
        else if (newName) createAndAdd();
        else if (matches.length === 1) toggle(matches[0].id);
    };

    return (
        <div className="flex flex-col">
            <div className="p-2 border-b border-gray-100 dark:border-white/10">
                <input
                    autoFocus
                    value={query}
                    maxLength={ORDER_TAG_NAME_MAX}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={t("orders.tags.search")}
                    aria-label={t("orders.tags.search")}
                    className="w-full h-8 px-2.5 rounded-lg bg-gray-50 border border-gray-200 text-sm outline-none focus:border-primary/50 focus:bg-background dark:bg-white/5 dark:border-white/10"
                />
            </div>

            <ul className="max-h-60 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
                {matches.map((tag) =>
                    editingId === tag.id ? (
                        <li key={tag.id}>
                            <TagEditor tag={tag} tags={tags} onDone={() => setEditingId(null)} onError={fail} />
                        </li>
                    ) : (
                        <li key={tag.id} className="group/row flex items-center">
                            <button
                                type="button"
                                role="option"
                                aria-selected={current.includes(tag.id)}
                                onClick={() => toggle(tag.id)}
                                className="flex flex-1 min-w-0 items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                            >
                                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", ORDER_TAG_SWATCH[tag.color])} aria-hidden="true" />
                                <span className="flex-1 truncate text-start">{tag.name}</span>
                                {current.includes(tag.id) && <Check className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditingId(tag.id)}
                                aria-label={t("orders.tags.editTag", { name: tag.name })}
                                title={t("orders.tags.editTag", { name: tag.name })}
                                className="me-1 p-1.5 rounded-md text-muted opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:bg-gray-100 hover:text-foreground dark:hover:bg-white/10"
                            >
                                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                        </li>
                    ),
                )}
                {tags.length === 0 && !newName && (
                    <li className="px-3 py-3 text-xs text-muted">{t("orders.tags.empty")}</li>
                )}
            </ul>

            {newName && (
                <div className="border-t border-gray-100 p-2 dark:border-white/10">
                    <SwatchRow value={newColor} onChange={setPickedColor} />
                    <button
                        type="button"
                        onClick={createAndAdd}
                        disabled={create.isPending}
                        className="mt-2 flex w-full items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 dark:hover:bg-white/5"
                    >
                        <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{t("orders.tags.create", { name: newName })}</span>
                    </button>
                </div>
            )}
        </div>
    );
}

function SwatchRow({ value, onChange }: { value: TagColor; onChange: (c: TagColor) => void }) {
    const { t } = useLanguage();
    return (
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t("orders.tags.colour")}>
            {ORDER_TAG_COLORS.map((c) => (
                <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={value === c}
                    aria-label={t(`orders.tags.colour.${c}`)}
                    title={t(`orders.tags.colour.${c}`)}
                    onClick={() => onChange(c)}
                    className={cn(
                        "w-5 h-5 rounded-full transition-transform hover:scale-110",
                        ORDER_TAG_SWATCH[c],
                        value === c && "ring-2 ring-offset-1 ring-primary/60 dark:ring-offset-gray-900",
                    )}
                />
            ))}
        </div>
    );
}

function TagEditor({ tag, tags, onDone, onError }: { tag: OrderTag; tags: readonly OrderTag[]; onDone: () => void; onError: (err: unknown) => void }) {
    const { t } = useLanguage();
    const { update, remove } = useOrderTagMutations();
    const [name, setName] = useState(tag.name);
    const [color, setColor] = useState<TagColor>(tag.color);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const clean = cleanTagName(name, tags, tag.id);
    const busy = update.isPending || remove.isPending;

    const save = () => {
        if (!clean) return;
        if (clean === tag.name && color === tag.color) return onDone();
        update.mutate({ id: tag.id, name: clean, color }, { onSuccess: onDone, onError });
    };

    const del = () => {
        if (!confirmDelete) return setConfirmDelete(true);
        remove.mutate(tag.id, { onSuccess: onDone, onError });
    };

    return (
        <div className="mx-2 my-1 p-2 rounded-lg bg-gray-50 space-y-2 dark:bg-white/5">
            <input
                autoFocus
                value={name}
                maxLength={ORDER_TAG_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        save();
                    }
                }}
                aria-label={t("orders.tags.name")}
                className="w-full h-8 px-2.5 rounded-md bg-background border border-gray-200 text-sm outline-none focus:border-primary/50 dark:border-white/10"
            />
            <SwatchRow value={color} onChange={setColor} />
            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={del}
                    disabled={busy}
                    className={cn(
                        "px-2 py-1 rounded-md text-xs font-semibold disabled:opacity-60",
                        confirmDelete ? "bg-red-600 text-white" : "text-red-600 hover:bg-red-50 dark:hover:bg-red-400/10",
                    )}
                >
                    {confirmDelete ? t("orders.tags.deleteConfirm") : t("orders.tags.delete")}
                </button>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={onDone} className="px-2 py-1 rounded-md text-xs font-semibold text-muted hover:bg-gray-100 dark:hover:bg-white/10">
                        {t("common.cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={!clean || busy}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-primary text-primary-foreground disabled:opacity-50"
                    >
                        {t("orders.tags.save")}
                    </button>
                </div>
            </div>
        </div>
    );
}
