// apps/platform/components/chat/composer.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bold, Check, ChevronDown, CornerUpLeft, FileText, Italic, Link2, Paperclip, Send, Smile, UserPlus, X } from "lucide-react";
import { Textarea } from "@scheniders/ui/textarea";
import { Button } from "@scheniders/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/components/providers/language-provider";
import { useReferenceSearch } from "@/hooks/chat/use-reference-search";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { chatKeys, useConversations } from "@/hooks/chat/use-conversations";
import { useAssignOrder } from "@/hooks/chat/use-order-actions";
import { useUpdateStatusMutation } from "@/hooks/use-orders-query";
import { useChatStore } from "@/store/use-chat-store";
import { parseSlash, slashCommandsFor } from "@/lib/chat/slash-commands";
import { PIPELINE_STAGE_IDS, PIPELINE_STAGE_REGISTRY } from "@/lib/order-pipeline";
import { EmojiPicker, recordFrequent } from "./emoji-picker";
import { VoiceRecorder } from "./voice-recorder";
import { ChatAvatar } from "./chat-avatar";
import type { ChatReference, ChatAttachment, ChatMessage } from "@/types/chat";
import type { OrderStatus } from "@/types/order";
import type { PipelineStageId } from "@/lib/order-pipeline";
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

    // Only one autocomplete (# references OR @ mentions OR / commands) is active at a time,
    // determined by which trailing token the caret is currently sitting on.
    const [refQuery, setRefQuery] = useState<string | null>(null);
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    // Slash-command menu: non-null when body starts with "/"
    const [slashQuery, setSlashQuery] = useState<string | null>(null);
    // Sub-menus for /assign and /status
    const [slashAssignOpen, setSlashAssignOpen] = useState(false);
    const [slashStatusOpen, setSlashStatusOpen] = useState(false);

    const fileRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const refResults = useReferenceSearch(refQuery ?? "");
    const { data: members = [] } = useTenantMembers();
    const { data: conversations = [] } = useConversations();
    const { toast: toastHook } = useToast();
    const assignOrder = useAssignOrder();
    const updateStatus = useUpdateStatusMutation();
    const { profile } = useAuth();

    // Resolve the active conversation's kind + order_id for slash command gating.
    const activeConv = useMemo(
        () => conversations.find((c) => c.id === conversationId) ?? null,
        [conversations, conversationId]
    );
    const convKind = activeConv?.kind ?? "channel";
    const convOrderId = activeConv?.order_id ?? null;

    // Member map for resolving the reply-to sender name in the chip.
    const memberMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const m of members) map.set(m.user_id, m.display_name);
        return map;
    }, [members]);

    // Resolve the message being replied to (for the chip preview) from the cached
    // message window — the full quoted preview also renders in the timeline.
    const qc = useQueryClient();
    const replyParent = useMemo<ChatMessage | null>(() => {
        if (!replyToId) return null;
        const msgs = qc.getQueryData<ChatMessage[]>(chatKeys.messages(conversationId)) ?? [];
        return msgs.find((m) => m.id === replyToId) ?? null;
    }, [replyToId, conversationId, qc]);

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
        setSlashQuery(null);
        setSlashAssignOpen(false);
        setSlashStatusOpen(false);
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
        // Slash menu: active when the entire body starts with "/" (no other text before it)
        const parsed = parseSlash(value);
        if (parsed !== null) {
            setSlashQuery(parsed.name);
            setRefQuery(null);
            setMentionQuery(null);
            return;
        }
        setSlashQuery(null);

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

    /**
     * Accept a recorded voice File directly from VoiceRecorder.
     * Audio files (audio/*) are intentionally NOT in ALLOWED_MIME because the
     * file-picker path only supports images + PDF. Voice blobs bypass that
     * check and go directly into the pending queue so they use the same
     * upload path as every other attachment.
     */
    const addVoiceFile = (file: File) => {
        if (file.size > MAX_FILE_BYTES) {
            toast.error(t("chat.fileTooLarge", "File too large (max 10 MB)"), file.name);
            return;
        }
        setPendingFiles((prev) => [...prev, { file, previewUrl: null }]);
    };

    const removeFile = (index: number) => {
        setPendingFiles((prev) => {
            const target = prev[index];
            if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
            return prev.filter((_, i) => i !== index);
        });
    };

    /**
     * Insert an emoji at the current caret position (or append if no focus).
     * Records it as frequently used and closes the picker.
     */
    const insertEmoji = useCallback(
        (emoji: string) => {
            recordFrequent(emoji);
            const el = textareaRef.current;
            let newBody: string;
            if (el) {
                const start = el.selectionStart;
                const end = el.selectionEnd;
                newBody = body.slice(0, start) + emoji + body.slice(end);
                setBody(newBody);
                const caretPos = start + [...emoji].length;
                requestAnimationFrame(() => {
                    el.focus();
                    el.setSelectionRange(caretPos, caretPos);
                });
            } else {
                newBody = body + emoji;
                setBody(newBody);
            }
            setEmojiOpen(false);
            scheduleDraftWrite(conversationId, newBody);
        },
        [body, conversationId, scheduleDraftWrite]
    );

    /**
     * Wrap the current textarea selection with the given prefix/suffix markers.
     * For the link format, prompts for a URL and builds `[text](url)`.
     * Restores focus and positions the caret after the wrapped text.
     */
    const wrapSelection = (kind: "bold" | "italic" | "link") => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const selected = body.slice(start, end);

        let replacement: string;
        let cursorOffset: number;

        if (kind === "link") {
            const url = window.prompt(t("chat.composer.linkUrl", "Enter URL")) ?? "";
            if (!url) {
                el.focus();
                return;
            }
            replacement = `[${selected || t("chat.composer.linkText", "text")}](${url})`;
            cursorOffset = start + replacement.length;
        } else {
            const marker = kind === "bold" ? "**" : "*";
            replacement = `${marker}${selected}${marker}`;
            // Place caret inside the markers when no text was selected
            cursorOffset = selected ? start + replacement.length : start + marker.length;
        }

        const next = body.slice(0, start) + replacement + body.slice(end);
        setBody(next);
        // Restore caret after React re-render via a microtask
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(cursorOffset, cursorOffset);
        });
    };

    /**
     * Handle a slash-command selection from the menu.
     * - shrug: inserts the shrug text and clears the composer body.
     * - order: triggers the existing # reference-search flow by inserting "#"
     *   (which opens the ref autocomplete on the next keystroke).
     * - assign: opens the inline assign sub-menu (order threads only).
     * - status: opens the inline status sub-menu (order threads only).
     */
    const selectSlashCommand = (name: string) => {
        if (name === "shrug") {
            setBody(String.raw`¯\_(ツ)_/¯`);
            setSlashQuery(null);
            textareaRef.current?.focus();
            return;
        }
        if (name === "order") {
            // Reuse the # reference flow: replace body with "#" so syncTokens
            // opens the ref autocomplete immediately.
            setBody("#");
            setSlashQuery(null);
            setRefQuery("");
            textareaRef.current?.focus();
            return;
        }
        if (name === "assign") {
            setSlashAssignOpen(true);
            setSlashStatusOpen(false);
            return;
        }
        if (name === "status") {
            setSlashStatusOpen(true);
            setSlashAssignOpen(false);
            return;
        }
    };

    /** Execute assign from the slash /assign sub-menu. */
    const handleSlashAssign = (userId: string | null) => {
        if (!convOrderId) return;
        setSlashAssignOpen(false);
        setSlashQuery(null);
        setBody("");
        assignOrder.mutate(
            { orderId: convOrderId, userId },
            {
                onError: (err) => {
                    toastHook({
                        title: t("chat.assign", "Assign"),
                        description: err instanceof Error ? err.message : String(err),
                        variant: "error",
                    });
                },
            }
        );
        textareaRef.current?.focus();
    };

    /** Execute status change from the slash /status sub-menu. */
    const handleSlashStatus = (status: OrderStatus) => {
        if (!convOrderId) return;
        setSlashStatusOpen(false);
        setSlashQuery(null);
        setBody("");
        updateStatus.mutate(
            {
                orderId: convOrderId,
                status,
                last_status_changed_by_name: profile?.display_name ?? undefined,
                last_status_changed_by_avatar: profile?.avatar_url ?? undefined,
            },
            {
                onError: (err) => {
                    toastHook({
                        title: t("chat.changeStatus", "Change status"),
                        description: err instanceof Error ? err.message : String(err),
                        variant: "error",
                    });
                },
            }
        );
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
            setSlashQuery(null);
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

    // Slash menu: filter available commands by typed prefix and conversation kind.
    const slashResults = useMemo(() => {
        if (slashQuery === null) return [];
        const q = slashQuery.toLowerCase();
        return slashCommandsFor(convKind).filter((cmd) => cmd.name.startsWith(q));
    }, [slashQuery, convKind]);
    const showSlashDropdown = slashQuery !== null && (slashResults.length > 0 || slashAssignOpen || slashStatusOpen);

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
                        {replyParent
                            ? `${memberMap.get(replyParent.sender_id ?? "") ?? t("chat.teammate", "Teammate")}: ${replyParent.body}`
                            : ""}
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

            {/* Format toolbar: bold, italic, link */}
            <div className="mb-1.5 flex items-center gap-0.5">
                <button
                    type="button"
                    title={t("chat.composer.bold", "Bold")}
                    aria-label={t("chat.composer.bold", "Bold")}
                    onClick={() => wrapSelection("bold")}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                    <Bold className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    title={t("chat.composer.italic", "Italic")}
                    aria-label={t("chat.composer.italic", "Italic")}
                    onClick={() => wrapSelection("italic")}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                    <Italic className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    title={t("chat.composer.link", "Link")}
                    aria-label={t("chat.composer.link", "Link")}
                    onClick={() => wrapSelection("link")}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                    <Link2 className="h-3.5 w-3.5" />
                </button>
            </div>

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

                    {/* Slash-command menu */}
                    <AnimatePresence>
                        {showSlashDropdown && (
                            <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 6 }}
                                transition={{ duration: 0.14 }}
                                className="absolute bottom-full left-0 z-10 mb-1.5 w-full overflow-hidden rounded-xl border border-(--card-border) bg-(--card-bg) p-1 shadow-xl"
                            >
                                {/* Command list — hidden when a sub-menu is active */}
                                {!slashAssignOpen && !slashStatusOpen && slashResults.map((cmd) => (
                                    <button
                                        key={cmd.name}
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-foreground/5"
                                        onClick={() => selectSlashCommand(cmd.name)}
                                    >
                                        <span className="font-semibold text-foreground">/{cmd.name}</span>
                                        <span className="text-muted-foreground">{t(cmd.descriptionKey, cmd.name)}</span>
                                        {(cmd.name === "assign" || cmd.name === "status") && (
                                            <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                                        )}
                                    </button>
                                ))}

                                {/* /assign sub-menu */}
                                {slashAssignOpen && (
                                    <>
                                        <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            {t("chat.assignTo", "Assign to…")}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => handleSlashAssign(null)}
                                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-foreground/5"
                                        >
                                            <UserPlus className="h-3.5 w-3.5 shrink-0" />
                                            {t("chat.unassigned", "Unassigned")}
                                        </button>
                                        {members.map((m) => (
                                            <button
                                                key={m.user_id}
                                                type="button"
                                                onClick={() => handleSlashAssign(m.user_id)}
                                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-foreground hover:bg-foreground/5"
                                            >
                                                <ChatAvatar userId={m.user_id} name={m.display_name} avatarUrl={m.avatar_url} size="sm" />
                                                <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
                                            </button>
                                        ))}
                                    </>
                                )}

                                {/* /status sub-menu */}
                                {slashStatusOpen && (
                                    <>
                                        <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            {t("chat.changeStatus", "Change status")}
                                        </p>
                                        {PIPELINE_STAGE_IDS.map((s) => {
                                            const meta = PIPELINE_STAGE_REGISTRY[s as PipelineStageId];
                                            return (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => handleSlashStatus(s as OrderStatus)}
                                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-foreground hover:bg-foreground/5"
                                                >
                                                    <Check className="h-3.5 w-3.5 shrink-0 opacity-0" />
                                                    {meta?.fallback ?? s}
                                                </button>
                                            );
                                        })}
                                    </>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Full emoji picker */}
                    <AnimatePresence>
                        {emojiOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: 6 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: 6 }}
                                transition={{ duration: 0.14 }}
                                className="absolute bottom-full right-0 z-20 mb-1.5"
                            >
                                <EmojiPicker
                                    onPick={insertEmoji}
                                    onClose={() => setEmojiOpen(false)}
                                />
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
                <VoiceRecorder
                    onRecorded={addVoiceFile}
                    disabled={isUploading}
                />
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
