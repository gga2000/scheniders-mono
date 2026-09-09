"use client";

// =====================================================================
// AutoForm field renderer + controls (extracted from auto-form, 4.3)
// =====================================================================
// `FieldRenderer` dispatches a `FieldShape` to its control. Controls
// are colocated below (string/color/image/number/boolean/enum/array/
// object + the shared FieldHeader). The walker stays in auto-form.tsx.
// =====================================================================

import {
    useCallback,
    useMemo,
    useState,
    type ReactElement,
} from "react";
import {
    ChevronDown,
    ChevronRight,
    Copy as CopyIcon,
    GripVertical,
    Image as ImageIcon,
    Loader2,
    Plus,
    Trash2,
    Upload,
} from "lucide-react";
import { z } from "zod";
import type { I18nString, LocaleCode } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { STRINGS, t as tx, tFormat } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import {
    resolveEnumValueLabel,
    resolveFieldHelp,
    resolveFieldLabel,
} from "@/lib/section-field-meta";
import { I18nStringInput } from "./i18n-string-input";
import { resolveFieldWidget } from "@/lib/section-field-widgets";
import {
    CategoryPickerField,
    LinkPickerField,
    ProductPickerField,
} from "./resource-picker";
import {
    inferField,
    type FieldShape,
} from "./auto-form-schema";

/** Adornment hook the walker passes down — renders the per-field
 * breakpoint pencil for top-level fields (advanced mode only). */
export type RenderFieldAdornment = (
    fieldKey: string,
    fieldKind: FieldShape["kind"],
) => ReactElement | null;

/* ─────────────────────────────────────────────────────────────────── */
/* Renderer                                                             */
/* ─────────────────────────────────────────────────────────────────── */

export interface FieldRendererProps {
    schema: z.ZodType<unknown>;
    value: unknown;
    onChange: (next: unknown) => void;
    labelPath: string[];
    fieldKey: string;
    tenantId?: string;
    /** Active editor locale — propagated down to I18nStringInput. */
    activeLocale?: LocaleCode;
    /** If true, this is a top-level form — render flat (no card wrapper). */
    inline?: boolean;
    /**
     * When set + `isTopLevel`, the renderer emits the adornment ABOVE the
     * field control. Only top-level scalars and `_i18n` fields qualify
     * (arrays / nested objects are skipped per the audit's Phase-3b
     * scope to keep the surface simple).
     */
    renderAdornment?: RenderFieldAdornment;
    isTopLevel?: boolean;
}

