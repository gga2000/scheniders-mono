"use client";

// =====================================================================
// SavePresetDialog — Builder v2
// =====================================================================
// Small inline-input dialog used to replace `window.prompt` when the
// merchant saves a section as a reusable preset. Uses the platform's
// Radix-backed `Dialog` primitive (no native browser modal).
// =====================================================================

import { useEffect, useRef, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@scheniders/ui";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

export interface SavePresetDialogProps {
    open: boolean;
    suggested: string;
    onCancel: () => void;
    onConfirm: (name: string) => void;
}

export function SavePresetDialog({
    open,
    suggested,
    onCancel,
    onConfirm,
}: SavePresetDialogProps): React.ReactElement {
    const locale = useEditorLocale();
    const [value, setValue] = useState<string>(suggested);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (open) {
            setValue(suggested);
            // Focus the input shortly after open.
            const t = setTimeout(() => inputRef.current?.select(), 30);
            return () => clearTimeout(t);
        }
    }, [open, suggested]);

    const handleSubmit = (): void => {
        const name = value.trim();
        if (!name) return;
        onConfirm(name);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
            <DialogContent
                data-testid="save-preset-dialog"
                className="md:max-w-md"
            >
                <DialogHeader>
                    <DialogTitle>{t(STRINGS.save_preset.title, locale)}</DialogTitle>
                    <DialogDescription>
                        {t(STRINGS.save_preset.description, locale)}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                    <label
                        htmlFor="save-preset-name"
                        className="text-sm font-medium text-foreground/80"
                    >
                        {t(STRINGS.save_preset.name_label, locale)}
                    </label>
                    <input
                        ref={inputRef}
                        id="save-preset-name"
                        data-testid="save-preset-dialog-input"
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        placeholder={t(STRINGS.save_preset.placeholder, locale)}
                        className="w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                </div>
                <DialogFooter>
                    <button
                        type="button"
                        onClick={onCancel}
                        data-testid="save-preset-dialog-cancel"
                        className="inline-flex h-9 items-center justify-center rounded-md border border-(--card-border) bg-(--card-bg) px-3 text-sm font-medium text-foreground/80 hover:text-foreground"
                    >
                        {t(STRINGS.save_preset.cancel, locale)}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!value.trim()}
                        data-testid="save-preset-dialog-confirm"
                        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {t(STRINGS.save_preset.save, locale)}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
