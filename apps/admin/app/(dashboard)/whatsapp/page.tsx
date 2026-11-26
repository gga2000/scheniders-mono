"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Loader2, MessageCircleOff } from "lucide-react";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { ShopNameLink } from "@/components/shared/shop-name-link";
import { CustomMessagesQueue } from "@/components/whatsapp/custom-messages-queue";
import { adminFetch } from "@/lib/admin-fetch";
import { answerLostWords } from "@/lib/answer-lost";
import { sendStep } from "@/lib/send-json";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { LoadError } from "@/components/shared/load-error";
import { StaleLine } from "@/components/shared/stale-line";
import { okOrLoadFailure, pollEvery } from "@/lib/load-failure";
import { monthOf } from "@/lib/baghdad-day";
import { formatMonth } from "@/lib/format";
import { STATUS_LABELS, planLabel } from "@/types/admin";
import {
  INTERAKT_COST_IQD,
  shiftMonth,
  trialCostIqd,
  whatsappReportSchema,
  type WhatsAppReportShop,
} from "@/lib/whatsapp-report";

const responseSchema = whatsappReportSchema.extend({
  month: z.string(),
  totals: z.object({
    messages: z.number(),
    shopPaidIqd: z.number(),
    trialMessages: z.number(),
    trialCostIqd: z.number(),
    unpaid: z.number(),
    pausedShops: z.number(),
  }),
});

const number = (n: number) => new Intl.NumberFormat("en-IQ").format(n);
const iqd = (n: number) => `${number(n)} IQD`;

/** Half or more of 20+ messages failing on the shop's numbers pauses it (whatsapp_watch). */
function failureTone(shop: WhatsAppReportShop): "red" | "amber" | null {
  if (shop.reached_24h === 0) return null;
  if (shop.reached_24h >= 20 && shop.bad_24h * 2 >= shop.reached_24h) return "red";
  return shop.bad_24h * 5 >= shop.reached_24h && shop.bad_24h > 0 ? "amber" : null;
}

function PauseButton({ shop, canPause }: { shop: WhatsAppReportShop; canPause: boolean }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const change = useMutation({
    mutationFn: async (paused: boolean) => {
      await sendStep<unknown>(
        `/api/merchants/${shop.tenant_id}/whatsapp-pause`,
        { paused },
        "POST",
        answerLostWords("the shop's WhatsApp line"),
        "WhatsApp was not changed.",
      );
    },
    onSettled: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp-health"] });
    },
  });

  const status = shop.paused ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-[var(--ink-red)]">
      Paused · {shop.pause_reason === "failures" ? "failures" : "by staff"}
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-[var(--ink-green)]">Sending</span>
  );
  if (!canPause) return status;

  const label = shop.paused ? "Resume" : "Pause";
  return (
    <div className="flex items-center justify-end gap-2">
      {status}
      {change.isError && <span className="text-xs text-[var(--ink-red)]">Failed, try again</span>}
      {confirming ? (
        <>
          <button
            type="button"
            onClick={() => change.mutate(!shop.paused)}
            disabled={change.isPending}
            className="rounded-lg bg-foreground px-2.5 py-1 text-xs font-semibold text-background disabled:opacity-50"
          >
            {change.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : `Yes, ${label.toLowerCase()}`}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-xs text-foreground/70 hover:text-foreground">
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-[var(--card-border)] px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-foreground/5"
        >
          {label}
        </button>
      )}
    </div>
  );
}

/**
 * The first month with numbers: messages are counted from their charge
 * (whatsapp_message_charges), which began on 16 Nov 2026 (Fermi B2). An
 * earlier month read "0 delivered" though messages went out.
 */
const COUNTED_FROM_MONTH = "2026-11";

/**
 * «WhatsApp» (Fermi B2): every shop sends from our one number. Shops pay each
 * delivered message from their wallet; we pay during the free trial. Shows a
 * month per shop, and which shops are paused to protect the number.
 */
