"use client";

import { useRef, useState } from "react";
import { Loader2, Plus, Save, Smile, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { TemplateEditor, TemplateType } from "@/hooks/use-message-templates";
import { getEmojiList } from "@/lib/emoji-shortcodes";
import { OFFER_TEMPLATE_VARIABLES, TEMPLATE_VARIABLES } from "@/lib/fill-message-template";
import { cn } from "@/lib/utils";

const TYPES: { value: TemplateType | null; label: string }[] = [
    { value: null, label: "templates.general" },
    { value: "confirmation", label: "templates.confirmation" },
    { value: "reminder", label: "templates.reminder" },
    { value: "discount", label: "templates.discount" },
];

const TYPE_DOT: Record<TemplateType, string> = {
    confirmation: "bg-emerald-500",
    reminder: "bg-amber-500",
    discount: "bg-rose-500",
};

const INPUT =
    "w-full rounded-xl border border-(--card-border) bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-(--ink) focus:outline-none";

/**
 * The shop's WhatsApp templates, edited in place: pick one, change its words,
 * drop in the order's details with one click. The preview beside it follows.
 */
export function MessageTemplatesList({ editor }: { editor: TemplateEditor }) {
    const { t } = useLanguage();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // Where the cursor last was in this template's text; none yet = add at the end.
    const caret = useRef<{ id: string; start: number; end: number } | null>(null);
    const [showEmoji, setShowEmoji] = useState(false);
    const { current } = editor;

    if (editor.loading) {
        return (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("templates.loading")}
            </div>
        );
    }

    /** Puts text where the cursor is (at the end when the box was never clicked). */
    const insert = (text: string) => {
        if (!current) return;
        const value = current.content_ar ?? "";
        const el = textareaRef.current;
        const at = caret.current?.id === current.id ? caret.current : null;
        const start = Math.min(at?.start ?? value.length, value.length);
        const end = Math.min(at?.end ?? value.length, value.length);
        editor.change({ content_ar: value.slice(0, start) + text + value.slice(end) });
        caret.current = { id: current.id, start: start + text.length, end: start + text.length };
        requestAnimationFrame(() => {
            el?.focus();
            el?.setSelectionRange(start + text.length, start + text.length);
        });
    };

    const variables = current?.template_type === "discount" ? [...TEMPLATE_VARIABLES, ...OFFER_TEMPLATE_VARIABLES] : TEMPLATE_VARIABLES;

    return (
        <div className="space-y-4">
            <div role="tablist" aria-label={t("settings.orders.templates")} className="flex flex-wrap gap-2">
                {editor.templates.map((row) => {
                    const on = row.id === current?.id;
                    return (
                        <button
                            key={row.id}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => editor.select(row.id)}
                            className={cn(
                                "inline-flex h-8 max-w-56 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
                                on ? "bg-(--ink) text-white" : "bg-(--background) text-foreground hover:bg-(--background-soft)",
                                !row.is_active && !on && "text-muted-foreground",
                            )}
                        >
                            {row.template_type && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TYPE_DOT[row.template_type])} />}
                            <span className="truncate">{on && editor.dirty ? current?.name || row.name : row.name}</span>
                        </button>
                    );
                })}
                <button
                    type="button"
                    onClick={editor.startNew}
                    className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-(--card-border) px-3 text-sm font-medium text-foreground hover:bg-(--background)",
                        editor.isNew && "border-(--ink)",
                    )}
                >
                    <Plus className="h-3.5 w-3.5" />
                    {t("templates.new")}
                </button>
            </div>

            {!current ? (
                <p className="rounded-xl bg-(--background-soft) px-4 py-6 text-center text-sm text-muted-foreground">
                    <bdi>{t("templates.empty")}</bdi>
                </p>
            ) : (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-48 flex-1">
                            <label htmlFor="template-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                                {t("templates.name")}
                            </label>
                            <input
                                id="template-name"
                                value={current.name}
                                onChange={(e) => editor.change({ name: e.target.value })}
                                placeholder={t("templates.namePlaceholder")}
                                className={INPUT}
                            />
                        </div>
                        <div role="radiogroup" aria-label={t("templates.type")} className="flex h-9.5 items-center gap-1 rounded-xl bg-(--background) p-1">
                            {TYPES.map((type) => {
                                const on = (current.template_type ?? null) === type.value;
                                return (
                                    <button
                                        key={type.value ?? "general"}
                                        type="button"
                                        role="radio"
                                        aria-checked={on}
                                        onClick={() => editor.change({ template_type: type.value })}
                                        className={cn(
                                            "h-7.5 rounded-lg px-3 text-xs font-semibold transition-colors",
                                            on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                                        )}
                                    >
                                        {t(type.label)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <label htmlFor="template-text" className="text-xs font-medium text-muted-foreground">
                                {t("templates.arabicContent")}
                            </label>
                            <button
                                type="button"
                                onClick={() => setShowEmoji((v) => !v)}
                                aria-expanded={showEmoji}
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                                    showEmoji ? "bg-(--pastel-yellow) text-amber-800" : "text-muted-foreground hover:bg-(--background)",
                                )}
                            >
                                <Smile className="h-3.5 w-3.5" />
                                {t("templates.emoji")}
                            </button>
                        </div>
                        <textarea
                            id="template-text"
                            ref={textareaRef}
                            dir="rtl"
                            value={current.content_ar ?? ""}
                            onChange={(e) => editor.change({ content_ar: e.target.value })}
                            onSelect={(e) => {
                                caret.current = { id: current.id, start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
                            }}
                            placeholder={t("templates.textPlaceholder")}
                            className={cn(INPUT, "min-h-36 resize-y leading-relaxed")}
                        />
                        {showEmoji && (
                            <div className="mt-2 flex flex-wrap gap-1 rounded-xl bg-(--background-soft) p-2">
                                {getEmojiList().slice(0, 24).map((item) => (
                                    <button
                                        key={item.shortcode}
                                        type="button"
                                        onClick={() => insert(`{e:${item.shortcode}}`)}
                                        aria-label={item.shortcode}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-background"
                                    >
                                        {item.emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{t("templates.insert")}</span>
                        {variables.map((v) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => insert(`{${v}}`)}
                                className="inline-flex h-7 items-center rounded-lg bg-(--pastel-purple) px-2.5 text-xs font-medium text-purple-800 hover:opacity-80"
                            >
                                {t(`templates.var.${v}`)}
                            </button>
                        ))}
                    </div>

                    {!editor.isNew && (
                        <button
                            type="button"
                            onClick={editor.remove}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("templates.delete")}
                        </button>
                    )}

                    {editor.dirty && (
                        <div className="flex items-center justify-between gap-3 rounded-2xl bg-(--ink) px-4 py-2.5 text-white">
                            <span className="text-sm"><bdi>{t("settings.unsaved")}</bdi></span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={editor.discard}
                                    className="h-8 rounded-lg border border-white/30 px-3 text-xs font-semibold hover:bg-white/10"
                                >
                                    {t("settings.discard")}
                                </button>
                                <button
                                    type="button"
                                    onClick={editor.save}
                                    disabled={editor.saving || !current.name.trim()}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-50"
                                >
                                    {editor.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    {t("templates.save")}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
