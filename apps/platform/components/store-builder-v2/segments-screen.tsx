"use client";

// =====================================================================
// SegmentsScreen — settings screen for `config.segments`
// =====================================================================
// Two-pane layout: list of audience segments on the left, an editor on
// the right when one is selected. Each segment is a name + description +
// combine ("all"/"any") + a list of rules (8 possible kinds). The editor
// mutates the in-memory StoreConfigV2; the existing 2s debounced
// auto-save persists to `store_config_v2_draft`.
//
// Variants reference segments via `conditions[].kind === "audience" &&
// segment_id === <id>`. Deleting a referenced segment shows a two-step
// warning so merchants understand the downstream impact.
// =====================================================================

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactElement,
} from "react";
import {
    AlertCircle,
    Check,
    ChevronLeft,
    Plus,
    Target,
    Trash2,
    X,
} from "lucide-react";
import {
    IRAQ_GOVERNORATES,
    type AudienceSegment,
    type Breakpoint,
    type GovernorateCode,
    type SegmentRule,
} from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

/* ─────────────────────────────────────────────────────────────────── */
/* Constants                                                            */
/* ─────────────────────────────────────────────────────────────────── */

const TRAFFIC_SOURCES = ["meta", "tiktok", "google", "whatsapp", "direct"] as const;
type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

const DEVICES: Breakpoint[] = ["mobile", "tablet", "desktop"];

const RULE_KIND_LABELS: Record<SegmentRule["kind"], string> = {
    first_visit: "First visit",
    returning_visitor: "Returning visitor",
    has_ordered_before: "Has ordered before",
    cart_total: "Cart total",
    abandoned_cart: "Abandoned cart",
    governorate: "Governorate",
    traffic_source: "Traffic source",
    device: "Device",
};

const ALL_RULE_KINDS: SegmentRule["kind"][] = [
    "first_visit",
    "returning_visitor",
    "has_ordered_before",
    "cart_total",
    "abandoned_cart",
    "governorate",
    "traffic_source",
    "device",
];

/* ─────────────────────────────────────────────────────────────────── */
/* Props                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export interface SegmentsScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Defaults for new rules                                               */
/* ─────────────────────────────────────────────────────────────────── */

