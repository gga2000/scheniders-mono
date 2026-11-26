"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { Textarea } from "@scheniders/ui/textarea";
import {
    CUSTOM_FIELD_TOKENS_AR,
    CUSTOM_TEMPLATE_MAX_CHARS,
    bodyFromLabels,
    bodyToLabels,
    customTemplateFields,
    customTemplateProblem,
    fillCustomTemplate,
    normalizeCustomTemplateBody,
    type CustomTemplateField,
    type CustomTemplatePurpose,
} from "@scheniders/shared/whatsapp-custom-templates";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { customTemplateRefusal, useRequestCustomTemplate } from "@/hooks/use-custom-whatsapp-templates";
import { BILLING_PAY_PATH } from "@/lib/billing/lock-routes";
import { formatIQD, formatIQDText } from "@/lib/utils";
import { WhatsAppPreview } from "./whatsapp-preview";

/**
 * A made-up order the preview fills the message with. The message is Arabic
 * whatever language the app is in, so the sample is too.
 */
const SAMPLE_VALUES: Record<CustomTemplateField, string> = {
    customer_name: "علي حسن",
    store_name: "متجرك",
    order_number: "1042",
    products: "عطر عود × 1",
    address: "بغداد، الكرادة",
    phone: "07701234567",
    total: formatIQDText(35000, "ar"),
    store_whatsapp: "07801234567",
    discount: "10%",
    discounted_price: formatIQDText(31500, "ar"),
};

export interface CustomTemplateEditorProps {
    purpose: CustomTemplatePurpose;
    /** Key form ({customer_name}…) the editor opens with. */
    startBody: string;
    /** The start is Fermi's own wording, not one the shop wrote. */
    startsFromFermi: boolean;
    priceIqd: number;
    /** Null while the wallet loads. */
    balanceIqd: number | null;
    onClose: () => void;
}

export function CustomTemplateEditor({ purpose, startBody, startsFromFermi, priceIqd, balanceIqd, onClose }: CustomTemplateEditorProps) {
    const { t } = useLanguage();
    const request = useRequestCustomTemplate();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [text, setText] = useState(() => bodyToLabels(startBody, CUSTOM_FIELD_TOKENS_AR));

    const body = useMemo(() => bodyFromLabels(text, CUSTOM_FIELD_TOKENS_AR), [text]);
    const problem = customTemplateProblem(purpose, body);
    const chars = [...normalizeCustomTemplateBody(body)].length;
    const short = balanceIqd !== null && balanceIqd < priceIqd;
    const price = formatIQD(priceIqd);
    const message = t(`customWa.purpose.${purpose}`);

    const insertField = (field: CustomTemplateField) => {
        const token = `{${CUSTOM_FIELD_TOKENS_AR[field]}}`;
        const el = textareaRef.current;
        const start = el?.selectionStart ?? text.length;
        const end = el?.selectionEnd ?? text.length;
        setText(text.slice(0, start) + token + text.slice(end));
        requestAnimationFrame(() => {
            el?.focus();
            el?.setSelectionRange(start + token.length, start + token.length);
        });
    };

    const pay = () => {
        request.mutate(
            { purpose, body },
            {
                onSuccess: () => {
                    toast.success(t("customWa.editor.sent"));
                    onClose();
                },
                onError: (error) => {
                    toast.error(t(`customWa.problem.${customTemplateRefusal(error)}`, { max: CUSTOM_TEMPLATE_MAX_CHARS }));
                },
            },
        );
    };

    return (
        <Dialog open onOpenChange={(open) => !open && !request.isPending && onClose()}>
            <DialogContent className="max-w-4xl" data-testid="custom-wa-editor">
                <DialogHeader>
                    <DialogTitle>{t("customWa.editor.title", { message })}</DialogTitle>
                    <DialogDescription>{startsFromFermi ? t("customWa.editor.startFrom") : t("customWa.editor.fixed")}</DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 md:grid-cols-[1fr_300px]">
                    <div className="space-y-3">
                        <div>
                            <p className="text-sm font-medium text-foreground">{t("customWa.editor.fields")}</p>
                            <p className="text-xs text-muted-foreground">{t("customWa.editor.fieldsHint")}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {customTemplateFields(purpose).map((field) => (
                                    <button
                                        key={field}
                                        type="button"
                                        onClick={() => insertField(field)}
                                        className="inline-flex items-center gap-1 rounded-full border border-(--card-border) bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
                                    >
                                        <Plus className="h-3 w-3" aria-hidden="true" />
                                        {t(`customWa.field.${field}`)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Textarea
                            ref={textareaRef}
                            dir="auto"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={14}
                            className="font-sans text-sm leading-relaxed"
                            aria-invalid={problem !== null}
                            aria-describedby="custom-wa-problem"
                        />

                        <div className="flex items-start justify-between gap-3 text-xs">
                            <p id="custom-wa-problem" role={problem ? "alert" : undefined} className="text-rose-600 dark:text-rose-400">
                                {problem ? t(`customWa.problem.${problem}`, { max: CUSTOM_TEMPLATE_MAX_CHARS }) : null}
                            </p>
                            <p className={chars > CUSTOM_TEMPLATE_MAX_CHARS ? "shrink-0 text-rose-600" : "shrink-0 text-muted-foreground"}>
                                {t("customWa.editor.chars", { count: chars, max: CUSTOM_TEMPLATE_MAX_CHARS })}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">{t("customWa.editor.preview")}</p>
                            <p className="text-xs text-muted-foreground">{t("customWa.editor.sample")}</p>
                        </div>
                        <WhatsAppPreview purpose={purpose} text={fillCustomTemplate(body, SAMPLE_VALUES)} />
                        {startsFromFermi && <p className="text-xs text-muted-foreground">{t("customWa.editor.fixed")}</p>}
                    </div>
                </div>

                <div className="space-y-3 border-t border-(--card-border) pt-4">
                    {short ? (
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                            {t("customWa.editor.short", { balance: formatIQD(balanceIqd ?? 0), price })}{" "}
                            <Link href={BILLING_PAY_PATH} className="font-semibold underline underline-offset-2">
                                {t("customWa.editor.topUp")}
                            </Link>
                        </p>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {t("customWa.editor.payNote", { price, balance: balanceIqd === null ? "…" : formatIQD(balanceIqd) })}
                        </p>
                    )}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={pay}
                            disabled={problem !== null || short || balanceIqd === null || request.isPending}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                            {request.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                            {request.isPending ? t("customWa.editor.paying") : t("customWa.editor.pay", { price })}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={request.isPending}
                            className="rounded-xl border border-(--card-border) px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                        >
                            {t("common.cancel")}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
