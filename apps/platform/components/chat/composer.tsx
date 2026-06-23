// apps/platform/components/chat/composer.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CornerUpLeft, FileText, Paperclip, Send, Smile, X } from "lucide-react";
import { Textarea } from "@scheniders/ui/textarea";
import { Button } from "@scheniders/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";
import { useReferenceSearch } from "@/hooks/chat/use-reference-search";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { useChatStore } from "@/store/use-chat-store";
import { ChatAvatar } from "./chat-avatar";
import type { ChatReference, ChatAttachment } from "@/types/chat";

const QUICK_EMOJIS = ["👍", "🔥", "✅", "❤️", "😂", "🙏", "👏", "🎉"] as const;
const MAX_MENTION_RESULTS = 6;
// Mirror the chat-attachments storage bucket limits so we fail fast in the UI
// instead of opaquely deep inside the upload.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
// Unicode-aware token matchers: the app serves an Arabic market, so `\w` (ASCII
// only) would never open the #/@ autocomplete for Arabic input.
const REF_TOKEN = /#([\p{L}\p{N}_]*)$/u;
const MENTION_TOKEN = /@([\p{L}\p{N}_]*)$/u;
// Draft write debounce — avoids thrashing localStorage on every keystroke.
const DRAFT_DEBOUNCE_MS = 400;

/** A pending attachment paired with an object URL for image previews. */
interface PendingFile {
    file: File;
    previewUrl: string | null;
}

