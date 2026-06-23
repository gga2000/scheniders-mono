// apps/platform/components/chat/edit-history-dialog.tsx
"use client";
import { History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui";
import { useMessageEdits } from "@/hooks/chat/use-message-edits";
import { useLanguage } from "@/components/providers/language-provider";
import { ChatEmptyState } from "./chat-empty-state";

interface EditHistoryDialogProps {
    /** The message whose edit history to show. Pass null to close. */
    messageId: string | null;
    /** The current (latest) body of the message, always shown at the top. */
    currentBody: string;
    /** Called when the dialog should close. */
    onClose: () => void;
}

export function EditHistoryDialog({ messageId, currentBody, onClose }: EditHistoryDialogProps) {
    const { t } = useLanguage();
    const isOpen = messageId !== null;

    const { data: edits = [], isLoading } = useMessageEdits(messageId, isOpen);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-h-[80vh] overflow-y-auto md:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-4 w-4 text-muted-foreground" />
                        {t("chat.editHistory", "Edit history")}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    {/* Current version — always shown at the top */}
                    <div className="rounded-xl border border-(--card-border) bg-(--card-bg) px-3.5 py-3">
                        <div className="mb-1.5 flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-600 ring-1 ring-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:ring-indigo-800">
                                {t("chat.currentVersion", "Current")}
                            </span>
                        </div>
                        <p className="whitespace-pre-wrap wrap-break-word text-[13px] leading-relaxed text-foreground/90">
                            {currentBody}
                        </p>
                    </div>

                    {/* Edit history — skeleton → edits → empty state */}
                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 2 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="h-20 animate-pulse rounded-xl bg-foreground/5"
                                    style={{ animationDelay: `${i * 60}ms` }}
                                />
                            ))}
                        </div>
                    ) : edits.length === 0 ? (
                        <ChatEmptyState
                            icon={History}
                            title={t("chat.noEditHistory", "No earlier versions")}
                            description={t("chat.noEditHistoryDesc", "This message hasn't been edited.")}
                        />
                    ) : (
                        <ul className="space-y-3">
                            {edits.map((edit) => (
                                <li key={edit.id} className="rounded-xl border border-(--card-border) bg-foreground/2 px-3.5 py-3">
                                    <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                                        {formatDistanceToNow(new Date(edit.edited_at), { addSuffix: true })}
                                    </p>
                                    <p className="whitespace-pre-wrap wrap-break-word text-[13px] leading-relaxed text-foreground/70 line-through decoration-muted-foreground/40">
                                        {edit.prev_body}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
