"use client";

import { useState } from "react";
import { Eye, ChevronDown, Check, X } from "lucide-react";
import type {
    AudienceSegment,
    Experiment,
    GovernorateCode,
} from "@scheniders/shared";
import { IRAQ_GOVERNORATES } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

export interface PreviewAsState {
    governorate?: GovernorateCode;
    segments: string[];
    ab_arms: Record<string, string>;
}

export const EMPTY_PREVIEW_AS: PreviewAsState = {
    governorate: undefined,
    segments: [],
    ab_arms: {},
};

export interface PreviewAsControlsProps {
    value: PreviewAsState;
    onChange: (next: PreviewAsState) => void;
    segments: AudienceSegment[];
    experiments: Experiment[];
}

export function PreviewAsControls({
    value,
    onChange,
    segments,
    experiments,
}: PreviewAsControlsProps) {
    const locale = useEditorLocale();
    const [open, setOpen] = useState(false);

    const activeCount =
        (value.governorate ? 1 : 0) +
        value.segments.length +
        Object.keys(value.ab_arms).length;

    const setGovernorate = (g: GovernorateCode | undefined) =>
        onChange({ ...value, governorate: g });

    const toggleSegment = (id: string) => {
        const has = value.segments.includes(id);
        onChange({
            ...value,
            segments: has
                ? value.segments.filter((s) => s !== id)
                : [...value.segments, id],
        });
    };

    const setArm = (experimentId: string, arm: string | null) => {
        const next = { ...value.ab_arms };
        if (arm === null) delete next[experimentId];
        else next[experimentId] = arm;
        onChange({ ...value, ab_arms: next });
    };

    const reset = () => onChange(EMPTY_PREVIEW_AS);

    return (
        <div className="relative">
            <button
                type="button"
                data-testid="preview-as-button"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors",
                    activeCount > 0
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-(--card-border) bg-(--card-bg) text-muted-foreground hover:text-foreground",
                )}
                aria-expanded={open}
            >
                <Eye className="h-3.5 w-3.5" />
                <span>{t(STRINGS.preview_as.button, locale)}</span>
                {activeCount > 0 && (
                    <span
                        data-testid="preview-as-count"
                        className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground"
                    >
                        {activeCount}
                    </span>
                )}
                <ChevronDown className="h-3 w-3" />
            </button>

            {open && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        data-testid="preview-as-popover"
                        className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-(--card-border) bg-(--card-bg) p-3 shadow-lg"
                    >
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
                                {t(STRINGS.preview_as.heading, locale)}
                            </span>
                            {activeCount > 0 && (
                                <button
                                    type="button"
                                    data-testid="preview-as-reset"
                                    onClick={reset}
                                    className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3 w-3" />
                                    {t(STRINGS.preview_as.reset, locale)}
                                </button>
                            )}
                        </div>

                        {/* Governorate */}
                        <div className="mb-3">
                            <label className="mb-1 block text-[11px] font-medium text-foreground/80">
                                {t(STRINGS.preview_as.governorate, locale)}
                            </label>
                            <select
                                data-testid="preview-as-governorate"
                                value={value.governorate ?? ""}
                                onChange={(e) =>
                                    setGovernorate(
                                        e.target.value === ""
                                            ? undefined
                                            : (e.target.value as GovernorateCode),
                                    )
                                }
                                className="w-full rounded-md border border-(--card-border) bg-background px-2 py-1 text-xs"
                            >
                                <option value="">{t(STRINGS.preview_as.any, locale)}</option>
                                {IRAQ_GOVERNORATES.map((g) => (
                                    <option key={g.code} value={g.code}>
                                        {g.name} ({g.code})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Segments */}
                        <div className="mb-3">
                            <label className="mb-1 block text-[11px] font-medium text-foreground/80">
                                {t(STRINGS.preview_as.segments, locale)}
                            </label>
                            {segments.length === 0 ? (
                                <p className="text-[11px] italic text-muted-foreground">
                                    {t(STRINGS.preview_as.no_segments, locale)}
                                </p>
                            ) : (
                                <div className="space-y-1">
                                    {segments.map((s) => {
                                        const active = value.segments.includes(s.id);
                                        return (
                                            <button
                                                key={s.id}
                                                type="button"
                                                data-testid={`preview-as-segment-${s.id}`}
                                                onClick={() => toggleSegment(s.id)}
                                                className={cn(
                                                    "flex w-full items-center justify-between rounded-md px-2 py-1 text-xs transition-colors",
                                                    active
                                                        ? "bg-primary/10 text-primary"
                                                        : "text-foreground hover:bg-muted/50",
                                                )}
                                            >
                                                <span className="truncate">{s.name}</span>
                                                {active && <Check className="h-3 w-3" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* AB arms */}
                        <div>
                            <label className="mb-1 block text-[11px] font-medium text-foreground/80">
                                {t(STRINGS.preview_as.ab_experiments, locale)}
                            </label>
                            {experiments.length === 0 ? (
                                <p className="text-[11px] italic text-muted-foreground">
                                    {t(STRINGS.preview_as.no_experiments, locale)}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {experiments.map((exp) => {
                                        const arm = value.ab_arms[exp.id];
                                        return (
                                            <div key={exp.id}>
                                                <div className="mb-0.5 truncate text-[11px] font-medium">
                                                    {exp.name}
                                                </div>
                                                <select
                                                    data-testid={`preview-as-arm-${exp.id}`}
                                                    value={arm ?? ""}
                                                    onChange={(e) =>
                                                        setArm(
                                                            exp.id,
                                                            e.target.value === ""
                                                                ? null
                                                                : e.target.value,
                                                        )
                                                    }
                                                    className="w-full rounded-md border border-(--card-border) bg-background px-2 py-1 text-xs"
                                                >
                                                    <option value="">{t(STRINGS.preview_as.auto, locale)}</option>
                                                    {exp.arms.map((a) => (
                                                        <option key={a.id} value={a.id}>
                                                            {a.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