export function Composer({
    conversationId,
    onSend,
    onTyping,
}: {
    conversationId: string;
    onSend: (a: {
        body: string;
        references: ChatReference[];
        mentions: string[];
        attachments: ChatAttachment[];
        clientMsgId: string;
        replyToId: string | null;
    }) => void | Promise<unknown>;
    onTyping: () => void;
}) {
    const { user, tenantId } = useAuth();
    const { t } = useLanguage();

    const { drafts, setDraft, clearDraft, replyToId, setReplyTo } = useChatStore();

    const [body, setBody] = useState(() => drafts[conversationId] ?? "");
    const [refs, setRefs] = useState<ChatReference[]>([]);
    const [mentions, setMentions] = useState<string[]>([]);
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);

    // Only one autocomplete (# references OR @ mentions) is active at a time,
    // determined by which trailing token the caret is currently sitting on.
    const [refQuery, setRefQuery] = useState<string | null>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);

    const fileRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const refResults = useReferenceSearch(refQuery ?? "");
    const { data: members = [] } = useTenantMembers();

    // Member map for resolving the reply-to sender name in the chip.
    const memberMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of members) map.set(m.user_id, m.display_name);
        return map;
    }, [members]);

    const mentionResults = useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.trim().toLowerCase();
        return members
            .filter((m) => m.user_id !== user?.id)
            .filter((m) => (q === "" ? true : m.display_name.toLowerCase().includes(q)))
            .slice(0, MAX_MENTION_RESULTS);
    }, [members, mentionQuery, user?.id]);

    // Seed textarea from the persisted draft when the active conversation changes.
    // Clear reply-to on conversation switch so stale reply state doesn't carry over.
    useEffect(() => {
        setBody(drafts[conversationId] ?? "");
        setRefs([]);
        setMentions([]);
        setRefQuery(null);
        setMentionQuery(null);
        setReplyTo(null);
        textareaRef.current?.focus();
    // conversationId is the only dep that should trigger a reset
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId]);

    // Revoke any outstanding object URLs when the pending list changes out from
    // under us or the component unmounts, so we don't leak blob handles.
    useEffect(() => {
        return () => {
            for (const pf of pendingFiles) {
                if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
            }
        };
    }, [pendingFiles]);

    /** Write the draft to the store after a debounce delay. */
    const scheduleDraftWrite = useCallback(
        (conversationId: string, text: string) => {
            if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
            draftTimerRef.current = setTimeout(() => {
                if (text) {
                    setDraft(conversationId, text);
                } else {
                    clearDraft(conversationId);
                }
            }, DRAFT_DEBOUNCE_MS);
        },
        [setDraft, clearDraft]
    );

    /** Recompute which (if any) trailing token autocomplete should be shown. */
    const syncTokens = (value: string) => {
        const refMatch = value.match(REF_TOKEN);
        const mentionMatch = value.match(MENTION_TOKEN);
        if (refMatch) {
            setRefQuery(refMatch[1]);
            setMentionQuery(null);
        } else if (mentionMatch) {
            setMentionQuery(mentionMatch[1]);
            setRefQuery(null);
        } else {
            setRefQuery(null);
            setMentionQuery(null);
        }
    };

    const onTextChange = (value: string) => {
        setBody(value);
        onTyping();
        syncTokens(value);
        scheduleDraftWrite(conversationId, value);
    };

    const selectReference = (r: (typeof refResults)[number]) => {
        setRefs((prev) =>
            prev.some((p) => p.ref_type === r.ref_type && p.ref_id === r.ref_id)
                ? prev
                : [...prev, { ref_type: r.ref_type, ref_id: r.ref_id, snapshot: r.snapshot }],
        );
        setBody((b) => b.replace(REF_TOKEN, ""));
        setRefQuery(null);
        textareaRef.current?.focus();
    };

    const selectMention = (m: (typeof mentionResults)[number]) => {
        setMentions((prev) => (prev.includes(m.user_id) ? prev : [...prev, m.user_id]));
        // Replace the trailing @token with a readable, space-terminated handle.
        setBody((b) => b.replace(MENTION_TOKEN, `@${m.display_name} `));
        setMentionQuery(null);
        textareaRef.current?.focus();
    };

    const removeReference = (index: number) => {
        setRefs((prev) => prev.filter((_, i) => i !== index));
    };

    const removeMention = (userId: string) => {
        setMentions((prev) => prev.filter((id) => id !== userId));
    };

    const addFiles = (files: FileList | null) => {
        if (!files) return;
        // Validate up-front (size + type) so drag/paste — which bypass the input's
        // `accept` hint — can't reach the upload and fail opaquely.
        const accepted: PendingFile[] = [];
        for (const file of Array.from(files)) {
            if (file.size > MAX_FILE_BYTES) {
                toast.error(t("chat.fileTooLarge", "File too large (max 10 MB)"), file.name);
                continue;
            }
            if (file.type && !ALLOWED_MIME.has(file.type)) {
                toast.error(t("chat.fileType", "Unsupported file type"), file.name);
                continue;
            }
            accepted.push({
                file,
                previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
            });
        }
        if (accepted.length) setPendingFiles((prev) => [...prev, ...accepted]);
        // Allow re-selecting the same file later.
        if (fileRef.current) fileRef.current.value = "";
    };

    const removeFile = (index: number) => {
        setPendingFiles((prev) => {
            const target = prev[index];
            if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
            return prev.filter((_, i) => i !== index);
        });
    };

    const appendEmoji = (emoji: string) => {
        setBody((b) => b + emoji);
        setEmojiOpen(false);
        textareaRef.current?.focus();
    };

    const uploadAll = async (): Promise<ChatAttachment[]> => {
        if (!tenantId) return [];
        const out: ChatAttachment[] = [];
        for (const { file } of pendingFiles) {
            const path = `${tenantId}/${conversationId}/${crypto.randomUUID()}-${file.name}`;
            const { error } = await supabase.storage.from("chat-attachments").upload(path, file);
            if (error) throw error;
            out.push({
                storage_path: path,
                file_name: file.name,
                mime: file.type || null,
                size_bytes: file.size,
            });
        }
        return out;
    };

    const submit = async () => {
        const text = body.trim();
        if ((!text && pendingFiles.length === 0) || isUploading) return;
        if (!tenantId || !user) return;

        // Capture replyToId before clearing it
        const currentReplyToId = replyToId;

        setIsUploading(true);
        let uploaded: ChatAttachment[] = [];
        try {
            uploaded = await uploadAll();
            // Await the send so a failure is observable here — only THEN clear the
            // composer. Previously this was fire-and-forget, so a failed send wiped
            // the user's text + attachments with no feedback.
            await onSend({
                body: text,
                references: refs,
                mentions,
                attachments: uploaded,
                clientMsgId: crypto.randomUUID(),
                replyToId: currentReplyToId,
            });
            // Success: clear previews before dropping the list (effect cleanup also guards).
            for (const pf of pendingFiles) {
                if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
            }
            setBody("");
            setRefs([]);
            setMentions([]);
            setPendingFiles([]);
            setRefQuery(null);
            setMentionQuery(null);
            setReplyTo(null);
            // Clear the persisted draft on successful send
            clearDraft(conversationId);
            // Cancel any pending draft write
            if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        } catch {
            // Roll back orphaned storage objects from this failed attempt and keep the
            // user's input so they can retry.
            if (uploaded.length > 0) {
                void supabase.storage.from("chat-attachments").remove(uploaded.map((a) => a.storage_path));
            }
            toast.error(t("chat.sendFailed", "Couldn't send your message. Try again."));
        } finally {
            setIsUploading(false);
        }
    };

    const showRefDropdown = refQuery !== null && refResults.length > 0;
    const showMentionDropdown = mentionQuery !== null && mentionResults.length > 0;
    const canSend = (body.trim().length > 0 || pendingFiles.length > 0) && !isUploading;

    return (
        <div
            className="relative border-t border-(--card-border) bg-(--card-bg) p-2"
            style={{ paddingBottom: "calc(0.5rem + var(--safe-area-bottom, 0px))" }}
        >
            {/* Reply-to chip: shown when the user has clicked "Reply" on a message */}
            {replyToId && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-indigo-400 bg-indigo-50/60 px-2.5 py-1.5"
                >
                    <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-indigo-700">
                        <span className="font-semibold">{t("chat.replyingTo", "Replying to")}</span>{" "}
                        {memberMap.get(
                            // We don't have the parent message here — the chip just shows the label;
                            // the full preview lives in message-item's QuotePreview
                            ""
                        ) ?? ""}
                    </span>
                    <button
                        type="button"
                        aria-label={t("chat.cancelReply", "Cancel reply")}
                        onClick={() => setReplyTo(null)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-indigo-500 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </motion.div>
            )}

            {/* Selected reference + mention chips */}
            {(refs.length > 0 || mentions.length > 0) && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {refs.map((r, i) => (
                        <motion.span
                            key={`ref-${r.ref_type}-${r.ref_id}-${i}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 py-1 pl-2.5 pr-1 text-xs font-semibold text-amber-800"
                        >
                            #{String(r.snapshot.order_id ?? r.ref_id)}
                            <button
                                type="button"
                                aria-label={t("chat.composer.removeReference", "Remove reference")}
                                className="flex h-4 w-4 items-center justify-center rounded-full text-amber-800/70 transition-colors hover:bg-amber-200 hover:text-amber-900"
                                onClick={() => removeReference(i)}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </motion.span>
                    ))}
                    {mentions.map((userId) => {
                        const m = members.find((mem) => mem.user_id === userId);
                        return (
                            <motion.span
                                key={`mention-${userId}`}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="inline-flex items-center gap-1 rounded-full bg-indigo-100 py-1 pl-2.5 pr-1 text-xs font-semibold text-indigo-700"
                            >
                                @{m?.display_name ?? "member"}
                                <button
                                    type="button"
                                    aria-label={t("chat.composer.removeMention", "Remove mention")}
                                    className="flex h-4 w-4 items-center justify-center rounded-full text-indigo-700/70 transition-colors hover:bg-indigo-200 hover:text-indigo-900"
                                    onClick={() => removeMention(userId)}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </motion.span>
                        );
                    })}
                </div>
            )}

            {/* Pending attachment chips */}
            {pendingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                    {pendingFiles.map((pf, i) => (
                        <motion.div
                            key={`file-${i}-${pf.file.name}`}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center gap-2 rounded-xl border border-(--card-border) bg-(--card-bg) py-1 pl-1 pr-1.5 shadow-sm"
                        >
                            {pf.previewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, not a remote asset
                                <img
                                    src={pf.previewUrl}
                                    alt={pf.file.name}
                                    className="h-9 w-9 rounded-lg object-cover"
                                />
                            ) : (
                                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-muted-foreground">
                                    <FileText className="h-4 w-4" />
                                </span>
                            )}
                            <span className="max-w-[160px] truncate text-xs font-medium text-foreground">{pf.file.name}</span>
                            <button
                                type="button"
                                aria-label={t("chat.composer.removeAttachment", "Remove attachment")}
                                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                                onClick={() => removeFile(i)}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </motion.div>
                    ))}
                </div>
            )}

            <div className="flex items-end gap-2">
                <div className="relative flex-1">
                    <Textarea
                        ref={textareaRef}
                        value={body}
                        onChange={(e) => onTextChange(e.target.value)}
                        onKeyDown={(e) => {
                            // Don't send mid-IME composition (Arabic/other input methods
                            // use Enter to confirm candidates).
                            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                void submit();
                            }
                        }}
                        placeholder={t("chat.composer.placeholder", "Message… use # to reference an order, @ to mention")}
                        rows={1}
                        className="min-h-[44px] max-h-40 resize-none rounded-xl"
                    />

                    {/* Reference autocomplete dropdown */}
                    <AnimatePresence>
                        {showRefDropdown && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 6 }}
                                transition={{ duration: 0.14 }}
                                className="absolute bottom-full left-0 z-10 mb-1.5 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-(--card-border) bg-(--card-bg) p-1 shadow-xl"
                            >
                                {refResults.map((r) => (
                                    <button
                                        key={`${r.ref_type}-${r.ref_id}`}
                                        type="button"
                                        className="block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/5"
                                        onClick={() => selectReference(r)}
                                    >
                                        <span className="font-semibold text-foreground">{r.label}</span>{" "}
                                        <span className="text-muted-foreground">{r.sublabel}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Mention autocomplete dropdown */}
                    <AnimatePresence>
                        {showMentionDropdown && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 6 }}
                                transition={{ duration: 0.14 }}
                                className="absolute bottom-full left-0 z-10 mb-1.5 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-(--card-border) bg-(--card-bg) p-1 shadow-xl"
                            >
                                {mentionResults.map((m) => (
                                    <button
                                        key={m.user_id}
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/5"
                                        onClick={() => selectMention(m)}
                                    >
                                        <ChatAvatar userId={m.user_id} name={m.display_name} avatarUrl={m.avatar_url} size="xs" />
                                        <span className="font-medium text-foreground">{m.display_name}</span>
                                        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                                            {m.role}
                                        </span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Emoji quick-pick menu */}
                    <AnimatePresence>
                        {emojiOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: 6 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: 6 }}
                                transition={{ duration: 0.14 }}
                                className="absolute bottom-full right-0 z-10 mb-1.5 flex gap-0.5 rounded-xl border border-(--card-border) bg-(--card-bg) p-1.5 shadow-xl"
                            >
                                {QUICK_EMOJIS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        aria-label={`${t("chat.composer.insertEmoji", "Insert")} ${emoji}`}
                                        className="rounded-lg px-1.5 py-1 text-lg leading-none transition-transform hover:scale-125 hover:bg-foreground/5"
                                        onClick={() => appendEmoji(emoji)}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <input
                    ref={fileRef}
                    type="file"
                    hidden
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                    onChange={(e) => addFiles(e.target.files)}
                />

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("chat.composer.addEmoji", "Add emoji")}
                    onClick={() => setEmojiOpen((o) => !o)}
                    className={emojiOpen ? "text-foreground" : "text-muted-foreground"}
                >
                    <Smile className="h-5 w-5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("chat.composer.attachFile", "Attach file")}
                    onClick={() => fileRef.current?.click()}
                    className="text-muted-foreground"
                >
                    <Paperclip className="h-5 w-5" />
                </Button>
                <Button
                    type="button"
                    size="md"
                    isLoading={isUploading}
                    disabled={!canSend}
                    onClick={() => void submit()}
                    className="gap-1.5"
                >
                    {!isUploading && <Send className="h-4 w-4" />}
                    {isUploading ? t("chat.composer.sending", "Sending…") : t("chat.composer.send", "Send")}
                </Button>
            </div>
        </div>
    );
}
