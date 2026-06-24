// apps/platform/components/chat/emoji-picker.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/providers/language-provider";
import { EMOJI_CATEGORIES, ALL_EMOJIS } from "@/lib/chat/emoji-data";

/** localStorage key for the recent/frequent emoji list. */
const FREQUENT_KEY = "chat-emoji-frequent";
const FREQUENT_MAX = 16;

function readFrequent(): string[] {
    try {
        const raw = localStorage.getItem(FREQUENT_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((x): x is string => typeof x === "string");
    } catch {
        return [];
    }
}

export function recordFrequent(emoji: string): void {
    const prev = readFrequent();
    const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, FREQUENT_MAX);
    try {
        localStorage.setItem(FREQUENT_KEY, JSON.stringify(next));
    } catch {
        // localStorage unavailable — ignore
    }
}

export interface EmojiPickerProps {
    onPick: (emoji: string) => void;
    onClose: () => void;
}

export function EmojiPicker({ onPick, onClose }: EmojiPickerProps) {
    const { t } = useLanguage();
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState("frequent");
    const [frequent, setFrequent] = useState<string[]>(() => readFrequent());
    const searchRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Focus search on mount
    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    // Close on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // Bind on next tick so the triggering click doesn't immediately close
        const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
        return () => {
            clearTimeout(id);
            document.removeEventListener("mousedown", handler);
        };
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const handlePick = useCallback(
        (emoji: string) => {
            recordFrequent(emoji);
            setFrequent(readFrequent());
            onPick(emoji);
        },
        [onPick]
    );

    const searchResults = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return null;
        return ALL_EMOJIS.filter(
            (e) => e.name.includes(q) || e.keywords.some((k) => k.includes(q))
        );
    }, [search]);

    const categoryTabs = useMemo(
        () => [
            { id: "frequent", label: t("chat.emoji.frequent", "Frequent"), icon: "🕐" },
            ...EMOJI_CATEGORIES.map((c) => ({
                id: c.id,
                label: t(c.labelKey, c.id),
                icon: c.emojis[0]?.emoji ?? "●",
            })),
        ],
        [t]
    );

    const activeEmojis = useMemo(() => {
        if (searchResults !== null) return searchResults;
        if (activeCategory === "frequent") {
            return frequent.map((emoji) => ALL_EMOJIS.find((e) => e.emoji === emoji)).filter(
                (e): e is NonNullable<typeof e> => e !== undefined
            );
        }
        return EMOJI_CATEGORIES.find((c) => c.id === activeCategory)?.emojis ?? [];
    }, [searchResults, activeCategory, frequent]);

    return (
        <div
            ref={containerRef}
            role="dialog"
            aria-label={t("chat.emoji.pickerLabel", "Emoji picker")}
            className="flex flex-col rounded-xl border border-(--card-border) bg-(--card-bg) shadow-xl"
            style={{ width: 320, maxHeight: 380 }}
        >
            {/* Search input */}
            <div className="border-b border-(--card-border) p-2">
                <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                    }}
                    placeholder={t("chat.emoji.searchPlaceholder", "Search emoji…")}
                    aria-label={t("chat.emoji.searchPlaceholder", "Search emoji…")}
                    className="w-full rounded-lg border border-(--card-border) bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
            </div>

            {/* Category tabs — hidden during search */}
            {!search && (
                <div className="flex overflow-x-auto border-b border-(--card-border) scrollbar-none">
                    {categoryTabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            title={tab.label}
                            aria-label={tab.label}
                            aria-pressed={activeCategory === tab.id}
                            onClick={() => setActiveCategory(tab.id)}
                            className={[
                                "flex shrink-0 items-center justify-center px-2 py-1.5 text-base transition-colors",
                                activeCategory === tab.id
                                    ? "border-b-2 border-indigo-500 text-foreground"
                                    : "text-muted-foreground hover:text-foreground",
                            ].join(" ")}
                        >
                            {tab.icon}
                        </button>
                    ))}
                </div>
            )}

            {/* Emoji grid */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-1.5">
                {search && searchResults !== null && searchResults.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                        {t("chat.emoji.noResults", "No emojis found")}
                    </p>
                ) : activeEmojis.length === 0 && activeCategory === "frequent" && !search ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                        {t("chat.emoji.noFrequent", "Your frequently used emojis will appear here")}
                    </p>
                ) : (
                    <div className="grid grid-cols-8 gap-0.5">
                        {activeEmojis.map((entry, idx) => (
                            <button
                                key={`${entry.emoji}-${idx}`}
                                type="button"
                                aria-label={entry.name}
                                title={entry.name}
                                onClick={() => handlePick(entry.emoji)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none transition-transform hover:scale-110 hover:bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                            >
                                {entry.emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
