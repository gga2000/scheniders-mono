"use client";

// Searchable category picker with tree rendering, fuzzy search, and inline create.

import {
    useState,
    useEffect,
    useMemo,
    useRef,
    useCallback,
    type KeyboardEvent,
} from "react";
import Fuse from "fuse.js";
import {
    Search,
    Check,
    Plus,
    ChevronDown,
    FolderOpen,
    Tag,
    Loader2,
} from "lucide-react";
import {
    useCategoriesQuery,
    useAddCategoryMutation,
} from "@/hooks/use-categories-query";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { slugify } from "@scheniders/shared";
import type { Category } from "@/types/product";

export interface CategoryComboboxProps {
    value: string | null;
    onChange: (categoryId: string | null) => void;
    placeholder?: string;
    allowUncategorized?: boolean;
    allowCreate?: boolean;
    autoFocus?: boolean;
    size?: "sm" | "md";
    className?: string;
    variant?: "trigger" | "anchored";
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

type ListRow =
    | { kind: "uncategorized" }
    | { kind: "category"; category: Category; depth: number }
    | { kind: "create"; query: string };

function buildTreeRows(categories: Category[]): ListRow[] {
    const byParent = new Map<string | null, Category[]>();
    for (const c of categories) {
        const key = c.parent_id ?? null;
        const arr = byParent.get(key) ?? [];
        arr.push(c);
        byParent.set(key, arr);
    }
    for (const arr of byParent.values()) {
        arr.sort((a, b) => {
            const d = (a.display_order ?? 0) - (b.display_order ?? 0);
            return d !== 0 ? d : a.name.localeCompare(b.name);
        });
    }
    const rows: ListRow[] = [];
    const visit = (parent: string | null, depth: number) => {
        const kids = byParent.get(parent) ?? [];
        for (const c of kids) {
            rows.push({ kind: "category", category: c, depth });
            visit(c.id, depth + 1);
        }
    };
    visit(null, 0);
    // Orphans (parent_id referencing missing category) — show as top-level.
    const known = new Set(categories.map((c) => c.id));
    for (const c of categories) {
        if (c.parent_id && !known.has(c.parent_id) && !rows.find((r) => r.kind === "category" && r.category.id === c.id)) {
            rows.push({ kind: "category", category: c, depth: 0 });
        }
    }
    return rows;
}

export function CategoryCombobox({
    value,
    onChange,
    placeholder,
    allowUncategorized = true,
    allowCreate = true,
    autoFocus = false,
    size = "md",
    className,
    variant = "trigger",
    open: openProp,
    onOpenChange,
}: CategoryComboboxProps) {
    const { t } = useLanguage();
    const { data: categories = [], isLoading } = useCategoriesQuery();
    const addMutation = useAddCategoryMutation();

    const [internalOpen, setInternalOpen] = useState(false);
    const isAnchored = variant === "anchored";
    const open = isAnchored ? !!openProp : internalOpen;

    const setOpen = useCallback(
        (next: boolean) => {
            if (isAnchored) {
                onOpenChange?.(next);
            } else {
                setInternalOpen(next);
                onOpenChange?.(next);
            }
        },
        [isAnchored, onOpenChange]
    );

    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [creating, setCreating] = useState(false);

    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    const selectedCategory = useMemo(
        () => (value ? categories.find((c) => c.id === value) ?? null : null),
        [categories, value]
    );

    const fuse = useMemo(
        () =>
            new Fuse(categories, {
                keys: ["name"],
                threshold: 0.3,
                includeScore: true,
            }),
        [categories]
    );

    const rows: ListRow[] = useMemo(() => {
        const trimmed = query.trim();
        const out: ListRow[] = [];
        if (!trimmed) {
            if (allowUncategorized) out.push({ kind: "uncategorized" });
            out.push(...buildTreeRows(categories));
            return out;
        }
        const results = fuse.search(trimmed).map((r) => r.item);
        for (const c of results) {
            out.push({ kind: "category", category: c, depth: 0 });
        }
        const exact = categories.some(
            (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (allowCreate && !exact) {
            out.push({ kind: "create", query: trimmed });
        }
        return out;
    }, [query, categories, fuse, allowCreate, allowUncategorized]);

    useEffect(() => {
        setActiveIndex(0);
    }, [query, rows.length]);

    useEffect(() => {
        if (open) {
            setQuery("");
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 30);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [open, setOpen]);

    useEffect(() => {
        if (autoFocus && !isAnchored) {
            triggerRef.current?.focus();
        }
    }, [autoFocus, isAnchored]);

    const commit = useCallback(
        async (row: ListRow) => {
            if (row.kind === "uncategorized") {
                onChange(null);
                setOpen(false);
                return;
            }
            if (row.kind === "category") {
                onChange(row.category.id);
                setOpen(false);
                return;
            }
            if (row.kind === "create") {
                if (creating) return;
                setCreating(true);
                try {
                    const created = await addMutation.mutateAsync({
                        name: row.query,
                        slug: slugify(row.query),
                        description: null,
                        image_url: null,
                        parent_id: null,
                        display_order: 0,
                        is_visible: true,
                    });
                    onChange(created.id);
                    setOpen(false);
                } finally {
                    setCreating(false);
                }
            }
        },
        [addMutation, creating, onChange, setOpen]
    );

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => {
                    const next = Math.min(i + 1, rows.length - 1);
                    itemRefs.current.get(next)?.scrollIntoView({ block: "nearest" });
                    return next;
                });
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => {
                    const next = Math.max(i - 1, 0);
                    itemRefs.current.get(next)?.scrollIntoView({ block: "nearest" });
                    return next;
                });
            } else if (e.key === "Home") {
                e.preventDefault();
                setActiveIndex(0);
                itemRefs.current.get(0)?.scrollIntoView({ block: "nearest" });
            } else if (e.key === "End") {
                e.preventDefault();
                const last = Math.max(rows.length - 1, 0);
                setActiveIndex(last);
                itemRefs.current.get(last)?.scrollIntoView({ block: "nearest" });
            } else if (e.key === "Enter") {
                e.preventDefault();
                const row = rows[activeIndex];
                if (row) void commit(row);
            } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
            }
        },
        [rows, activeIndex, commit, setOpen]
    );

    const sizeClasses =
        size === "sm"
            ? "px-2.5 py-1.5 text-sm"
            : "px-3 py-2 text-sm";

    const selectedLabel =
        selectedCategory?.name ??
        (allowUncategorized ? t("products.category.uncategorized") || "Uncategorized" : "");

    const searchPlaceholder =
        placeholder ?? (t("products.category.searchPlaceholder") || "Search categories...");

    const renderRow = (row: ListRow, index: number) => {
        const isActive = index === activeIndex;
        const baseClass = cn(
            "mx-2 px-3 py-2 rounded-xl cursor-pointer flex items-center gap-2.5 transition-colors",
            isActive
                ? "bg-[var(--pastel-yellow)]/30"
                : "hover:bg-[var(--background)]"
        );

        if (row.kind === "uncategorized") {
            const selected = value === null;
            return (
                <div
                    key="__uncategorized"
                    ref={(el) => {
                        if (el) itemRefs.current.set(index, el);
                        else itemRefs.current.delete(index);
                    }}
                    className={baseClass}
                    onClick={() => void commit(row)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    aria-selected={selected}
                >
                    <FolderOpen className="w-4 h-4 text-muted shrink-0" />
                    <span className="flex-1 text-[var(--foreground)] truncate">
                        {t("products.category.uncategorized") || "Uncategorized"}
                    </span>
                    {selected && <Check className="w-4 h-4 text-muted shrink-0" />}
                </div>
            );
        }

        if (row.kind === "create") {
            return (
                <div
                    key="__create"
                    ref={(el) => {
                        if (el) itemRefs.current.set(index, el);
                        else itemRefs.current.delete(index);
                    }}
                    className={baseClass}
                    onClick={() => void commit(row)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    aria-selected={false}
                >
                    {creating ? (
                        <Loader2 className="w-4 h-4 text-muted shrink-0 animate-spin" />
                    ) : (
                        <Plus className="w-4 h-4 text-muted shrink-0" />
                    )}
                    <span className="flex-1 text-[var(--foreground)] truncate">
                        {creating
                            ? t("products.category.creating") || "Creating..."
                            : t("products.category.create", { name: row.query }) ||
                              `Create "${row.query}"`}
                    </span>
                </div>
            );
        }

        const { category, depth } = row;
        const selected = value === category.id;
        return (
            <div
                key={category.id}
                ref={(el) => {
                    if (el) itemRefs.current.set(index, el);
                    else itemRefs.current.delete(index);
                }}
                className={baseClass}
                onClick={() => void commit(row)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                aria-selected={selected}
                style={{ paddingInlineStart: `${12 + depth * 16}px` }}
            >
                <Tag className="w-4 h-4 text-muted shrink-0" />
                <span className="flex-1 text-[var(--foreground)] truncate">
                    {category.name}
                </span>
                {selected && <Check className="w-4 h-4 text-muted shrink-0" />}
            </div>
        );
    };

    const popover = (
        <div
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-xl overflow-hidden w-full"
            onKeyDown={handleKeyDown}
        >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--card-border)]">
                <Search className="w-4 h-4 text-muted shrink-0" />
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-muted outline-none"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                />
            </div>
            <div
                className="max-h-72 overflow-y-auto overscroll-contain py-2"
                role="listbox"
            >
                {isLoading ? (
                    <div className="px-4 py-6 text-center text-sm text-muted">
                        <Loader2 className="w-4 h-4 animate-spin inline-block" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted">
                        {categories.length === 0
                            ? t("products.category.empty") || "No categories yet"
                            : t("products.category.noMatches") || "No matches"}
                    </div>
                ) : (
                    rows.map((row, i) => renderRow(row, i))
                )}
            </div>
        </div>
    );

    if (isAnchored) {
        if (!open) return null;
        return (
            <div ref={rootRef} className={cn("w-full", className)}>
                {popover}
            </div>
        );
    }

    return (
        <div ref={rootRef} className={cn("relative", className)}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(!open)}
                className={cn(
                    "w-full flex items-center gap-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-[var(--foreground)] hover:bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-colors",
                    sizeClasses
                )}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <Tag className="w-4 h-4 text-muted shrink-0" />
                <span
                    className={cn(
                        "flex-1 truncate text-start",
                        !selectedLabel && "text-muted"
                    )}
                >
                    {selectedLabel ||
                        (t("products.category.searchPlaceholder") || "Search categories...")}
                </span>
                <ChevronDown
                    className={cn(
                        "w-4 h-4 text-muted shrink-0 transition-transform",
                        open && "rotate-180"
                    )}
                />
            </button>
            {open && (
                <div className="absolute z-50 mt-2 left-0 right-0">
                    {popover}
                </div>
            )}
        </div>
    );
}

export default CategoryCombobox;
