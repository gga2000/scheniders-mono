// apps/platform/components/chat/create-group-dialog.tsx
"use client";
import { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui";
import { useCreateGroup } from "@/hooks/chat/use-conversations";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { useChatStore } from "@/store/use-chat-store";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/hooks/use-toast";
import { ChatAvatar } from "./chat-avatar";
import { Check } from "lucide-react";

export function CreateGroupDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useLanguage();
    const { toast } = useToast();
    const { user } = useAuth();
    const { setActiveConversation } = useChatStore();
    const createGroup = useCreateGroup();
    const { data: allMembers = [] } = useTenantMembers();

    const [name, setName] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    // Exclude current user from the member list
    const teammates = useMemo(
        () => allMembers.filter((m) => m.user_id !== user?.id),
        [allMembers, user?.id]
    );

    const reset = () => {
        setName("");
        setSelectedIds(new Set());
        setError(null);
    };

    const handleOpenChange = (next: boolean) => {
        if (!next) reset();
        onOpenChange(next);
    };

    const toggleMember = (userId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
            } else {
                next.add(userId);
            }
            return next;
        });
    };

    const handleSubmit = async () => {
        const trimmedName = name.trim();
        setError(null);
        try {
            const newId = await createGroup.mutateAsync({
                name: trimmedName,
                userIds: Array.from(selectedIds),
            });
            setActiveConversation(newId);
            handleOpenChange(false);
            toast({ title: t("chat.newGroup", "New group"), variant: "success" });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="md:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("chat.newGroup", "New group")}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Name */}
                    <div className="space-y-1.5">
                        <label
                            htmlFor="group-name"
                            className="text-sm font-medium text-foreground/80"
                        >
                            {t("chat.channelName", "Name")}
                        </label>
                        <input
                            id="group-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t("chat.newGroup", "New group")}
                            autoComplete="off"
                            className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                    </div>

                    {/* Teammate multi-select */}
                    <div className="space-y-1.5">
                        <p className="text-sm font-medium text-foreground/80">
                            {t("chat.selectMembers", "Select teammates")}
                            {selectedIds.size > 0 && (
                                <span className="ml-1.5 text-xs text-primary">
                                    ({selectedIds.size})
                                </span>
                            )}
                        </p>
                        <div className="max-h-52 overflow-y-auto overscroll-contain rounded-xl border border-(--card-border) bg-(--card-bg)">
                            {teammates.length === 0 ? (
                                <p className="px-4 py-3 text-sm text-muted-foreground">
                                    {t("chat.emptyTeam", "You're the only member of this workspace so far.")}
                                </p>
                            ) : (
                                teammates.map((m) => {
                                    const selected = selectedIds.has(m.user_id);
                                    return (
                                        <button
                                            key={m.user_id}
                                            type="button"
                                            onClick={() => toggleMember(m.user_id)}
                                            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/5 ${selected ? "bg-primary/5" : ""}`}
                                        >
                                            <ChatAvatar
                                                userId={m.user_id}
                                                name={m.display_name}
                                                avatarUrl={m.avatar_url}
                                                size="sm"
                                            />
                                            <span className="min-w-0 flex-1 truncate text-foreground">
                                                {m.display_name}
                                            </span>
                                            {selected && (
                                                <Check className="h-4 w-4 shrink-0 text-primary" />
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Inline error */}
                    {error && (
                        <p className="text-sm text-red-500">{error}</p>
                    )}
                </div>

                <DialogFooter>
                    <button
                        type="button"
                        onClick={() => handleOpenChange(false)}
                        className="inline-flex h-9 items-center justify-center rounded-md border border-(--card-border) bg-(--card-bg) px-3 text-sm font-medium text-foreground/80 hover:text-foreground"
                    >
                        {t("chat.cancel", "Cancel")}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={createGroup.isPending}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {createGroup.isPending
                            ? "…"
                            : t("chat.create", "Create")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
