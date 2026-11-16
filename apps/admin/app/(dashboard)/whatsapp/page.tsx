"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, MessageCircleOff } from "lucide-react";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { adminFetch } from "@/lib/admin-fetch";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { LoadError } from "@/components/shared/load-error";
import { okOrLoadFailure } from "@/lib/load-failure";
import {
  INTERAKT_COST_IQD,
  baghdadMonth,
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

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

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
      const res = await adminFetch(`/api/merchants/${shop.tenant_id}/whatsapp-pause`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      if (!res.ok) throw new Error(`WhatsApp pause failed: ${res.status}`);
    },
    onSettled: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp-health"] });
    },
  });

  const status = shop.paused ? (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
      Paused · {shop.pause_reason === "failures" ? "failures" : "by staff"}
    </span>
  ) : (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Sending</span>
  );
  if (!canPause) return status;

  const label = shop.paused ? "Resume" : "Pause";
  return (
    <div className="flex items-center justify-end gap-2">
      {status}
      {change.isError && <span className="text-xs text-rose-700">Failed, try again</span>}
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
 * «WhatsApp» (Fermi B2): every shop sends from our one number. Shops pay each
 * delivered message from their wallet; we pay during the free trial. Shows a
 * month per shop, and which shops are paused to protect the number.
 */
export default function WhatsAppPage() {
  const { role } = useAdminAuth();
  const current = baghdadMonth(new Date());
  const [month, setMonth] = useState(current);
  const { data, error, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["admin", "whatsapp", month],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch(`/api/whatsapp?month=${month}`), "the WhatsApp numbers");
      return responseSchema.parse(await res.json());
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isError && !data) {
    return <LoadError what="the WhatsApp numbers" onRetry={() => refetch()} retrying={isFetching} error={error} />;
  }

  const canPause = role === "super_admin";

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="w-6 h-6" />
            WhatsApp
          </h1>
          <p className="text-foreground-muted mt-1 max-w-2xl">
            Every shop sends from our one number. Shops pay each delivered message from their wallet; we pay during the
            free trial. A shop whose messages mostly fail is paused so the number stays healthy. Months on Baghdad time.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-[var(--card-border)] p-1" data-testid="whatsapp-month">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="rounded-lg p-1.5 text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-foreground">{monthLabel(month)}</span>
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
            <NumberCell label={`Messages delivered, ${monthLabel(month)}`} value={number(data.totals.messages)} />
            <NumberCell label={`Shops paid, ${monthLabel(month)}`} value={iqd(data.totals.shopPaidIqd)} />
            <NumberCell
              label={`Trial messages on us, ${monthLabel(month)}`}
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
                <p className="text-sm">No messages delivered in {monthLabel(month)}.</p>
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
                            <Link href={`/merchants/${s.tenant_id}`} className="font-medium text-foreground hover:underline">
                              {s.name ?? "Shop"}
                            </Link>
                            {s.display_id !== null && <span className="ml-2 text-xs text-foreground/70 tabular-nums">#{s.display_id}</span>}
                          </td>
                          <td className="p-3 text-xs">
                            <span className="font-semibold capitalize">{s.plan}</span>
                            <span className="text-foreground/70"> · {s.status}</span>
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
                            {s.unpaid > 0 && <span className="block text-xs text-rose-700">{number(s.unpaid)} not paid</span>}
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
                                  tone === "red" ? "font-semibold text-rose-700" : tone === "amber" ? "font-semibold text-amber-700" : "text-foreground/70"
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
    </div>
  );
}
