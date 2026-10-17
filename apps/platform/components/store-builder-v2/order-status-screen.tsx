"use client";

// =====================================================================
// OrderStatusScreen — what a shopper reads when they track an order
// =====================================================================
// Edits config.commerce.order_status_narratives: per customer-stage copy
// (title, body, what-happens-next, call to action). The storefront's
// order_tracker resolves the same map through `resolveNarrative`, so the
// preview here is the exact line the shopper gets — including the rule that
// a sentence needing `{contact}` is dropped when no number is set, and that
// a WhatsApp/phone button with no number never renders. Untouched stages
// keep the shipped Iraqi-dialect defaults; "Reset" deletes the override.
// =====================================================================

import { useCallback, useState } from "react";
import { X, MessageSquareText, RotateCcw } from "lucide-react";
import {
    CUSTOMER_ORDER_STAGES,
    DEFAULT_NARRATIVES,
    TIMELINE_STAGES,
    resolveNarrative,
} from "@scheniders/shared";
import type {
    CustomerOrderStage,
    I18nString,
    OrderStatusNarrative,
} from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { STRINGS, t as tx } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";
import { I18nStringInput } from "./i18n-string-input";

export interface OrderStatusScreenProps {
    builder: UseStoreBuilderV2Return;
    /** The number the storefront's tracker fills `{contact}` with and dials —
     *  resolved server-side from the tenant's contact settings. */
    contact: string | null;
    onClose: () => void;
}

type CtaKind = NonNullable<OrderStatusNarrative["cta"]>["kind"];
const CTA_KINDS: readonly CtaKind[] = ["whatsapp", "phone", "link", "review", "reorder"];

const selectCls =
    "rounded-lg border border-(--card-border) bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

/** A narrative with every text field present, so inputs are never uncontrolled. */
function withEmpty(n: OrderStatusNarrative | undefined): Required<Pick<OrderStatusNarrative, "title_i18n" | "body_i18n" | "next_i18n">> & OrderStatusNarrative {
    return {
        ...n,
        title_i18n: n?.title_i18n ?? {},
        body_i18n: n?.body_i18n ?? {},
        next_i18n: n?.next_i18n ?? {},
    };
}

/** True when an I18nString carries at least one non-blank line. */
function hasText(s: I18nString | undefined): boolean {
    return Object.values(s ?? {}).some((v) => typeof v === "string" && v.trim() !== "");
}

/** Drop empty i18n objects and an empty override entirely, so an untouched
 *  stage stays absent from the config instead of leaving `{}` behind. */
function compact(n: OrderStatusNarrative): OrderStatusNarrative | undefined {
    const out: OrderStatusNarrative = {};
    if (hasText(n.title_i18n)) out.title_i18n = n.title_i18n;
    if (hasText(n.body_i18n)) out.body_i18n = n.body_i18n;
    if (hasText(n.next_i18n)) out.next_i18n = n.next_i18n;
    if (n.cta) out.cta = n.cta;
    return Object.keys(out).length ? out : undefined;
}