function defaultRule(kind: SegmentRule["kind"]): SegmentRule {
    switch (kind) {
        case "first_visit":
            return { kind: "first_visit" };
        case "returning_visitor":
            return { kind: "returning_visitor" };
        case "has_ordered_before":
            return { kind: "has_ordered_before" };
        case "cart_total":
            return { kind: "cart_total", op: ">=", value_iqd: 50_000 };
        case "abandoned_cart":
            return { kind: "abandoned_cart", minutes_since: 30 };
        case "governorate":
            return { kind: "governorate", values: [] };
        case "traffic_source":
            return { kind: "traffic_source", values: [] };
        case "device":
            return { kind: "device", values: [] };
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function SegmentsScreen({
    builder,
    onClose,
}: SegmentsScreenProps): ReactElement {
    const locale = useEditorLocale();
    const segments = builder.config.segments;

    const [selectedId, setSelectedId] = useState<string | null>(
        segments[0]?.id ?? null,
    );
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [acknowledgedRefs, setAcknowledgedRefs] = useState<boolean>(false);
    const [addRuleOpen, setAddRuleOpen] = useState<boolean>(false);

    // Auto-select first segment when list grows from empty.
    useEffect(() => {
        if (selectedId && segments.find((s) => s.id === selectedId)) return;
        setSelectedId(segments[0]?.id ?? null);
    }, [segments, selectedId]);

    const selected = useMemo<AudienceSegment | null>(
        () => segments.find((s) => s.id === selectedId) ?? null,
        [segments, selectedId],
    );

    const handleCreate = useCallback((): void => {
        const seg = builder.createSegment({
            name: "New segment",
            description: "",
            rules: [],
            combine: "all",
        });
        setSelectedId(seg.id);
        setAcknowledgedRefs(false);
    }, [builder]);

    const handlePatch = useCallback(
        (patch: Partial<AudienceSegment>): void => {
            if (!selected) return;
            builder.updateSegment(selected.id, patch);
        },
        [builder, selected],
    );

    const handleDelete = useCallback((): void => {
        if (!confirmDeleteId) return;
        const refs = builder.findSegmentReferences(confirmDeleteId);
        if (refs.length > 0 && !acknowledgedRefs) {
            setAcknowledgedRefs(true);
            return;
        }
        builder.deleteSegment(confirmDeleteId);
        setConfirmDeleteId(null);
        setAcknowledgedRefs(false);
    }, [acknowledgedRefs, builder, confirmDeleteId]);

    const handleAddRule = useCallback(
        (kind: SegmentRule["kind"]): void => {
            if (!selected) return;
            const nextRules: SegmentRule[] = [...selected.rules, defaultRule(kind)];
            handlePatch({ rules: nextRules });
            setAddRuleOpen(false);
        },
        [handlePatch, selected],
    );

    const handleUpdateRule = useCallback(
        (index: number, next: SegmentRule): void => {
            if (!selected) return;
            const nextRules = selected.rules.map((r, i) => (i === index ? next : r));
            handlePatch({ rules: nextRules });
        },
        [handlePatch, selected],
    );

    const handleDeleteRule = useCallback(
        (index: number): void => {
            if (!selected) return;
            const nextRules = selected.rules.filter((_, i) => i !== index);
            handlePatch({ rules: nextRules });
        },
        [handlePatch, selected],
    );

    const deleteTarget = useMemo<AudienceSegment | null>(
        () =>
            confirmDeleteId
                ? segments.find((s) => s.id === confirmDeleteId) ?? null
                : null,
        [confirmDeleteId, segments],
    );
    const deleteRefs = useMemo(
        () =>
            confirmDeleteId ? builder.findSegmentReferences(confirmDeleteId) : [],
        [builder, confirmDeleteId],
    );

    return (
        <div
            data-testid="segments-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            {/* Header */}
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="segments-back"
                        aria-label="Back"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h2 className="text-base font-bold tracking-tight">
                            {t(STRINGS.segment.heading, locale)}
                        </h2>
                        <p className="text-[11px] text-foreground/80">
                            {t(STRINGS.segment.subtitle, locale)}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleCreate}
                    data-testid="segments-new"
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                >
                    <Plus className="h-3.5 w-3.5" />
                    {t(STRINGS.segment.new, locale)}
                </button>
            </header>

            {/* Body */}
            {segments.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-6">
                    <div
                        data-testid="segments-empty"
                        className="max-w-md rounded-2xl border border-dashed border-(--card-border) p-10 text-center"
                    >
                        <Target className="mx-auto h-6 w-6 text-muted-foreground" />
                        <p className="mt-2 text-sm font-medium">
                            {t(STRINGS.segment.empty_title, locale)}
                        </p>
                        <p className="mt-1 text-[12px] text-foreground/80">
                            {t(STRINGS.segment.empty_hint, locale)}
                        </p>
                        <button
                            type="button"
                            onClick={handleCreate}
                            data-testid="segments-empty-new"
                            className="mt-4 inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {t(STRINGS.segment.empty_new, locale)}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 overflow-hidden">
                    {/* LEFT: list */}
                    <aside
                        data-testid="segments-list"
                        className="flex w-[40%] min-w-[260px] shrink-0 flex-col overflow-y-auto border-r border-(--card-border) bg-(--card-bg)"
                    >
                        <ul className="space-y-1 p-3">
                            {segments.map((s) => (
                                <li key={s.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedId(s.id);
                                            setAcknowledgedRefs(false);
                                        }}
                                        data-testid={`segments-list-item-${s.id}`}
                                        className={cn(
                                            "flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors",
                                            s.id === selectedId
                                                ? "border-primary/40 bg-primary/5"
                                                : "border-transparent hover:bg-black/5",
                                        )}
                                    >
                                        <div className="flex w-full items-center justify-between gap-2">
                                            <span className="truncate text-sm font-semibold">
                                                {s.name || "(Untitled)"}
                                            </span>
                                            <span className="shrink-0 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                                                {s.rules.length} rule
                                                {s.rules.length === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                        {s.description && (
                                            <p className="line-clamp-2 text-[11px] text-foreground/80">
                                                {s.description}
                                            </p>
                                        )}
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {s.rules.slice(0, 4).map((r, i) => (
                                                <span
                                                    key={i}
                                                    className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                                                >
                                                    {RULE_KIND_LABELS[r.kind]}
                                                </span>
                                            ))}
                                            {s.rules.length > 4 && (
                                                <span className="text-[9px] text-muted-foreground">
                                                    +{s.rules.length - 4}
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 text-[10px] text-muted-foreground">
                                            Visitors: <span className="font-medium">—</span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </aside>

                    {/* RIGHT: editor */}
                    <section className="flex flex-1 flex-col overflow-y-auto p-5">
                        {selected ? (
                            <SegmentEditor
                                segment={selected}
                                addRuleOpen={addRuleOpen}
                                onToggleAddRule={() => setAddRuleOpen((v) => !v)}
                                onAddRule={handleAddRule}
                                onPatch={handlePatch}
                                onUpdateRule={handleUpdateRule}
                                onDeleteRule={handleDeleteRule}
                                onDelete={() => {
                                    setConfirmDeleteId(selected.id);
                                    setAcknowledgedRefs(false);
                                }}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-sm text-foreground/80">
                                Select a segment to edit it.
                            </div>
                        )}
                    </section>
                </div>
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <DeleteConfirm
                    segment={deleteTarget}
                    refsCount={deleteRefs.length}
                    acknowledgedRefs={acknowledgedRefs}
                    onCancel={() => {
                        setConfirmDeleteId(null);
                        setAcknowledgedRefs(false);
                    }}
                    onConfirm={handleDelete}
                />
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Editor                                                               */
/* ─────────────────────────────────────────────────────────────────── */

interface SegmentEditorProps {
    segment: AudienceSegment;
    addRuleOpen: boolean;
    onToggleAddRule: () => void;
    onAddRule: (kind: SegmentRule["kind"]) => void;
    onPatch: (patch: Partial<AudienceSegment>) => void;
    onUpdateRule: (index: number, next: SegmentRule) => void;
    onDeleteRule: (index: number) => void;
    onDelete: () => void;
}

function SegmentEditor({
    segment,
    addRuleOpen,
    onToggleAddRule,
    onAddRule,
    onPatch,
    onUpdateRule,
    onDeleteRule,
    onDelete,
}: SegmentEditorProps): ReactElement {
    return (
        <div data-testid="segment-editor" className="space-y-5">
            <header className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold tracking-tight">Edit segment</h3>
                <button
                    type="button"
                    onClick={onDelete}
                    data-testid="segment-editor-delete"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-500/40 px-2 text-[12px] font-medium text-rose-700 transition-colors hover:bg-rose-500/10"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete segment
                </button>
            </header>

            <Field label="Name">
                <input
                    type="text"
                    value={segment.name}
                    onChange={(e) => onPatch({ name: e.target.value })}
                    data-testid="segment-editor-name"
                    className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            </Field>

            <Field label="Description">
                <textarea
                    value={segment.description ?? ""}
                    onChange={(e) => onPatch({ description: e.target.value })}
                    data-testid="segment-editor-description"
                    rows={2}
                    className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
            </Field>

            <Field label="Combine logic">
                <div
                    role="radiogroup"
                    aria-label="Combine logic"
                    className="inline-flex rounded-md border border-(--card-border) bg-muted/30 p-0.5"
                >
                    {(["all", "any"] as const).map((opt) => (
                        <button
                            key={opt}
                            type="button"
                            role="radio"
                            aria-checked={segment.combine === opt}
                            onClick={() => onPatch({ combine: opt })}
                            data-testid={`segment-editor-combine-${opt}`}
                            className={cn(
                                "rounded-sm px-3 py-1 text-[12px] font-medium transition-colors",
                                segment.combine === opt
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            Match {opt === "all" ? "ALL" : "ANY"} rules
                        </button>
                    ))}
                </div>
            </Field>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                        Rules
                    </span>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={onToggleAddRule}
                            data-testid="segment-editor-add-rule"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-black/5"
                        >
                            <Plus className="h-3 w-3" />
                            Add rule
                        </button>
                        {addRuleOpen && (
                            <div
                                data-testid="segment-editor-add-rule-popover"
                                className="absolute right-0 top-8 z-10 w-56 rounded-md border border-(--card-border) bg-(--card-bg) p-1 shadow-lg"
                            >
                                {ALL_RULE_KINDS.map((k) => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => onAddRule(k)}
                                        data-testid={`segment-editor-add-rule-${k}`}
                                        className="block w-full rounded px-2 py-1.5 text-left text-[12px] hover:bg-black/5"
                                    >
                                        {RULE_KIND_LABELS[k]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {segment.rules.length === 0 ? (
                    <p
                        data-testid="segment-editor-rules-empty"
                        className="rounded-md border border-dashed border-(--card-border) px-3 py-4 text-center text-[12px] text-muted-foreground"
                    >
                        No rules. Add one to start matching visitors.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {segment.rules.map((r, i) => (
                            <li
                                key={i}
                                data-testid={`segment-rule-${i}`}
                                className="rounded-md border border-(--card-border) bg-(--card-bg) p-3"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        {RULE_KIND_LABELS[r.kind]}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => onDeleteRule(i)}
                                        data-testid={`segment-rule-${i}-delete`}
                                        aria-label="Delete rule"
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="mt-2">
                                    <RuleConfig
                                        rule={r}
                                        index={i}
                                        onChange={(next) => onUpdateRule(i, next)}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Per-rule config                                                      */
/* ─────────────────────────────────────────────────────────────────── */

interface RuleConfigProps {
    rule: SegmentRule;
    index: number;
    onChange: (next: SegmentRule) => void;
}

function RuleConfig({ rule, index, onChange }: RuleConfigProps): ReactElement | null {
    switch (rule.kind) {
        case "first_visit":
            return (
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    Within
                    <input
                        type="number"
                        min={0}
                        value={rule.within_minutes ?? ""}
                        onChange={(e) => {
                            const v = e.target.value;
                            onChange({
                                kind: "first_visit",
                                within_minutes: v === "" ? undefined : Number(v),
                            });
                        }}
                        data-testid={`segment-rule-${index}-within-minutes`}
                        className="w-24 rounded-md border border-(--card-border) bg-background px-2 py-1 text-sm"
                    />
                    minutes (optional)
                </label>
            );
        case "returning_visitor":
        case "has_ordered_before":
            return (
                <p className="text-[12px] text-muted-foreground">No configuration.</p>
            );
        case "cart_total":
            return (
                <div className="flex items-center gap-2 text-[12px]">
                    <select
                        value={rule.op}
                        onChange={(e) =>
                            onChange({
                                kind: "cart_total",
                                op: e.target.value as ">=" | "<=",
                                value_iqd: rule.value_iqd,
                            })
                        }
                        data-testid={`segment-rule-${index}-op`}
                        className="rounded-md border border-(--card-border) bg-background px-2 py-1 text-sm"
                    >
                        <option value=">=">≥</option>
                        <option value="<=">≤</option>
                    </select>
                    <input
                        type="number"
                        min={0}
                        value={rule.value_iqd}
                        onChange={(e) =>
                            onChange({
                                kind: "cart_total",
                                op: rule.op,
                                value_iqd: Number(e.target.value),
                            })
                        }
                        data-testid={`segment-rule-${index}-value`}
                        className="w-32 rounded-md border border-(--card-border) bg-background px-2 py-1 text-sm"
                    />
                    <span className="text-muted-foreground">IQD</span>
                </div>
            );
        case "abandoned_cart":
            return (
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    Inactive for at least
                    <input
                        type="number"
                        min={0}
                        value={rule.minutes_since}
                        onChange={(e) =>
                            onChange({
                                kind: "abandoned_cart",
                                minutes_since: Number(e.target.value),
                            })
                        }
                        data-testid={`segment-rule-${index}-minutes-since`}
                        className="w-24 rounded-md border border-(--card-border) bg-background px-2 py-1 text-sm"
                    />
                    minutes
                </label>
            );
        case "governorate":
            return (
                <div className="flex flex-wrap gap-1">
                    {IRAQ_GOVERNORATES.map((g) => {
                        const selected = rule.values.includes(g.code);
                        return (
                            <button
                                key={g.code}
                                type="button"
                                onClick={() => {
                                    const next: GovernorateCode[] = selected
                                        ? rule.values.filter((c) => c !== g.code)
                                        : [...rule.values, g.code];
                                    onChange({ kind: "governorate", values: next });
                                }}
                                data-testid={`segment-rule-${index}-gov-${g.code}`}
                                className={cn(
                                    "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                                    selected
                                        ? "border-primary/40 bg-primary/10 text-primary"
                                        : "border-(--card-border) text-muted-foreground hover:bg-black/5",
                                )}
                            >
                                {g.code}
                            </button>
                        );
                    })}
                </div>
            );
        case "traffic_source":
            return (
                <div className="flex flex-wrap gap-2">
                    {TRAFFIC_SOURCES.map((src) => {
                        const selected = rule.values.includes(src);
                        return (
                            <label
                                key={src}
                                className="flex items-center gap-1 text-[12px] text-muted-foreground"
                            >
                                <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => {
                                        const next: TrafficSource[] = selected
                                            ? rule.values.filter((v) => v !== src)
                                            : [...rule.values, src];
                                        onChange({ kind: "traffic_source", values: next });
                                    }}
                                    data-testid={`segment-rule-${index}-traffic-${src}`}
                                />
                                {src}
                            </label>
                        );
                    })}
                </div>
            );
        case "device":
            return (
                <div className="flex flex-wrap gap-2">
                    {DEVICES.map((d) => {
                        const selected = rule.values.includes(d);
                        return (
                            <label
                                key={d}
                                className="flex items-center gap-1 text-[12px] text-muted-foreground"
                            >
                                <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => {
                                        const next: Breakpoint[] = selected
                                            ? rule.values.filter((v) => v !== d)
                                            : [...rule.values, d];
                                        onChange({ kind: "device", values: next });
                                    }}
                                    data-testid={`segment-rule-${index}-device-${d}`}
                                />
                                {d}
                            </label>
                        );
                    })}
                </div>
            );
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Delete confirm                                                       */
/* ─────────────────────────────────────────────────────────────────── */

interface DeleteConfirmProps {
    segment: AudienceSegment;
    refsCount: number;
    acknowledgedRefs: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

function DeleteConfirm({
    segment,
    refsCount,
    acknowledgedRefs,
    onCancel,
    onConfirm,
}: DeleteConfirmProps): ReactElement {
    const needsAck = refsCount > 0 && !acknowledgedRefs;
    return (
        <div
            data-testid="segment-delete-confirm"
            role="dialog"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-(--card-border) bg-(--card-bg) shadow-xl">
                <header className="flex items-center justify-between border-b border-(--card-border) px-5 py-3">
                    <h3 className="text-base font-semibold tracking-tight">
                        Delete &ldquo;{segment.name || "Untitled"}&rdquo;?
                    </h3>
                    <button
                        type="button"
                        onClick={onCancel}
                        data-testid="segment-delete-cancel"
                        aria-label="Cancel"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>
                <div className="space-y-3 p-5 text-[12px]">
                    {refsCount > 0 ? (
                        <div
                            data-testid="segment-delete-refs-warning"
                            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300"
                        >
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
                            <p>
                                This segment is used by{" "}
                                <span
                                    data-testid="segment-delete-refs-count"
                                    className="font-semibold"
                                >
                                    {refsCount}
                                </span>{" "}
                                variant{refsCount === 1 ? "" : "s"}. Deleting it will
                                leave those variants matching nothing. Proceed?
                            </p>
                        </div>
                    ) : (
                        <p className="text-muted-foreground">
                            This will remove the segment from your store config. Any
                            variant that targets it will no longer match.
                        </p>
                    )}
                </div>
                <footer className="flex justify-end gap-2 border-t border-(--card-border) bg-muted/10 px-5 py-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        data-testid="segment-delete-cancel-btn"
                        className="inline-flex h-9 items-center rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        data-testid="segment-delete-confirm-btn"
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-rose-600 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                        {needsAck ? (
                            <>
                                <AlertCircle className="h-3.5 w-3.5" />
                                I understand, continue
                            </>
                        ) : (
                            <>
                                <Check className="h-3.5 w-3.5" />
                                Delete segment
                            </>
                        )}
                    </button>
                </footer>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Field helper                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}): ReactElement {
    return (
        <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                {label}
            </span>
            {children}
        </label>
    );
}
