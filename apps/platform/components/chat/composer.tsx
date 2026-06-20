// apps/platform/components/chat/composer.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@scheniders/ui/textarea";
import { Button } from "@scheniders/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useReferenceSearch } from "@/hooks/chat/use-reference-search";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import type { ChatReference, ChatAttachment } from "@/types/chat";

const QUICK_EMOJIS = ["👍", "🔥", "✅", "❤️", "😂", "🙏", "👏", "🎉"] as const;
const MAX_MENTION_RESULTS = 6;

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
    }) => void;
    onTyping: () => void;
}) {
    const { user, tenantId } = useAuth();

    const [body, setBody] = useState("");
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

    const refResults = useReferenceSearch(refQuery ?? "");
    const { data: members = [] } = useTenantMembers();

    const mentionResults = useMemo(() => {
        if (mentionQuery === null) return [];
        const q = mentionQuery.trim().toLowerCase();
        return members
            .filter((m) => m.user_id !== user?.id)
            .filter((m) => (q === "" ? true : m.display_name.toLowerCase().includes(q)))
            .slice(0, MAX_MENTION_RESULTS);
    }, [members, mentionQuery, user?.id]);

    // Revoke any outstanding object URLs when the pending list changes out from
    // under us or the component unmounts, so we don't leak blob handles.
    useEffect(() => {
        return () => {
            for (const pf of pendingFiles) {
                if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
            }
        };
    }, [pendingFiles]);

    /** Recompute which (if any) trailing token autocomplete should be shown. */
    const syncTokens = (value: string) => {
        const refMatch = value.match(/#(\w*)$/);
        const mentionMatch = value.match(/@(\w*)$/);
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
    };

    const selectReference = (r: (typeof refResults)[number]) => {
        setRefs((prev) =>
            prev.some((p) => p.ref_type === r.ref_type && p.ref_id === r.ref_id)
                ? prev
                : [...prev, { ref_type: r.ref_type, ref_id: r.ref_id, snapshot: r.snapshot }],
        );
        setBody((b) => b.replace(/#\w*$/, ""));
        setRefQuery(null);
        textareaRef.current?.focus();
    };

    const selectMention = (m: (typeof mentionResults)[number]) => {
        setMentions((prev) => (prev.includes(m.user_id) ? prev : [...prev, m.user_id]));
        // Replace the trailing @token with a readable, space-terminated handle.
        setBody((b) => b.replace(/@\w*$/, `@${m.display_name} `));
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
        const next: PendingFile[] = Array.from(files).map((file) => ({
            file,
            previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        }));
        setPendingFiles((prev) => [...prev, ...next]);
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

        setIsUploading(true);
        try {
            const attachments = await uploadAll();
            onSend({
                body: text,
                references: refs,
                mentions,
                attachments,
                clientMsgId: crypto.randomUUID(),
            });
            // Clear previews before dropping the list (effect cleanup also guards).
            for (const pf of pendingFiles) {
                if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
            }
            setBody("");
            setRefs([]);
            setMentions([]);
            setPendingFiles([]);
            setRefQuery(null);
            setMentionQuery(null);
        } finally {
            setIsUploading(false);
        }
    };

    const showRefDropdown = refQuery !== null && refResults.length > 0;
    const showMentionDropdown = mentionQuery !== null && mentionResults.length > 0;
    const canSend = (body.trim().length > 0 || pendingFiles.length > 0) && !isUploading;

    return (
        <div className="relative border-t border-[var(--card-border,rgba(0,0,0,0.08))] bg-[var(--card-bg)] p-2">
            {/* Selected reference + mention chips */}
            {(refs.length > 0 || mentions.length > 0) && (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {refs.map((r, i) => (
                        <span
                            key={`ref-${r.ref_type}-${r.ref_id}-${i}`}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                        >
                            #{String(r.snapshot.order_id ?? r.ref_id)}
                            <button
                                type="button"
                                aria-label="Remove reference"
                                className="rounded-full px-0.5 leading-none text-amber-800/70 hover:text-amber-900"
                                onClick={() => removeReference(i)}
                            >
                                ✕
                            </button>
                        </span>
                    ))}
                    {mentions.map((userId) => {
                        const m = members.find((mem) => mem.user_id === userId);
                        return (
                            <span
                                key={`mention-${userId}`}
                                className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
                            >
                                @{m?.display_name ?? "member"}
                                <button
                                    type="button"
                                    aria-label="Remove mention"
                                    className="rounded-full px-0.5 leading-none text-indigo-700/70 hover:text-indigo-900"
                                    onClick={() => removeMention(userId)}
                                >
                                    ✕
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}

            {/* Pending attachment chips */}
            {pendingFiles.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-2">
                    {pendingFiles.map((pf, i) => (
                        <div
                            key={`file-${i}-${pf.file.name}`}
                            className="flex items-center gap-2 rounded-xl border border-black/10 bg-[var(--background)] px-2 py-1"
                        >
                            {pf.previewUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- local object-URL preview, not a remote asset
                                <img
                                    src={pf.previewUrl}
                                    alt={pf.file.name}
                                    className="h-8 w-8 rounded-md object-cover"
                                />
                            ) : (
                                <span className="text-base leading-none">📄</span>
                            )}
                            <span className="max-w-[160px] truncate text-xs text-foreground">{pf.file.name}</span>
                            <button
                                type="button"
                                aria-label="Remove attachment"
                                className="rounded-full px-0.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => removeFile(i)}
                            >
                                ✕
                            </button>
                        </div>
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
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void submit();
                            }
                        }}
                        placeholder="Message… use # to reference an order, @ to mention"
                        rows={1}
                        className="min-h-[44px] max-h-40 resize-none"
                    />

                    {/* Reference autocomplete dropdown */}
                    {showRefDropdown && (
                        <div className="absolute bottom-full left-0 z-10 mb-1 max-h-64 w-full overflow-y-auto rounded-xl border border-black/10 bg-[var(--card-bg)] shadow-lg">
                            {refResults.map((r) => (
                                <button
                                    key={`${r.ref_type}-${r.ref_id}`}
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                                    onClick={() => selectReference(r)}
                                >
                                    <span className="font-semibold">{r.label}</span>{" "}
                                    <span className="text-muted-foreground">{r.sublabel}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Mention autocomplete dropdown */}
                    {showMentionDropdown && (
                        <div className="absolute bottom-full left-0 z-10 mb-1 max-h-64 w-full overflow-y-auto rounded-xl border border-black/10 bg-[var(--card-bg)] shadow-lg">
                            {mentionResults.map((m) => (
                                <button
                                    key={m.user_id}
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
                                    onClick={() => selectMention(m)}
                                >
                                    {m.avatar_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- small avatar inside a popover; next/image overhead unwarranted
                                        <img
                                            src={m.avatar_url}
                                            alt=""
                                            className="h-6 w-6 rounded-full object-cover"
                                        />
                                    ) : (
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                                            {m.display_name.slice(0, 1).toUpperCase()}
                                        </span>
                                    )}
                                    <span className="font-medium">{m.display_name}</span>
                                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                                        {m.role}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Emoji quick-pick menu */}
                    {emojiOpen && (
                        <div className="absolute bottom-full right-0 z-10 mb-1 flex gap-1 rounded-xl border border-black/10 bg-[var(--card-bg)] p-1.5 shadow-lg">
                            {QUICK_EMOJIS.map((emoji) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    aria-label={`Insert ${emoji}`}
                                    className="rounded-lg px-1.5 py-1 text-lg leading-none hover:bg-black/5"
                                    onClick={() => appendEmoji(emoji)}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}
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
                    aria-label="Add emoji"
                    onClick={() => setEmojiOpen((o) => !o)}
                >
                    🙂
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Attach file"
                    onClick={() => fileRef.current?.click()}
                >
                    📎
                </Button>
                <Button
                    type="button"
                    size="md"
                    isLoading={isUploading}
                    disabled={!canSend}
                    onClick={() => void submit()}
                >
                    {isUploading ? "Sending…" : "Send"}
                </Button>
            </div>
        </div>
    );
}
