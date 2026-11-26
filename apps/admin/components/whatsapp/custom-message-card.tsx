"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { CopyableText } from "@/components/shared/copyable-text";
import { ShopNameLink } from "@/components/shared/shop-name-link";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { answerLostWords } from "@/lib/answer-lost";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { CUSTOM_WA_QUEUE_KEY, interaktFields, type CustomWaItem, type CustomWaStep } from "@/lib/custom-whatsapp-queue";
import { formatIQD, formatWhen } from "@/lib/format";
import { sendStep } from "@/lib/send-json";

const PURPOSE_LABEL: Record<CustomWaItem["purpose"], string> = {
  confirmation: "Order confirmation",
  reminder: "Order reminder",
  discount: "Discount offer",
};

const STATUS_LABEL: Record<CustomWaItem["status"], { text: string; tone: string }> = {
  review: { text: "To submit", tone: "bg-sky-500/15 text-[var(--ink-blue)]" },
  at_meta: { text: "Waiting on Meta", tone: "bg-amber-500/15 text-[var(--ink-amber)]" },
  live: { text: "Live", tone: "bg-green-500/15 text-[var(--ink-green)]" },
  rejected: { text: "Rejected by Meta, refunded", tone: "bg-rose-500/15 text-[var(--ink-red)]" },
  declined: { text: "Declined by us, refunded", tone: "bg-rose-500/15 text-[var(--ink-red)]" },
  withdrawn: { text: "Withdrawn by the shop, refunded", tone: "bg-foreground/10 text-foreground/70" },
  replaced: { text: "Replaced by a newer one", tone: "bg-foreground/10 text-foreground/70" },
};

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

/**
 * One shop's paid custom message: what to type into Interakt, field by field,
 * and the step it is at. Steps follow Interakt: submit it there, then come
 * back for Meta's answer. A refusal's reason is what the shop reads.
 */
export function CustomMessageCard({
  item,
  headerImageUrl,
  canReview,
}: {
  item: CustomWaItem;
  headerImageUrl: string | null;
  canReview: boolean;
}) {
  const queryClient = useQueryClient();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const step = useMutation({
    mutationFn: (body: CustomWaStep) =>
      sendStep<unknown>(
        `/api/whatsapp/custom-templates/${item.id}`,
        body,
        "POST",
        answerLostWords("the request's status"),
        "The message was not moved.",
      ),
    onSuccess: () => {
      setRefusing(false);
      setReason("");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CUSTOM_WA_QUEUE_KEY });
      void queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp-health"] });
    },
  });
  const open = item.status === "review" || item.status === "at_meta";
  const status = STATUS_LABEL[item.status];
  // Waiting on us: decline. Waiting on Meta: Meta's rejection.
  const refusal = item.status === "review" ? "declined" : "rejected";

  return (
    <div className="rounded-2xl border border-[var(--card-border)] p-4 space-y-3" data-testid="custom-wa-request">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <ShopNameLink id={item.tenant_id} name={item.tenant?.business_name ?? null} displayId={item.tenant?.display_id ?? null} />
          <p className="text-xs text-foreground/70">
            {PURPOSE_LABEL[item.purpose]} · paid {formatIQD(item.price_iqd)} · {formatWhen(item.created_at)}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status.tone}`}>
          {status.text}
          {item.status === "live" && item.category ? ` · ${item.category}` : ""}
        </span>
      </div>

      {open && (
        <dl className="grid gap-2 rounded-xl bg-foreground/[0.03] p-3 text-xs md:grid-cols-[10rem_1fr]">
          {interaktFields(item).map((field) => (
            <div key={field.label} className="contents">
              <dt className="font-semibold text-foreground/70">{field.label}</dt>
              <dd className="min-w-0">
                <CopyableText value={field.value} className="whitespace-pre-wrap break-words" iconClassName="opacity-100" />
              </dd>
            </div>
          ))}
          <dt className="font-semibold text-foreground/70">Header sample</dt>
          <dd className="min-w-0">
            {headerImageUrl ? (
              <a href={headerImageUrl} target="_blank" rel="noreferrer" className="text-[var(--ink-blue)] hover:underline">
                Download the picture
              </a>
            ) : (
              <span className="text-foreground/70">The shop app&apos;s picture for this message (PLATFORM_URL is not set here)</span>
            )}
          </dd>
        </dl>
      )}

      {!open && (
        <p dir="auto" className="whitespace-pre-wrap break-words text-xs text-foreground/80 line-clamp-3">
          {item.body}
        </p>
      )}
      {item.reason && <p className="text-xs text-foreground/70">Reason the shop read: {item.reason}</p>}

      {open && canReview && (
        <div className="flex flex-wrap items-center gap-2">
          {item.status === "review" && !refusing && (
            <button
              type="button"
              onClick={() => step.mutate({ step: "at_meta" })}
              disabled={step.isPending}
              className={`${buttonClass} bg-foreground text-background`}
            >
              {step.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Submitted in Interakt
            </button>
          )}
          {item.status === "at_meta" && !refusing && (
            <>
              <span className="text-xs text-foreground/70">Meta approved it as</span>
              {(["utility", "marketing"] as const).map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => step.mutate({ step: "live", category })}
                  disabled={step.isPending}
                  className={`${buttonClass} bg-foreground text-background`}
                >
                  {category === "utility" ? "Utility" : "Marketing"}
                </button>
              ))}
            </>
          )}
          {refusing ? (
            <>
              <StaffReasonInput
                value={reason}
                onChange={setReason}
                placeholder="Why, in words the shop reads (Arabic is fine)"
                className="min-w-[16rem] flex-1"
              />
              <button
                type="button"
                onClick={() => step.mutate({ step: refusal, reason: reason.trim() })}
                disabled={step.isPending || !isStaffReason(reason)}
                className={`${buttonClass} bg-[var(--ink-red)] text-white`}
              >
                {step.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                {refusal === "declined" ? "Decline and refund" : "Rejected by Meta, refund"}
              </button>
              <button type="button" onClick={() => setRefusing(false)} className="text-xs text-foreground/70 hover:text-foreground">
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setRefusing(true)}
              disabled={step.isPending}
              className={`${buttonClass} border border-[var(--card-border)] text-foreground hover:bg-foreground/5`}
            >
              {refusal === "declined" ? "Decline" : "Meta rejected it"}
            </button>
          )}
          {step.isError && <span className="text-xs text-[var(--ink-red)]">{step.error.message}</span>}
        </div>
      )}
    </div>
  );
}