export function OrderStatusScreen({ builder, contact: rawContact, onClose }: OrderStatusScreenProps): React.ReactElement {
    const locale = useEditorLocale();
    const overrides = builder.config.commerce?.order_status_narratives ?? {};
    // The same number the storefront dials — an empty value here means the
    // preview drops contact lines exactly as the tracker would.
    const contact = rawContact?.trim() || null;
    const [open, setOpen] = useState<CustomerOrderStage>("placed");

    const setStage = useCallback(
        (stage: CustomerOrderStage, next: OrderStatusNarrative | undefined, label: string): void => {
            builder.setConfig(
                (prev) => {
                    const map = { ...prev.commerce?.order_status_narratives };
                    if (next) map[stage] = next;
                    else delete map[stage];
                    return {
                        ...prev,
                        commerce: {
                            ...prev.commerce,
                            order_status_narratives: Object.keys(map).length ? map : undefined,
                        },
                    };
                },
                label,
            );
        },
        [builder],
    );

    const patch = (stage: CustomerOrderStage, p: Partial<OrderStatusNarrative>): void =>
        setStage(stage, compact({ ...overrides[stage], ...p }), tx(STRINGS.order_status.history_edit, locale));

    return (
        <div data-testid="order-status-screen" className="flex h-full w-full flex-col bg-background">
            <header className="flex shrink-0 items-center gap-2 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <button
                    type="button"
                    aria-label={tx(STRINGS.order_status.close, locale)}
                    data-testid="order-status-close"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
                <MessageSquareText className="h-4 w-4 text-sky-600" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">{tx(STRINGS.order_status.title, locale)}</h2>
            </header>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                <p className="max-w-prose text-xs text-muted-foreground">{tx(STRINGS.order_status.intro, locale)}</p>
                {!contact && (
                    <p role="status" data-testid="order-status-no-contact" className="max-w-prose text-xs text-amber-700">
                        {tx(STRINGS.order_status.no_contact, locale)}
                    </p>
                )}

                {CUSTOMER_ORDER_STAGES.map((stage) => {
                    const own = withEmpty(overrides[stage]);
                    const edited = overrides[stage] !== undefined;
                    const preview = resolveNarrative(stage, locale, overrides, contact);
                    const isOpen = open === stage;
                    const onPath = (TIMELINE_STAGES as readonly CustomerOrderStage[]).includes(stage);
                    const stageLabel = tx(STRINGS.order_status[`stage_${stage}`], locale);
                    return (
                        <section
                            key={stage}
                            data-testid={`order-status-stage-${stage}`}
                            className="rounded-xl border border-(--card-border) bg-(--card-bg)"
                        >
                            <button
                                type="button"
                                data-testid={`order-status-toggle-${stage}`}
                                aria-expanded={isOpen}
                                onClick={() => setOpen(stage)}
                                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                            >
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        {stageLabel}
                                        {!onPath && (
                                            <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                                {tx(STRINGS.order_status.off_path, locale)}
                                            </span>
                                        )}
                                        {edited && (
                                            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-700">
                                                {tx(STRINGS.order_status.edited, locale)}
                                            </span>
                                        )}
                                    </span>
                                    {/* Exactly what the tracker renders for this stage. */}
                                    <span
                                        data-testid={`order-status-preview-${stage}`}
                                        className="mt-1 block text-xs text-muted-foreground"
                                    >
                                        <span className="font-medium text-foreground">{preview.title}</span>
                                        {" — "}
                                        {preview.body}
                                        {preview.next ? ` ${preview.next}` : ""}
                                        {preview.cta ? ` [${preview.cta.label}]` : ""}
                                    </span>
                                </span>
                            </button>

                            {isOpen && (
                                <div className="flex flex-col gap-3 border-t border-(--card-border) px-4 py-3">
                                    <I18nStringInput
                                        label={tx(STRINGS.order_status.field_title, locale)}
                                        value={own.title_i18n}
                                        onChange={(v) => patch(stage, { title_i18n: v })}
                                        placeholder={DEFAULT_NARRATIVES[stage].title_i18n[locale] ?? ""}
                                        activeLocale={locale}
                                        testIdPrefix={`order-status-title-${stage}`}
                                    />
                                    <I18nStringInput
                                        label={tx(STRINGS.order_status.field_body, locale)}
                                        value={own.body_i18n}
                                        onChange={(v) => patch(stage, { body_i18n: v })}
                                        placeholder={DEFAULT_NARRATIVES[stage].body_i18n[locale] ?? ""}
                                        multiline
                                        activeLocale={locale}
                                        testIdPrefix={`order-status-body-${stage}`}
                                    />
                                    <I18nStringInput
                                        label={tx(STRINGS.order_status.field_next, locale)}
                                        value={own.next_i18n}
                                        onChange={(v) => patch(stage, { next_i18n: v })}
                                        placeholder={DEFAULT_NARRATIVES[stage].next_i18n?.[locale] ?? ""}
                                        helperText={tx(STRINGS.order_status.contact_hint, locale)}
                                        multiline
                                        activeLocale={locale}
                                        testIdPrefix={`order-status-next-${stage}`}
                                    />

                                    <div className="flex flex-wrap items-center gap-3">
                                        <label className="flex items-center gap-2 text-sm text-foreground">
                                            {tx(STRINGS.order_status.field_cta, locale)}
                                            <select
                                                data-testid={`order-status-cta-${stage}`}
                                                value={own.cta?.kind ?? (DEFAULT_NARRATIVES[stage].cta ? "default" : "none")}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    if (v === "default") {
                                                        const rest = { ...overrides[stage] };
                                                        delete rest.cta;
                                                        setStage(stage, compact(rest), tx(STRINGS.order_status.history_edit, locale));
                                                    } else if (v === "none") {
                                                        // An explicit "no button" is a real
                                                        // choice: the default may carry one.
                                                        patch(stage, { cta: { kind: "link", value: "", label_i18n: {} } });
                                                    } else {
                                                        patch(stage, { cta: { ...own.cta, kind: v as CtaKind } });
                                                    }
                                                }}
                                                className={selectCls}
                                            >
                                                {DEFAULT_NARRATIVES[stage].cta && (
                                                    <option value="default">
                                                        {tx(STRINGS.order_status.cta_default, locale)}
                                                    </option>
                                                )}
                                                <option value="none">{tx(STRINGS.order_status.cta_none, locale)}</option>
                                                {CTA_KINDS.map((k) => (
                                                    <option key={k} value={k}>
                                                        {tx(STRINGS.order_status[`cta_${k}`], locale)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        {own.cta?.kind === "link" && (
                                            <input
                                                type="text"
                                                dir="ltr"
                                                data-testid={`order-status-cta-value-${stage}`}
                                                value={own.cta.value ?? ""}
                                                onChange={(e) =>
                                                    patch(stage, { cta: { ...own.cta, kind: "link", value: e.target.value } })
                                                }
                                                placeholder="/contact"
                                                className={`${selectCls} w-48`}
                                            />
                                        )}
                                    </div>
                                    {own.cta && (
                                        <I18nStringInput
                                            label={tx(STRINGS.order_status.field_cta_label, locale)}
                                            value={own.cta.label_i18n ?? {}}
                                            onChange={(v) => patch(stage, { cta: { ...own.cta, kind: own.cta?.kind ?? "link", label_i18n: v } })}
                                            placeholder={DEFAULT_NARRATIVES[stage].cta?.label_i18n?.[locale] ?? ""}
                                            activeLocale={locale}
                                            testIdPrefix={`order-status-cta-label-${stage}`}
                                        />
                                    )}

                                    {edited && (
                                        <button
                                            type="button"
                                            data-testid={`order-status-reset-${stage}`}
                                            onClick={() =>
                                                setStage(stage, undefined, tx(STRINGS.order_status.history_reset, locale))
                                            }
                                            className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                            {tx(STRINGS.order_status.reset, locale)}
                                        </button>
                                    )}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