export function FieldRenderer(props: FieldRendererProps): ReactElement {
    const {
        schema,
        value,
        onChange,
        labelPath,
        fieldKey,
        tenantId,
        activeLocale,
        renderAdornment,
        isTopLevel,
    } = props;
    const { field, optional } = useMemo(() => inferField(schema), [schema]);
    // Localized label + optional help via the field-meta channel.
    // TODO(SECTION_FIELD_META): thread sectionType down for per-section
    // label overrides once the override map gains entries.
    const fieldLocale = useResolvedEditorLocale(activeLocale);
    const label = resolveFieldLabel(undefined, fieldKey, fieldLocale);
    const help = resolveFieldHelp(undefined, fieldKey, fieldLocale);
    const path = labelPath.concat(fieldKey);
    const testIdBase = `auto-form-${path.join(".")}`;

    const adornment = useMemo(() => {
        if (!renderAdornment || !isTopLevel) return null;
        // Only show the adornment for fields we know how to override
        // cleanly: scalars + i18n. Arrays / nested objects intentionally
        // skipped (per audit Phase-3b scope).
        const eligible =
            field.kind === "string" ||
            field.kind === "number" ||
            field.kind === "boolean" ||
            field.kind === "enum" ||
            field.kind === "i18n_string";
        if (!eligible) return null;
        return renderAdornment(fieldKey, field.kind);
    }, [renderAdornment, isTopLevel, field.kind, fieldKey]);

    const wrap = (control: ReactElement): ReactElement => {
        const withHelp = help ? (
            <div className="space-y-1">
                {control}
                <p
                    data-testid={`${testIdBase}-help`}
                    className="text-[11px] leading-relaxed text-muted-foreground"
                >
                    {help}
                </p>
            </div>
        ) : (
            control
        );
        if (!adornment) return withHelp;
        return (
            <div
                // group/field lets the adornment reveal on hover anywhere
                // in the field cluster (3.4).
                className="group/field space-y-1"
                data-testid={`${testIdBase}-with-adornment`}
            >
                {adornment}
                {withHelp}
            </div>
        );
    };

    // Optional + currently unset → show "Set" affordance.
    if (optional && value === undefined && field.kind !== "i18n_string") {
        return wrap(
            <div
                className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-(--card-border) px-3 py-2"
                data-testid={`${testIdBase}-unset`}
            >
                <span className="text-sm text-muted-foreground">{label}</span>
                <button
                    type="button"
                    data-testid={`${testIdBase}-set`}
                    onClick={() => onChange(defaultValueForField(field))}
                    className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                    <Plus className="h-3 w-3" aria-hidden="true" />{" "}
                    {tx(STRINGS.auto_form.set, fieldLocale)}
                </button>
            </div>,
        );
    }

    // Reference fields get a picker instead of a text box, chosen by field
    // name (see lib/section-field-widgets.ts). This reads and writes exactly
    // the value the schema already declares, so no section schema changes and
    // no stored config is rewritten.
    const widget = resolveFieldWidget(fieldKey);
    if (widget) {
        const pickerTestId = `${testIdBase}-picker`;
        const picker =
            widget.kind === "product" ? (
                <ProductPickerField
                    label={label}
                    value={value}
                    onChange={onChange}
                    multiple={widget.multiple}
                    locale={fieldLocale}
                    testId={pickerTestId}
                />
            ) : widget.kind === "category" ? (
                <CategoryPickerField
                    label={label}
                    value={value}
                    onChange={onChange}
                    multiple={widget.multiple}
                    stores={widget.multiple ? "id" : widget.stores}
                    locale={fieldLocale}
                    testId={pickerTestId}
                />
            ) : (
                <LinkPickerField
                    label={label}
                    value={value}
                    onChange={onChange}
                    locale={fieldLocale}
                    testId={pickerTestId}
                />
            );
        return (
            <div className="space-y-1" data-testid={testIdBase}>
                {picker}
                {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
            </div>
        );
    }

    let control: ReactElement;
    switch (field.kind) {
        case "string":
            control = (
                <StringControl
                    label={label}
                    value={(value as string | undefined) ?? ""}
                    onChange={(v) => onChange(v === "" && optional ? undefined : v)}
                    hint={field.hint}
                    isUrl={field.isUrl}
                    optional={optional}
                    onClear={optional ? () => onChange(undefined) : undefined}
                    tenantId={tenantId}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "number":
            control = (
                <NumberControl
                    label={label}
                    value={value as number | undefined}
                    onChange={(v) => onChange(v)}
                    min={field.min}
                    max={field.max}
                    integer={field.integer}
                    optional={optional}
                    onClear={optional ? () => onChange(undefined) : undefined}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "boolean":
            control = (
                <BooleanControl
                    label={label}
                    value={value as boolean | undefined}
                    onChange={onChange}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "enum":
            control = (
                <EnumControl
                    label={label}
                    value={(value as string | undefined) ?? ""}
                    options={field.options}
                    onChange={onChange}
                    optional={optional}
                    onClear={optional ? () => onChange(undefined) : undefined}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "literal":
            control = (
                <input
                    type="hidden"
                    data-testid={`${testIdBase}-literal`}
                    value={String(field.value ?? "")}
                    readOnly
                />
            );
            break;
        case "i18n_string":
            control = (
                <I18nStringInput
                    label={label}
                    value={(value as I18nString | undefined) ?? {}}
                    onChange={(next) => onChange(next)}
                    testIdPrefix={testIdBase}
                    activeLocale={activeLocale}
                />
            );
            break;
        case "array":
            control = (
                <ArrayControl
                    label={label}
                    value={(value as unknown[] | undefined) ?? []}
                    element={field.element}
                    onChange={onChange}
                    labelPath={path}
                    tenantId={tenantId}
                    activeLocale={activeLocale}
                    testIdBase={testIdBase}
                />
            );
            break;
        case "object":
            control = (
                <ObjectControl
                    label={label}
                    shape={field.shape}
                    value={(value as Record<string, unknown> | undefined) ?? {}}
                    onChange={onChange}
                    labelPath={path}
                    tenantId={tenantId}
                    activeLocale={activeLocale}
                    testIdBase={testIdBase}
                />
            );
            break;
        default:
            control = (
                <div className="text-xs text-muted-foreground" data-testid={`${testIdBase}-unknown`}>
                    {tFormat(STRINGS.auto_form.unsupported_field, fieldLocale, { label })}
                </div>
            );
    }
    return wrap(control);
}

export function defaultValueForField(field: FieldShape): unknown {
    switch (field.kind) {
        case "string":
            return "";
        case "number":
            return 0;
        case "boolean":
            return false;
        case "enum":
            return field.options[0] ?? "";
        case "array":
            return [];
        case "object":
            return {};
        case "i18n_string":
            return {};
        default:
            return undefined;
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Controls                                                             */
/* ─────────────────────────────────────────────────────────────────── */

interface FieldHeaderProps {
    label: string;
    onClear?: () => void;
    testIdBase: string;
}

export function FieldHeader({ label, onClear, testIdBase }: FieldHeaderProps): ReactElement {
    const locale = useResolvedEditorLocale();
    return (
        <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium">{label}</label>
            {onClear && (
                <button
                    type="button"
                    data-testid={`${testIdBase}-clear`}
                    onClick={onClear}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                    {tx(STRINGS.auto_form.clear, locale)}
                </button>
            )}
        </div>
    );
}

interface StringControlProps {
    label: string;
    value: string;
    onChange: (next: string) => void;
    hint?: string;
    isUrl?: boolean;
    optional: boolean;
    onClear?: () => void;
    tenantId?: string;
    testIdBase: string;
}

export function StringControl(p: StringControlProps): ReactElement {
    if (p.hint === "image") {
        return (
            <ImageControl
                label={p.label}
                value={p.value}
                onChange={p.onChange}
                tenantId={p.tenantId}
                onClear={p.onClear}
                testIdBase={p.testIdBase}
            />
        );
    }
    if (p.hint === "color") {
        return (
            <ColorControl
                label={p.label}
                value={p.value}
                onChange={p.onChange}
                onClear={p.onClear}
                testIdBase={p.testIdBase}
            />
        );
    }
    if (p.hint === "multiline") {
        return (
            <div className="space-y-1.5">
                <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
                <textarea
                    data-testid={`${p.testIdBase}-textarea`}
                    value={p.value}
                    onChange={(e) => p.onChange(e.target.value)}
                    rows={3}
                    className={cn(
                        "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                        "transition-colors resize-y min-h-[88px]",
                    )}
                />
            </div>
        );
    }
    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            <input
                type={p.isUrl ? "url" : "text"}
                data-testid={`${p.testIdBase}-input`}
                value={p.value}
                onChange={(e) => p.onChange(e.target.value)}
                className={cn(
                    "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                    "transition-colors",
                )}
            />
        </div>
    );
}

interface ColorControlProps {
    label: string;
    value: string;
    onChange: (next: string) => void;
    onClear?: () => void;
    testIdBase: string;
}

export function ColorControl(p: ColorControlProps): ReactElement {
    const hex = p.value || "#000000";
    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    data-testid={`${p.testIdBase}-color`}
                    value={hex}
                    onChange={(e) => p.onChange(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border border-(--card-border) bg-transparent"
                    aria-label={`${p.label} color`}
                />
                <input
                    type="text"
                    data-testid={`${p.testIdBase}-hex`}
                    value={p.value}
                    onChange={(e) => p.onChange(e.target.value)}
                    placeholder="#000000"
                    className={cn(
                        "flex-1 rounded-xl border border-(--card-border) bg-background px-3.5 py-2 font-mono text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                    )}
                />
            </div>
        </div>
    );
}

interface ImageControlProps {
    label: string;
    value: string;
    onChange: (next: string) => void;
    tenantId?: string;
    onClear?: () => void;
    testIdBase: string;
}

export function ImageControl(p: ImageControlProps): ReactElement {
    const imageLocale = useResolvedEditorLocale();
    const [uploading, setUploading] = useState<boolean>(false);

    const handleUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!p.tenantId) {
                toast.error("Missing tenant context for upload");
                return;
            }
            const max = 4 * 1024 * 1024;
            if (file.size > max) {
                toast.error(`${p.label} must be under 4MB`);
                return;
            }
            const ext = file.name.split(".").pop()?.toLowerCase() || "png";
            const path = `${p.tenantId}/section-${Date.now()}.${ext}`;
            setUploading(true);
            try {
                const { error } = await supabase.storage
                    .from("tenant-assets")
                    .upload(path, file, { upsert: true });
                if (error) throw error;
                const {
                    data: { publicUrl },
                } = supabase.storage.from("tenant-assets").getPublicUrl(path);
                p.onChange(publicUrl);
                toast.success(`${p.label} uploaded`);
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Upload failed";
                toast.error("Upload failed", msg);
            } finally {
                setUploading(false);
            }
        },
        [p],
    );

    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            <div className="flex items-stretch gap-3">
                <div
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-(--card-border) bg-muted/30"
                    data-testid={`${p.testIdBase}-preview`}
                >
                    {p.value ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.value} alt={p.label} className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-4 w-4" aria-hidden="true" />
                        </div>
                    )}
                </div>
                <label
                    className={cn(
                        "flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-(--card-border) px-3 py-2 text-center transition-colors",
                        "hover:border-primary/50 hover:bg-primary/5",
                        uploading && "pointer-events-none opacity-60",
                    )}
                >
                    {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                        <Upload className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-[11px] text-muted-foreground">
                        {uploading
                            ? tx(STRINGS.auto_form.uploading, imageLocale)
                            : tx(STRINGS.auto_form.upload_image, imageLocale)}
                    </span>
                    <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        data-testid={`${p.testIdBase}-upload`}
                        onChange={handleUpload}
                    />
                </label>
            </div>
            <input
                type="url"
                data-testid={`${p.testIdBase}-url`}
                value={p.value}
                onChange={(e) => p.onChange(e.target.value)}
                placeholder={tx(STRINGS.auto_form.image_url_placeholder, imageLocale)}
                className={cn(
                    "w-full rounded-xl border border-(--card-border) bg-background px-3.5 py-2 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                )}
            />
        </div>
    );
}

interface NumberControlProps {
    label: string;
    value: number | undefined;
    onChange: (next: number | undefined) => void;
    min?: number;
    max?: number;
    integer?: boolean;
    optional: boolean;
    onClear?: () => void;
    testIdBase: string;
}

export function NumberControl(p: NumberControlProps): ReactElement {
    const locale = useResolvedEditorLocale();
    // A bounded range (both min + max) gets a slider for fast, in-range
    // adjustment (C7). Step is 1 for integers, else a fine fraction so 0–1
    // ratios (e.g. opacity) feel continuous.
    const bounded = p.min !== undefined && p.max !== undefined;
    const span = bounded ? (p.max as number) - (p.min as number) : 0;
    const step = p.integer ? 1 : span > 0 && span <= 2 ? 0.01 : 1;
    const commit = (raw: string): void => {
        if (raw === "") {
            // C12: clearing a required number snaps to the min (not a silent 0,
            // which can mean "hide everything"); optional clears to undefined.
            p.onChange(p.optional ? undefined : (p.min ?? 0));
            return;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) p.onChange(n);
    };

    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            <div className={cn("flex items-center gap-3")}>
                {bounded && (
                    <input
                        type="range"
                        data-testid={`${p.testIdBase}-slider`}
                        aria-label={p.label}
                        min={p.min}
                        max={p.max}
                        step={step}
                        value={p.value ?? p.min}
                        onChange={(e) => p.onChange(Number(e.target.value))}
                        className="flex-1 accent-(--bk-primary,#ec4899)"
                    />
                )}
                <input
                    type="number"
                    data-testid={`${p.testIdBase}-input`}
                    value={p.value ?? ""}
                    min={p.min}
                    max={p.max}
                    step={step}
                    onChange={(e) => commit(e.target.value)}
                    className={cn(
                        "rounded-xl border border-(--card-border) bg-background px-3.5 py-2.5 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                        bounded ? "w-20 shrink-0 text-center" : "w-full",
                    )}
                />
            </div>
            {(p.min !== undefined || p.max !== undefined) && (
                <p className="text-[11px] text-muted-foreground">
                    {p.min !== undefined && p.max !== undefined
                        ? tFormat(STRINGS.auto_form.range_hint, locale, { min: p.min, max: p.max })
                        : p.min !== undefined
                          ? tFormat(STRINGS.auto_form.min_hint, locale, { min: p.min })
                          : tFormat(STRINGS.auto_form.max_hint, locale, { max: p.max ?? "" })}
                </p>
            )}
        </div>
    );
}

interface BooleanControlProps {
    label: string;
    value: boolean | undefined;
    onChange: (next: boolean) => void;
    testIdBase: string;
}

export function BooleanControl(p: BooleanControlProps): ReactElement {
    const on = !!p.value;
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-(--card-border) bg-(--card-bg) px-3 py-2">
            <label className="text-sm font-medium">{p.label}</label>
            <button
                type="button"
                role="switch"
                aria-checked={on}
                data-testid={`${p.testIdBase}-switch`}
                onClick={() => p.onChange(!on)}
                className={cn(
                    "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                    on ? "bg-primary" : "bg-muted",
                )}
            >
                <span
                    className={cn(
                        "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                        on ? "translate-x-[18px]" : "translate-x-0.5",
                    )}
                />
            </button>
        </div>
    );
}

interface EnumControlProps {
    label: string;
    value: string;
    options: string[];
    onChange: (next: string) => void;
    optional: boolean;
    onClear?: () => void;
    testIdBase: string;
}

export function EnumControl(p: EnumControlProps): ReactElement {
    const locale = useResolvedEditorLocale();
    const useSegmented = p.options.length > 0 && p.options.length <= 4;
    return (
        <div className="space-y-1.5">
            <FieldHeader label={p.label} onClear={p.onClear} testIdBase={p.testIdBase} />
            {useSegmented ? (
                <div
                    role="radiogroup"
                    aria-label={p.label}
                    data-testid={`${p.testIdBase}-segmented`}
                    className="inline-flex w-full rounded-xl border border-(--card-border) bg-(--card-bg) p-1"
                >
                    {p.options.map((opt) => {
                        const active = opt === p.value;
                        return (
                            <button
                                key={opt}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                data-testid={`${p.testIdBase}-option-${opt}`}
                                onClick={() => p.onChange(opt)}
                                className={cn(
                                    "flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                                    active
                                        ? "bg-foreground text-background"
                                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                                )}
                            >
                                {resolveEnumValueLabel(opt, locale)}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <select
                    data-testid={`${p.testIdBase}-select`}
                    value={p.value}
                    onChange={(e) => p.onChange(e.target.value)}
                    className={cn(
                        "w-full rounded-xl border border-(--card-border) bg-background px-3 py-2.5 text-sm",
                        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                    )}
                >
                    {p.options.map((opt) => (
                        <option key={opt} value={opt}>
                            {resolveEnumValueLabel(opt, locale)}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}

interface ArrayControlProps {
    label: string;
    value: unknown[];
    element: z.ZodType<unknown>;
    onChange: (next: unknown[]) => void;
    labelPath: string[];
    tenantId?: string;
    activeLocale?: LocaleCode;
    testIdBase: string;
}

export function ArrayControl(p: ArrayControlProps): ReactElement {
    const arrayLocale = useResolvedEditorLocale(p.activeLocale);
    const handleAdd = useCallback((): void => {
        const { field } = inferField(p.element);
        const fresh = defaultValueForField(field);
        p.onChange([...p.value, fresh]);
    }, [p]);

    const handleRemove = useCallback(
        (index: number): void => {
            const next = p.value.slice();
            next.splice(index, 1);
            p.onChange(next);
        },
        [p],
    );

    const handleMove = useCallback(
        (from: number, to: number): void => {
            if (to < 0 || to >= p.value.length) return;
            const next = p.value.slice();
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            p.onChange(next);
        },
        [p],
    );

    const updateItem = useCallback(
        (index: number, val: unknown): void => {
            const next = p.value.slice();
            next[index] = val;
            p.onChange(next);
        },
        [p],
    );

    const handleDuplicate = useCallback(
        (index: number): void => {
            const next = p.value.slice();
            const clone = JSON.parse(JSON.stringify(next[index])) as unknown;
            next.splice(index + 1, 0, clone);
            p.onChange(next);
        },
        [p],
    );

    // C8: items collapse by default — a 6-item testimonials list reads as
    // six labeled cards, not an endless form. A freshly-added item opens
    // so the merchant can fill it immediately.
    const [openItems, setOpenItems] = useState<Set<number>>(() => new Set());
    const toggleItem = (i: number): void => {
        setOpenItems((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });
    };
    const handleAddOpen = useCallback((): void => {
        handleAdd();
        setOpenItems((prev) => new Set(prev).add(p.value.length));
    }, [handleAdd, p.value.length]);

    return (
        <div className="space-y-2" data-testid={`${p.testIdBase}-array`}>
            <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">
                    {p.label}{" "}
                    <span className="text-[11px] font-normal text-muted-foreground">
                        ({p.value.length})
                    </span>
                </label>
                <button
                    type="button"
                    data-testid={`${p.testIdBase}-add`}
                    onClick={handleAddOpen}
                    className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                    <Plus className="h-3 w-3" aria-hidden="true" />{" "}
                    {tx(STRINGS.auto_form.add, arrayLocale)}
                </button>
            </div>
            {p.value.length === 0 ? (
                <div
                    data-testid={`${p.testIdBase}-empty`}
                    className="rounded-xl border border-dashed border-(--card-border) px-3 py-4 text-center text-[11px] text-muted-foreground"
                >
                    {tx(STRINGS.auto_form.no_items, arrayLocale)}
                </div>
            ) : (
                <ul className="flex flex-col gap-2">
                    {p.value.map((item, i) => {
                        const isOpen = openItems.has(i);
                        const summary = summarizeArrayItem(item, arrayLocale);
                        return (
                        <li
                            key={i}
                            data-testid={`${p.testIdBase}-item-${i}`}
                            data-open={isOpen ? "true" : "false"}
                            className="rounded-xl border border-(--card-border) bg-(--card-bg) p-2"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    aria-expanded={isOpen}
                                    aria-label={tx(
                                        isOpen
                                            ? STRINGS.auto_form.collapse_item
                                            : STRINGS.auto_form.expand_item,
                                        arrayLocale,
                                    )}
                                    data-testid={`${p.testIdBase}-item-${i}-toggle`}
                                    onClick={() => toggleItem(i)}
                                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12px] font-semibold text-foreground/85 transition-colors hover:text-foreground"
                                >
                                    <GripVertical
                                        className="h-3 w-3 shrink-0 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                    <span className="truncate">
                                        {summary ??
                                            tFormat(STRINGS.auto_form.item_n, arrayLocale, {
                                                n: i + 1,
                                            })}
                                    </span>
                                    <span
                                        aria-hidden="true"
                                        className="text-[10px] text-muted-foreground"
                                    >
                                        {isOpen ? "▾" : "▸"}
                                    </span>
                                </button>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button
                                        type="button"
                                        aria-label={tx(STRINGS.auto_form.move_up, arrayLocale)}
                                        data-testid={`${p.testIdBase}-item-${i}-up`}
                                        disabled={i === 0}
                                        onClick={() => handleMove(i, i - 1)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={tx(STRINGS.auto_form.move_down, arrayLocale)}
                                        data-testid={`${p.testIdBase}-item-${i}-down`}
                                        disabled={i === p.value.length - 1}
                                        onClick={() => handleMove(i, i + 1)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={tx(STRINGS.auto_form.duplicate_item, arrayLocale)}
                                        title={tx(STRINGS.auto_form.duplicate_item, arrayLocale)}
                                        data-testid={`${p.testIdBase}-item-${i}-duplicate`}
                                        onClick={() => handleDuplicate(i)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                                    >
                                        <CopyIcon className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={tx(STRINGS.auto_form.remove_item, arrayLocale)}
                                        data-testid={`${p.testIdBase}-item-${i}-remove`}
                                        onClick={() => handleRemove(i)}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded text-destructive transition-colors hover:bg-destructive/10"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                            {isOpen && (
                                <div className="mt-2">
                                    <FieldRenderer
                                        schema={p.element}
                                        value={item}
                                        onChange={(v) => updateItem(i, v)}
                                        labelPath={p.labelPath}
                                        fieldKey={`item_${i}`}
                                        tenantId={p.tenantId}
                                        activeLocale={p.activeLocale}
                                    />
                                </div>
                            )}
                        </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

/**
 * C8: derive a human summary for a repeater item from its first
 * text-carrying field (i18n title/question/quote/name…), so the
 * collapsed row reads "وصلني بنفس اليوم…" instead of "Item 2".
 */
const SUMMARY_KEYS = [
    "title_i18n",
    "heading_i18n",
    "label_i18n",
    "q_i18n",
    "quote_i18n",
    "name_i18n",
    "text_i18n",
    "body_i18n",
    "author_name",
    "name",
    "label",
    "title",
] as const;

export function summarizeArrayItem(item: unknown, locale: LocaleCode): string | null {
    if (!item || typeof item !== "object") {
        return typeof item === "string" && item.trim() ? truncate(item) : null;
    }
    const rec = item as Record<string, unknown>;
    for (const key of SUMMARY_KEYS) {
        const v = rec[key];
        if (typeof v === "string" && v.trim()) return truncate(v);
        if (v && typeof v === "object") {
            const i18n = v as Record<string, unknown>;
            const s = i18n[locale] ?? i18n.en ?? i18n.ar;
            if (typeof s === "string" && s.trim()) return truncate(s);
        }
    }
    return null;
}

function truncate(s: string): string {
    const trimmed = s.trim();
    return trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;
}

interface ObjectControlProps {
    label: string;
    shape: Record<string, z.ZodType<unknown>>;
    value: Record<string, unknown>;
    onChange: (next: Record<string, unknown>) => void;
    labelPath: string[];
    tenantId?: string;
    activeLocale?: LocaleCode;
    testIdBase: string;
}

export function ObjectControl(p: ObjectControlProps): ReactElement {
    const fields = Object.keys(p.shape);
    const isRoot = p.testIdBase === "auto-form-root";
    const isInline = fields.length < 2;
    const [open, setOpen] = useState<boolean>(true);

    const handleField = useCallback(
        (key: string, next: unknown): void => {
            const merged = { ...p.value, [key]: next };
            // Strip undefined keys for cleanliness when the field is optional
            // and the user cleared it.
            if (next === undefined) {
                delete merged[key];
            }
            p.onChange(merged);
        },
        [p],
    );

    const body = (
        <div className="flex flex-col gap-3">
            {fields.map((key) => (
                <FieldRenderer
                    key={key}
                    schema={p.shape[key]}
                    value={p.value[key]}
                    onChange={(v) => handleField(key, v)}
                    labelPath={p.labelPath}
                    fieldKey={key}
                    tenantId={p.tenantId}
                    activeLocale={p.activeLocale}
                />
            ))}
        </div>
    );

    if (isRoot) return body;
    if (isInline) return body;

    return (
        <section
            data-testid={`${p.testIdBase}-object`}
            className="rounded-xl border border-(--card-border) bg-(--card-bg)"
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                data-testid={`${p.testIdBase}-toggle`}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
                <span className="text-sm font-semibold">{p.label}</span>
                {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
            </button>
            {open && (
                <div className="border-t border-(--card-border) px-3 py-3">{body}</div>
            )}
        </section>
    );
}

