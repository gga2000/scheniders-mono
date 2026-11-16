"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import {
    DEFAULT_HEADERS,
    EXPORT_COLUMN_KEYS,
    FILE_FORMATS,
    MAX_HEADER_LENGTH,
    PHONE_FORMATS,
    formatPhoneForCourier,
    type ExportLayout,
} from "@/lib/shipping/export-columns";

/** A courier layout being edited: the courier's name and its columns. */
export type ShipExportDraft = { courierName: string; layout: ExportLayout };

export const MAX_COURIER_NAME_LENGTH = 60;

/** The phone the format buttons show, written each way. */
const SAMPLE_PHONE = "07701234567";

export const phoneSample = (format: ExportLayout["phoneFormat"]) => formatPhoneForCourier(SAMPLE_PHONE, format);

/**
 * Fermi B4: the merchant's own courier sheet. The courier's name, then the
 * columns in the order the courier's upload expects, each under the header the
 * courier uses; then how phones are written and the file type. Headers are the
 * sheet's, so they stay as the merchant types them (Arabic for every Iraqi
 * courier), whatever language the app is in.
 */
export function ShipExportLayoutEditor({
    draft,
    onChange,
}: {
    draft: ShipExportDraft;
    onChange: (draft: ShipExportDraft) => void;
}) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { layout } = draft;
    const setLayout = (next: Partial<ExportLayout>) => onChange({ ...draft, layout: { ...layout, ...next } });
    const columns = layout.columns;
    const missing = EXPORT_COLUMN_KEYS.filter((key) => !columns.some((c) => c.key === key));

    const move = (from: number, to: number) => {
        if (to < 0 || to >= columns.length) return;
        const next = [...columns];
        const [col] = next.splice(from, 1);
        next.splice(to, 0, col);
        setLayout({ columns: next });
    };

    return (
        <div dir={dir} className="space-y-4" data-testid="ship-export-layout-editor">
            <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-muted">{t("shipExport.layout.courierName")}</span>
                <input
                    value={draft.courierName}
                    onChange={(e) => onChange({ ...draft, courierName: e.target.value })}
                    maxLength={MAX_COURIER_NAME_LENGTH}
                    placeholder={t("shipExport.layout.courierNamePlaceholder")}
                    className="h-10 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                />
                <span className="block text-[11px] text-muted">{t("shipExport.layout.courierNameHint")}</span>
            </label>

            <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-muted">{t("shipExport.layout.columns")}</span>
                <ol className="space-y-1.5">
                    {columns.map((col, i) => {
                        const label = t(`shipExport.column.${col.key}`);
                        return (
                            <li
                                key={col.key}
                                className="flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5"
                            >
                                <span className="w-5 shrink-0 text-center text-[11px] font-bold tabular-nums text-muted">{i + 1}</span>
                                <span className="w-36 shrink-0 truncate text-xs font-medium" title={label}>{label}</span>
                                <input
                                    value={col.header}
                                    onChange={(e) => setLayout({
                                        columns: columns.map((c, j) => (j === i ? { ...c, header: e.target.value } : c)),
                                    })}
                                    maxLength={MAX_HEADER_LENGTH}
                                    aria-label={t("shipExport.layout.headerFor", { column: label })}
                                    placeholder={DEFAULT_HEADERS[col.key]}
                                    className={cn(
                                        "h-8 min-w-0 flex-1 rounded-lg border bg-[var(--card-bg)] px-2 text-sm outline-none focus:ring-2 focus:ring-slate-300",
                                        col.header.trim() === "" ? "border-rose-300" : "border-[var(--card-border)]",
                                    )}
                                />
                                <IconButton label={t("shipExport.layout.moveUp")} disabled={i === 0} onClick={() => move(i, i - 1)}>
                                    <ArrowUp className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton label={t("shipExport.layout.moveDown")} disabled={i === columns.length - 1} onClick={() => move(i, i + 1)}>
                                    <ArrowDown className="h-3.5 w-3.5" />
                                </IconButton>
                                <IconButton
                                    label={t("shipExport.layout.remove")}
                                    onClick={() => setLayout({ columns: columns.filter((_, j) => j !== i) })}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </IconButton>
                            </li>
                        );
                    })}
                </ol>
                {missing.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                        <span className="block text-[11px] text-muted">{t("shipExport.layout.add")}</span>
                        <div className="flex flex-wrap gap-1.5">
                            {missing.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setLayout({ columns: [...columns, { key, header: DEFAULT_HEADERS[key] }] })}
                                    className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-[var(--card-border)] px-2.5 text-xs font-medium text-muted hover:bg-[var(--background)] hover:text-foreground"
                                >
                                    <Plus className="h-3 w-3" />
                                    {t(`shipExport.column.${key}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <fieldset className="space-y-1.5">
                    <legend className="mb-1.5 text-xs font-semibold text-muted">{t("shipExport.layout.phone")}</legend>
                    <div role="radiogroup" aria-label={t("shipExport.layout.phone")} className="grid grid-cols-2 gap-1.5">
                        {PHONE_FORMATS.map((format) => (
                            <Choice
                                key={format}
                                selected={layout.phoneFormat === format}
                                onClick={() => setLayout({ phoneFormat: format })}
                            >
                                <span>{t(`shipExport.phone.${format}`)}</span>
                                <span dir="ltr" className="font-mono text-[11px] opacity-70">{phoneSample(format)}</span>
                            </Choice>
                        ))}
                    </div>
                </fieldset>
                <fieldset className="space-y-1.5">
                    <legend className="mb-1.5 text-xs font-semibold text-muted">{t("shipExport.layout.file")}</legend>
                    <div role="radiogroup" aria-label={t("shipExport.layout.file")} className="grid grid-cols-2 gap-1.5 sm:grid-cols-1">
                        {FILE_FORMATS.map((format) => (
                            <Choice
                                key={format}
                                selected={layout.fileFormat === format}
                                onClick={() => setLayout({ fileFormat: format })}
                            >
                                <span>{t(`shipExport.file.${format}`)}</span>
                            </Choice>
                        ))}
                    </div>
                </fieldset>
            </div>
        </div>
    );
}

function IconButton({
    label,
    disabled,
    onClick,
    children,
}: {
    label: string;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-[var(--card-bg)] hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
            {children}
        </button>
    );
}

function Choice({
    selected,
    onClick,
    children,
}: {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={onClick}
            className={cn(
                "flex min-h-9 items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                selected
                    ? "border-slate-800 bg-slate-800 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : "border-[var(--card-border)] hover:bg-[var(--background)]",
            )}
        >
            {children}
        </button>
    );
}
