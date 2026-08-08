"use client";

// =====================================================================
// AutoForm breakpoint override UI (extracted from auto-form, 4.3)
// =====================================================================
// The per-field breakpoint adornment (hover-revealed) and the override
// editor it opens. Writes through @/lib/responsive-overrides.
// =====================================================================

import { useCallback, useState, type ReactElement } from "react";
import {
    Monitor as MonitorIcon,
    Smartphone as SmartphoneIcon,
    Tablet as TabletIcon,
} from "lucide-react";
import type { Breakpoint, I18nString, SectionInstance } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t as tx, tFormat, type EditorString } from "@/lib/editor-i18n";
import { useResolvedEditorLocale } from "@/lib/editor-locale-context";
import {
    clearBreakpointOverride,
    getBreakpointOverride,
    hasBreakpointOverride,
    setBreakpointOverride,
} from "@/lib/responsive-overrides";
import { I18nStringInput } from "./i18n-string-input";
import type { FieldShape } from "./auto-form-schema";

/* ─────────────────────────────────────────────────────────────────── */
/* Breakpoint adornment                                                 */
/* ─────────────────────────────────────────────────────────────────── */

interface BreakpointAdornmentProps {
    fieldKey: string;
    fieldKind: FieldShape["kind"];
    instance: SectionInstance;
    onInstanceChange: (next: SectionInstance) => void;
    activeBreakpoint: Breakpoint;
}

const BP_ORDER: Breakpoint[] = ["mobile", "tablet", "desktop"];

export function BpIcon({
    breakpoint,
    className,
}: {
    breakpoint: Breakpoint;
    className?: string;
}): ReactElement {
    const cls = cn("h-3.5 w-3.5", className);
    if (breakpoint === "mobile") return <SmartphoneIcon className={cls} aria-hidden="true" />;
    if (breakpoint === "tablet") return <TabletIcon className={cls} aria-hidden="true" />;
    return <MonitorIcon className={cls} aria-hidden="true" />;
}

export function BreakpointAdornment(p: BreakpointAdornmentProps): ReactElement {
    const [openBp, setOpenBp] = useState<Breakpoint | null>(null);

    const baseValue = (p.instance.base as Record<string, unknown>)?.[p.fieldKey];

    const handleToggle = useCallback(
        (bp: Breakpoint): void => {
            // Open the per-breakpoint editor whether or not an override
            // already exists — clicking again toggles it back closed.
            setOpenBp((cur) => (cur === bp ? null : bp));
        },
        [],
    );

    const handleSet = useCallback(
        (bp: Breakpoint, value: unknown): void => {
            p.onInstanceChange(
                setBreakpointOverride(p.instance, bp, p.fieldKey, value),
            );
        },
        [p],
    );

    const handleClear = useCallback(
        (bp: Breakpoint): void => {
            p.onInstanceChange(
                clearBreakpointOverride(p.instance, bp, p.fieldKey),
            );
            setOpenBp(null);
        },
        [p],
    );

    // 3.4: quiet by default. The icon strip only materializes on hover /
    // focus of the field cluster — unless an override exists or its
    // editor is open (active state must never hide).
    const hasAnyOverride = BP_ORDER.some((bp) =>
        hasBreakpointOverride(p.instance, bp, p.fieldKey),
    );
    const alwaysVisible = hasAnyOverride || openBp !== null;

    return (
        <div
            data-testid={`bp-adornment-${p.fieldKey}`}
            data-always-visible={alwaysVisible ? "true" : "false"}
            className={cn(
                "flex flex-col gap-1 transition-opacity duration-150",
                !alwaysVisible &&
                    "opacity-0 focus-within:opacity-100 group-hover/field:opacity-100",
            )}
        >
            <div className="flex items-center justify-end gap-1">
                {BP_ORDER.map((bp) => {
                    const hasOverride = hasBreakpointOverride(p.instance, bp, p.fieldKey);
                    const isActive = p.activeBreakpoint === bp;
                    const isOpen = openBp === bp;
                    return (
                        <button
                            key={bp}
                            type="button"
                            data-testid={`bp-adornment-${p.fieldKey}-${bp}`}
                            data-has-override={hasOverride ? "true" : "false"}
                            aria-pressed={isOpen}
                            aria-label={`${bp} override for ${p.fieldKey}`}
                            onClick={() => handleToggle(bp)}
                            className={cn(
                                "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
                                hasOverride
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-(--card-border) bg-(--card-bg) text-muted-foreground hover:text-foreground",
                                isOpen && "ring-2 ring-primary/30",
                                isActive && !hasOverride && "text-foreground",
                            )}
                            title={
                                hasOverride
                                    ? `${bp} override active`
                                    : `Add ${bp} override`
                            }
                        >
                            <BpIcon breakpoint={bp} />
                        </button>
                    );
                })}
            </div>
            {openBp && (
                <BreakpointOverrideEditor
                    breakpoint={openBp}
                    fieldKey={p.fieldKey}
                    fieldKind={p.fieldKind}
                    baseValue={baseValue}
                    currentValue={getBreakpointOverride(p.instance, openBp, p.fieldKey)}
                    onSet={(v) => handleSet(openBp, v)}
                    onClear={() => handleClear(openBp)}
                />
            )}
        </div>
    );
}

