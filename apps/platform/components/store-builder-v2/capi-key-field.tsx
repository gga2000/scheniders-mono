"use client";

// =====================================================================
// CapiKeyField — one Conversions API send key, write-only
// =====================================================================
// Saved: a lock, «محفوظ», the last four characters, Replace and Delete.
// Not saved (or replacing): a password box and Save. The key itself never
// comes back to the browser; see use-capi-keys.ts.
// =====================================================================

import { useState } from "react";
import { Lock } from "lucide-react";
import { STRINGS, t, type EditorString } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { cn } from "@/lib/utils";
import { CapiKeyForbiddenError, type CapiKeyStatus, type CapiNetwork } from "./use-capi-keys";

export interface CapiKeyFieldProps {
    network: CapiNetwork;
    label: EditorString;
    status: CapiKeyStatus;
    pending: boolean;
    onSave: (token: string | null) => Promise<void>;
}

const inputCls =
    "text-foreground placeholder:text-muted-foreground w-full rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";
const btnCls =
    "inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-50";
const quietBtnCls = cn(btnCls, "border border-(--card-border) text-foreground hover:bg-black/5");

export function CapiKeyField({ network, label, status, pending, onSave }: CapiKeyFieldProps): React.ReactElement {
    const locale = useEditorLocale();
    const P = STRINGS.pixels;
    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);

    const run = async (token: string | null): Promise<void> => {
        setError(null);
        try {
            await onSave(token);
            setEditing(false);
            setConfirmDelete(false);
            setDraft("");
        } catch (e) {
            setError(t(e instanceof CapiKeyForbiddenError ? P.key_forbidden : P.key_save_error, locale));
        }
    };

    const showInput = !status.saved || editing;
    const id = `capi-key-${network}`;

    return (
        <div data-testid={id} className="flex flex-col gap-1">
            <label htmlFor={showInput ? `${id}-input` : undefined} className="text-xs font-medium text-muted-foreground text-left!">
                {t(label, locale)}
            </label>
            {showInput ? (
                <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (draft.trim()) void run(draft.trim());
                    }}
                >
                    <input
                        id={`${id}-input`}
                        type="password"
                        autoComplete="off"
                        dir="ltr"
                        data-testid={`${id}-input`}
                        value={draft}
                        placeholder={t(P.key_paste, locale)}
                        onChange={(e) => setDraft(e.target.value)}
                        className={inputCls}
                    />
                    <button
                        type="submit"
                        data-testid={`${id}-save`}
                        disabled={pending || !draft.trim()}
                        className={cn(btnCls, "bg-primary text-primary-foreground hover:bg-primary/90")}
                    >
                        {t(P.key_save, locale)}
                    </button>
                    {status.saved ? (
                        <button
                            type="button"
                            onClick={() => {
                                setEditing(false);
                                setDraft("");
                                setError(null);
                            }}
                            className={quietBtnCls}
                        >
                            {t(P.key_cancel, locale)}
                        </button>
                    ) : null}
                </form>
            ) : confirmDelete ? (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5">
                    <p className="min-w-0 flex-1 text-xs text-red-800 text-left!">{t(P.key_delete_confirm, locale)}</p>
                    <button
                        type="button"
                        data-testid={`${id}-delete-yes`}
                        disabled={pending}
                        onClick={() => void run(null)}
                        className={cn(btnCls, "bg-red-600 text-white hover:bg-red-700")}
                    >
                        {t(P.key_delete_yes, locale)}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className={quietBtnCls}>
                        {t(P.key_cancel, locale)}
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2 rounded-lg border border-(--card-border) bg-(--card-bg) px-2.5 py-1.5">
                    <Lock aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t(P.key_saved, locale)}</span>
                    <span data-testid={`${id}-last4`} className="min-w-0 flex-1 truncate text-xs text-muted-foreground text-left!">
                        {status.last4 ? (
                            <>
                                {t(P.key_ends_with, locale)} <bdi dir="ltr">…{status.last4}</bdi>
                            </>
                        ) : null}
                    </span>
                    <button
                        type="button"
                        data-testid={`${id}-replace`}
                        onClick={() => setEditing(true)}
                        className={quietBtnCls}
                    >
                        {t(P.key_replace, locale)}
                    </button>
                    <button
                        type="button"
                        data-testid={`${id}-delete`}
                        onClick={() => setConfirmDelete(true)}
                        className={cn(quietBtnCls, "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10")}
                    >
                        {t(P.key_delete, locale)}
                    </button>
                </div>
            )}
            {error ? (
                <p role="alert" className="text-xs text-red-600 text-left! dark:text-red-400">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
