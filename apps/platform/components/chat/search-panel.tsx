// apps/platform/components/chat/search-panel.tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMessageSearch } from "@/hooks/chat/use-message-search";
import { useTenantMembers } from "@/hooks/chat/use-tenant-members";
import { useChatStore } from "@/store/use-chat-store";
import { useLanguage } from "@/components/providers/language-provider";
import { ChatAvatar } from "./chat-avatar";
import { ChatEmptyState } from "./chat-empty-state";
import type { ChatSearchResult } from "@/types/chat";

/** Render a snippet that contains «highlighted» and »non-highlighted« segments.
 *  The delimiters «  and » are literal text from ts_headline — never HTML —
 *  so we string-split and wrap segments; no dangerouslySetInnerHTML is used. */
function SnippetHighlight({ snippet }: { snippet: string }) {
    // Split on the delimiter pair: «<text>»
    // Pattern: text outside delimiters is plain; text between « and » is highlighted.
    const parts: { text: string; highlight: boolean }[] = [];
    let remaining = snippet;
    while (remaining.length > 0) {
        const open = remaining.indexOf("«");
        if (open === -1) {
            parts.push({ text: remaining, highlight: false });
            break;
        }
        if (open > 0) {
            parts.push({ text: remaining.slice(0, open), highlight: false });
        }
        const close = remaining.indexOf("»", open + 1);
        if (close === -1) {
            // No closing delimiter — treat the rest as plain text
            parts.push({ text: remaining.slice(open), highlight: false });
            break;
        }
        parts.push({ text: remaining.slice(open + 1, close), highlight: true });
        remaining = remaining.slice(close + 1);
    }
    return (
        <span>
            {parts.map((p, i) =>
                p.highlight ? (
                    <mark
                        key={i}
                        className="rounded-[2px] bg-[var(--pastel-yellow)] px-[1px] text-[var(--ink)] not-italic"
                        style={{ fontStyle: "normal" }}
                    >
                        {p.text}
                    </mark>
                ) : (
                    <span key={i}>{p.text}</span>
                )
            )}
        </span>
    );
}

/** Conversation label for a search result: #name for channels, peer name or
 *  group name for DMs/groups, plain name for order threads. */
function convLabel(result: ChatSearchResult): string {
    const name = result.conversation_name ?? "";
    if (result.conversation_kind === "channel") return `# ${name}`;
    return name;
}

/** Skeleton row shown while the search RPC is in-flight. */
function SkeletonRow() {
    return (
        <div className="flex items-start gap-3 px-4 py-3">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-foreground/10" />
            <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3 w-32 animate-pulse rounded bg-foreground/10" />
                <div className="h-3 animate-pulse rounded bg-foreground/5" style={{ width: "75%" }} />
            </div>
        </div>
    );
}

export function SearchPanel({ onClose }: { onClose: () => void }) {
    const { t } = useLanguage();
    const { openMessage } = useChatStore();
    const { data: members } = useTenantMembers();

    const memberMap = useMemo(() => {
        const map = new Map<string, { display_name: string; avatar_url: string | null }>();
        for (const m of members ?? []) map.set(m.user_id, { display_name: m.display_name, avatar_url: m.avatar_url });
        return map;
    }, [members]);

    const [inputValue, setInputValue] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounce: wait ~250 ms after the user stops typing before firing the query
    useEffect(() => {
        const id = setTimeout(() => setDebouncedQuery(inputValue), 250);
        return () => clearTimeout(id);
    }, [inputValue]);

    // Focus the input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const { data: results, isFetching } = useMessageSearch(debouncedQuery);

    const isEmpty = inputValue.trim().length < 2;
    const showSkeleton = !isEmpty && isFetching;
    const showNoResults = !isEmpty && !isFetching && (results?.length ?? 0) === 0;
    const showResults = !isEmpty && !isFetching && (results?.length ?? 0) > 0;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-[var(--card-border)] px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                    ref={inputRef}
                    type="search"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={t("chat.searchPlaceholder", "Search messages…")}
                    className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    aria-label={t("chat.search", "Search messages")}
                />
            </div>

            {/* States */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {isEmpty && (
                    <ChatEmptyState
                        icon={Search}
                        title={t("chat.search", "Search messages")}
                        description={t("chat.searchEmpty", "Type at least 2 characters to search.")}
                    />
                )}

                {showSkeleton && (
                    <div className="py-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonRow key={i} />
                        ))}
                    </div>
                )}

                {showNoResults && (
                    <ChatEmptyState
                        icon={Search}
                        title={t("chat.searchNoResults", "No results")}
                        description={t("chat.searchNoResultsDesc", "Try different keywords.")}
                    />
                )}

                {showResults && (
                    <ul role="list" className="py-1">
                        {results!.map((result) => {
                            const sender = memberMap.get(result.sender_id);
                            const senderName = sender?.display_name ?? "Teammate";
                            const label = convLabel(result);
                            const relativeTime = formatDistanceToNow(new Date(result.created_at), { addSuffix: true });

                            return (
                                <li key={result.message_id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            openMessage(result.conversation_id, result.message_id);
                                            onClose();
                                        }}
                                        className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-foreground/5 active:bg-foreground/10"
                                    >
                                        <ChatAvatar
                                            userId={result.sender_id}
                                            name={senderName}
                                            avatarUrl={sender?.avatar_url}
                                            size="sm"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline gap-2">
                                                <span className="truncate text-[13px] font-semibold text-foreground">
                                                    {senderName}
                                                </span>
                                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                                    {label}
                                                </span>
                                                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                                                    {relativeTime}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                <SnippetHighlight snippet={result.snippet || result.body} />
                                            </p>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