const BP_LABELS: Record<Breakpoint, EditorString> = {
    mobile: STRINGS.toolbar.breakpoint_mobile,
    tablet: STRINGS.toolbar.breakpoint_tablet,
    desktop: STRINGS.toolbar.breakpoint_desktop,
};

interface BreakpointOverrideEditorProps {
    breakpoint: Breakpoint;
    fieldKey: string;
    fieldKind: FieldShape["kind"];
    baseValue: unknown;
    currentValue: unknown;
    onSet: (value: unknown) => void;
    onClear: () => void;
}

export function BreakpointOverrideEditor(p: BreakpointOverrideEditorProps): ReactElement {
    const locale = useResolvedEditorLocale();
    const isSet = p.currentValue !== undefined;

    let editor: ReactElement;
    switch (p.fieldKind) {
        case "string":
            editor = (
                <input
                    type="text"
                    data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}-input`}
                    defaultValue={(p.currentValue as string | undefined) ?? ""}
                    placeholder={
                        typeof p.baseValue === "string" ? p.baseValue : ""
                    }
                    onBlur={(e) => {
                        const v = e.target.value;
                        if (v.length === 0) {
                            p.onClear();
                        } else {
                            p.onSet(v);
                        }
                    }}
                    className="w-full rounded-md border border-(--card-border) bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            );
            break;
        case "number":
            editor = (
                <input
                    type="number"
                    data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}-input`}
                    defaultValue={(p.currentValue as number | undefined) ?? ""}
                    onBlur={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                            p.onClear();
                            return;
                        }
                        const n = Number(v);
                        if (Number.isFinite(n)) p.onSet(n);
                    }}
                    className="w-full rounded-md border border-(--card-border) bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            );
            break;
        case "boolean":
            editor = (
                <button
                    type="button"
                    data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}-toggle`}
                    onClick={() => p.onSet(!Boolean(p.currentValue ?? p.baseValue))}
                    className="rounded-md border border-(--card-border) bg-background px-2.5 py-1.5 text-xs font-semibold"
                >
                    {String(p.currentValue ?? p.baseValue ?? false)}
                </button>
            );
            break;
        case "i18n_string": {
            // BUG18 fix: render the full trilingual input instead of a bare
            // `en` field — an Arabic-first merchant must be able to set a
            // mobile-specific Arabic string. Clearing every locale clears
            // the override entirely.
            const cur = (p.currentValue as I18nString | undefined) ?? {};
            editor = (
                <I18nStringInput
                    label=""
                    value={cur}
                    onChange={(next) => {
                        const hasAny = Object.values(next ?? {}).some(
                            (v) => typeof v === "string" && v.length > 0,
                        );
                        if (hasAny) {
                            p.onSet(next);
                        } else {
                            p.onClear();
                        }
                    }}
                    placeholder={
                        (p.baseValue as I18nString | undefined)?.[locale] ??
                        (p.baseValue as I18nString | undefined)?.en ??
                        ""
                    }
                    activeLocale={locale}
                    testIdPrefix={`bp-override-${p.fieldKey}-${p.breakpoint}-i18n`}
                />
            );
            break;
        }
        default:
            editor = (
                <span className="text-[11px] text-muted-foreground">
                    {tx(STRINGS.auto_form.bp_unavailable, locale)}
                </span>
            );
    }

    return (
        <div
            data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}`}
            className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2"
        >
            <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {tFormat(STRINGS.auto_form.bp_override_label, locale, {
                        bp: tx(BP_LABELS[p.breakpoint], locale),
                    })}
                </span>
                {isSet && (
                    <button
                        type="button"
                        data-testid={`bp-override-${p.fieldKey}-${p.breakpoint}-clear`}
                        onClick={p.onClear}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        {tx(STRINGS.auto_form.bp_use_base, locale)}
                    </button>
                )}
            </div>
            {editor}
        </div>
    );
}