export default function WhatsAppPage() {
  const { role } = useAdminAuth();
  const current = monthOf(new Date());
  const [month, setMonth] = useState(current);
  const pageRead = useQuery({
    queryKey: ["admin", "whatsapp", month],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch(`/api/whatsapp?month=${month}`), "the WhatsApp numbers");
      return responseSchema.parse(await res.json());
    },
    staleTime: 60_000,
    refetchInterval: pollEvery(120_000),
  });
  const { data, error, isLoading, isError, isFetching, refetch } = pageRead;

  if (isError && !data) {
    return <LoadError what="the WhatsApp numbers" onRetry={() => refetch()} retrying={isFetching} error={error} />;
  }

  const canPause = role === "super_admin";
  // The first month began on the 16th: its numbers say so where they are read.
  const countedFrom = month === COUNTED_FROM_MONTH ? "counted from 16 Nov" : undefined;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground">WhatsApp costs</h1>
          <p className="text-[13px] text-foreground/70 max-w-2xl">
            Every shop sends from our one number. Shops pay each delivered message from their wallet; we pay during the
            free trial. A shop whose messages mostly fail is paused so the number stays healthy. Months on Baghdad time,
            counted from 16 Nov 2026.
          </p>
          <StaleLine read={pageRead} what="the WhatsApp numbers" className="mt-2" />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[var(--card-border)] p-1" data-testid="whatsapp-month">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            disabled={month <= COUNTED_FROM_MONTH}
            title={month <= COUNTED_FROM_MONTH ? "Counted from 16 Nov 2026" : undefined}
            className="rounded-lg p-1.5 text-foreground/70 hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-foreground">{formatMonth(month)}</span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= current}
            className="rounded-lg p-1.5 text-foreground/70 hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/70" />
        </div>
      ) : (
        <>
          <NumberStrip columns={4} label="WhatsApp numbers">
            <NumberCell
              label={`Messages delivered, ${formatMonth(month)}`}
              value={number(data.totals.messages)}
              note={countedFrom}
            />
            <NumberCell label={`Shops paid, ${formatMonth(month)}`} value={iqd(data.totals.shopPaidIqd)} />
            <NumberCell
              label={`Trial messages on us, ${formatMonth(month)}`}
              value={number(data.totals.trialMessages)}
              note={`about ${iqd(data.totals.trialCostIqd)}`}
            />
            <NumberCell
              label="Shops paused, now"
              value={number(data.totals.pausedShops)}
              alert={data.totals.pausedShops > 0}
            />
          </NumberStrip>

          {data.totals.unpaid > 0 && (
            <p className="text-xs text-foreground/70">
              {number(data.totals.unpaid)} delivered {data.totals.unpaid === 1 ? "message was" : "messages were"} not paid: the
              shop&apos;s wallet ran out between the send and the delivery.
            </p>
          )}

          <div className="pastel-card p-0 overflow-hidden">
            {data.shops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-foreground/70">
                <MessageCircleOff className="w-10 h-10 mb-2" />
                <p className="text-sm">
                  No messages delivered in {formatMonth(month)}
                  {countedFrom ? `, ${countedFrom}` : ""}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="whatsapp-shops">
                  <thead>
                    <tr className="border-b border-[var(--card-border)]">
                      {["Shop", "Plan", "Messages", "Shop paid", "Trial, on us", "Last 24 hours", "WhatsApp"].map((h, i) => (
                        <th
                          key={h}
                          className={`p-3 text-xs font-semibold text-foreground/70 uppercase tracking-wider ${i < 2 ? "text-left" : "text-right"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.shops.map((s) => {
                      const tone = failureTone(s);
                      const trial = s.trial_utility + s.trial_marketing;
                      return (
                        <tr key={s.tenant_id} className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02]">
                          <td className="p-3">
                            <ShopNameLink id={s.tenant_id} name={s.name} displayId={s.display_id} />
                          </td>
                          <td className="p-3 text-xs">
                            <span className="font-semibold">{planLabel(s.plan)}</span>
                            <span className="text-foreground/70"> · {STATUS_LABELS[s.status]}</span>
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            <span className="font-medium">{number(s.messages)}</span>
                            {s.messages > 0 && (
                              <span className="block text-xs text-foreground/70">
                                {number(s.utility)} utility · {number(s.marketing)} marketing
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-medium tabular-nums">
                            {s.plan === "internal" ? <span className="text-foreground/70">Our store</span> : iqd(s.shop_paid_iqd)}
                            {s.unpaid > 0 && <span className="block text-xs text-[var(--ink-red)]">{number(s.unpaid)} not paid</span>}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {trial === 0 ? (
                              <span className="text-foreground/70">0</span>
                            ) : (
                              <>
                                <span className="font-medium">{number(trial)}</span>
                                <span className="block text-xs text-foreground/70">about {iqd(trialCostIqd(s))}</span>
                              </>
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {s.reached_24h === 0 ? (
                              <span className="text-foreground/70">No sends</span>
                            ) : (
                              <span
                                className={
                                  tone === "red" ? "font-semibold text-[var(--ink-red)]" : tone === "amber" ? "font-semibold text-[var(--ink-amber)]" : "text-foreground/70"
                                }
                              >
                                {number(s.bad_24h)} of {number(s.reached_24h)} failed
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <PauseButton shop={s} canPause={canPause} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-foreground/70">
            Trial cost is an estimate at Interakt&apos;s price: about {INTERAKT_COST_IQD.utility} IQD a utility message and{" "}
            {INTERAKT_COST_IQD.marketing} IQD a marketing one. &quot;Failed&quot; counts messages Meta could not deliver
            and numbers Interakt called invalid; a shop is paused when half or more of 20+ messages fail in 24 hours.
          </p>
        </>
      )}

      {/* Shops' paid custom wording for the order messages, submitted in Interakt by hand */}
      <CustomMessagesQueue />
    </div>
  );
}
