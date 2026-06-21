// apps/platform/components/chat/create-channel-dialog.tsx
"use client";
import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui";
import { Switch } from "@scheniders/ui";
import { useCreateChannel } from "@/hooks/chat/use-conversations";
import { useChatStore } from "@/store/use-chat-store";
import { useLanguage } from "@/components/providers/language-provider";
import { useToast } from "@/hooks/use-toast";

export function CreateChannelDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useLanguage();
    const { toast } = useToast();
    const { setActiveConversation } = useChatStore();
    const createChannel = useCreateChannel();

    const [name, setName] = useState("");
    const [topic, setTopic] = useState("");
    const [isPrivate, setIsPrivate] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setName("");
        setTopic("");
        setIsPrivate(true);
        setError(null);
    };

    const handleOpenChange = (next: boolean) => {
        if (!next) reset();
        onOpenChange(next);
    };

    const handleSubmit = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError(t("chat.channelName", "Name") + " is required");
            return;
        }
        setError(null);
        try {
            const newId = await createChannel.mutateAsync({
                name: trimmedName,
                isPrivate,
                topic: topic.trim() || null,
            });
            setActiveConversation(newId);
            handleOpenChange(false);
            toast({ title: t("chat.newChannel", "New channel"), variant: "success" });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="md:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t("chat.newChannel", "New channel")}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Name */}
                    <div className="space-y-1.5">
                        <label
                            htmlFor="channel-name"
                            className="text-sm font-medium text-foreground/80"
                        >
                            {t("chat.channelName", "Name")}
                        </label>
                        <input
                            id="channel-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleSubmit();
                                }
                            }}
                            placeholder="e.g. general"
                            autoComplete="off"
                            className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                    </div>

                    {/* Topic */}
                    <div className="space-y-1.5">
                        <label
                            htmlFor="channel-topic"
                            className="text-sm font-medium text-foreground/80"
                        >
                            {t("chat.channelTopic", "Topic (optional)")}
                        </label>
                        <input
                            id="channel-topic"
                            type="text"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    void handleSubmit();
                                }
                            }}
                            placeholder={t("chat.channelTopic", "Topic (optional)")}
                            autoComplete="off"
                            className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                    </div>

                    {/* Private toggle */}
                    <div className="flex items-center justify-between rounded-xl border border-(--card-border) bg-(--card-bg) px-3.5 py-2.5">
                        <span className="text-sm font-medium text-foreground/80">
                            {t("chat.private", "Private")}
                        </span>
                        <Switch
                            checked={isPrivate}
                            onCheckedChange={setIsPrivate}
                        />
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
                        disabled={createChannel.isPending || !name.trim()}
                        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {createChannel.isPending
                            ? "…"
                            : t("chat.create", "Create")}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
