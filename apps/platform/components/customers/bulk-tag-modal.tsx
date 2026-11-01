"use client";

import { useEffect, useState } from "react";
import { Tag as TagIcon, Search, Plus, Loader2, Info } from "lucide-react";
import { useCustomerTags } from "@/hooks/use-customer-management";
import { tagNameMatchesRating } from "@/lib/customer-reliability";
import { CustomerTagChip } from "@/components/customers/customer-tag-chip";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { ModalShell } from "@/components/customers/modals/modal-shell";

interface BulkTagModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (tagIds: string[]) => Promise<boolean>;
    selectedCount: number;
    isLoading?: boolean;
}

export function BulkTagModal({ isOpen, onClose, onConfirm, selectedCount, isLoading }: BulkTagModalProps) {
    const { t } = useLanguage();
    const { tags, createTag } = useCustomerTags();
    const [search, setSearch] = useState("");
    const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setSearch("");
            setSelectedTagIds(new Set());
        }
    }, [isOpen]);

    const filteredTags = tags.filter((t) =>
        t.name.toLowerCase().includes(search.toLowerCase())
    );
    const newTagName = search.trim();
    const canCreate = newTagName.length > 0 && !tags.some((tag) => tag.name.trim().toLowerCase() === newTagName.toLowerCase());
    // A tag named "VIP" or "Blocked" changes neither the rating nor its saved view: say so before it is made.
    const clashesWithRating = canCreate && tagNameMatchesRating(newTagName);

    // Same create-and-pick the customer drawer offers, so a store with no
    // tags yet can tag a selection without leaving the list.
    const handleCreate = async () => {
        if (!canCreate || creating) return;
        setCreating(true);
        const created = await createTag(newTagName, "blue");
        setCreating(false);
        if (!created) {
            toast({ variant: "error", title: t("customers.bulkTag.createFailed") });
            return;
        }
        setSelectedTagIds((prev) => new Set(prev).add(created.id));
        setSearch("");
    };

    const toggleTag = (id: string) => {
        const next = new Set(selectedTagIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedTagIds(next);
    };

    const handleConfirm = async () => {
        if (selectedTagIds.size === 0) return;
        const applied = await onConfirm(Array.from(selectedTagIds));
        if (applied) setSelectedTagIds(new Set());
    };

    return (
        <ModalShell
            isOpen={isOpen}
            onClose={onClose}
            title={t("customers.bulkTag.title")}
            icon={<TagIcon className="w-5 h-5 text-foreground" />}
            description={t("customers.bulkTag.subtitle", { count: selectedCount.toLocaleString("en-US") })}
            maxWidth="max-w-md"
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="flex-1 h-11 px-4 bg-(--card-bg) border border-(--card-border) text-muted-foreground hover:text-foreground hover:bg-muted/30 font-semibold rounded-xl transition-colors"
                        disabled={isLoading}
                    >
                        {t("customers.bulk.cancel")}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedTagIds.size === 0 || isLoading}
                        className="flex-1 h-11 px-4 bg-foreground text-background font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            t("customers.bulkTag.apply", { count: String(selectedTagIds.size) })
                        )}
                    </button>
                </>
            }
        >
            {/* Search Input */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    type="text"
                    placeholder={t("customers.bulkTag.search")}
                    aria-label={t("customers.bulkTag.search")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 bg-background border border-(--card-border) rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                />
            </div>

            {/* Tag List */}
            <div className="max-h-60 overflow-y-auto pr-1 space-y-1.5">
                {canCreate && (
                    <button
                        onClick={handleCreate}
                        disabled={creating}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-(--card-border) hover:border-foreground/40 bg-background text-left text-sm font-medium transition-colors disabled:opacity-60"
                    >
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {t("customers.bulkTag.create", { name: newTagName })}
                    </button>
                )}
                {clashesWithRating && (
                    <p role="status" className="flex items-start gap-2 px-3 py-2 rounded-xl bg-muted/40 text-xs text-muted-foreground">
                        <Info className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden />
                        <span dir="auto">{t("customers.tag.ratingClash", { name: newTagName })}</span>
                    </p>
                )}
                {filteredTags.length === 0 ? (
                    !canCreate && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                            {t("customers.bulkTag.empty")}
                        </div>
                    )
                ) : (
                    filteredTags.map((tag) => {
                        const isSelected = selectedTagIds.has(tag.id);
                        return (
                            <button
                                key={tag.id}
                                onClick={() => toggleTag(tag.id)}
                                aria-pressed={isSelected}
                                className={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left",
                                    // Only a checked row is filled, so "filled" still means "selected".
                                    isSelected ? "border-foreground bg-background" : "border-transparent hover:bg-muted/20",
                                )}
                            >
                                <span className={cn(
                                    "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                                    isSelected ? "bg-foreground border-foreground" : "border-muted-foreground/40",
                                )}>
                                    {isSelected && <span className="w-2 h-2 bg-background rounded-full" />}
                                </span>
                                <CustomerTagChip name={tag.name} color={tag.color} />
                            </button>
                        );
                    })
                )}
            </div>
        </ModalShell>
    );
}
