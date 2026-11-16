"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { formatIraqiPhoneDisplay, getMerchantCode } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { formatCount, formatTime } from "@/lib/format";
import {
  GROUP_PREVIEW,
  GROUP_TITLE,
  groupCount,
  groupRows,
  rowWords,
  waitWords,
  whatsappLink,
  type TodayGroup,
  type TodayShop,
} from "@/lib/today";
import { TONE_DOT } from "@/components/merchants/detail/shop-status";

const QUIET =
  "inline-flex whitespace-nowrap rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.05]";
const FILLED =
  "inline-flex whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-emerald-800";

/**
 * The one next step on a row (board h2). Only money waiting gets the filled
 * button, so the eye lands on the money; a login that may not decide a
 * receipt is told who does.
 */
function NextStep({ shop, canCheckReceipts }: { shop: TodayShop; canCheckReceipts: boolean }) {
  switch (shop.group) {
    case "money":
      return canCheckReceipts ? (
        <Link href="/payments" className={FILLED}>Check receipt</Link>
      ) : (
        <span className="text-[13px] text-foreground/60">A manager checks it</span>
      );
    case "support":
      return <Link href={`/support?case=${shop.case_id}`} className={QUIET}>Reply</Link>;
    case "locked":
    case "lock_soon": {
      const whatsapp = whatsappLink(shop.contact_phone);
      return whatsapp ? (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={QUIET}>Message owner</a>
      ) : (
        <Link href={`/merchants/${shop.tenant_id}`} className={QUIET}>Open shop</Link>
      );
    }
  }
}

function Row({ shop, canCheckReceipts, now }: { shop: TodayShop; canCheckReceipts: boolean; now: Date }) {
  const words = rowWords(shop, now);
  return (
    <tr className="align-top">
      <td className="py-3 pl-5 pr-4">
        <Link href={`/merchants/${shop.tenant_id}`} dir="auto" className="block text-[15px] font-semibold text-foreground hover:underline">
          {shop.business_name}
        </Link>
        <p className="text-[13px] tabular-nums text-foreground/55">#{getMerchantCode({ id: shop.tenant_id, display_id: shop.display_id })}</p>
      </td>
      <td className="py-3 pr-4">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[words.tone])} />
          {words.label}
        </p>
        <p dir="auto" className="text-[13px] text-foreground/70">{words.why}</p>
      </td>
      <td className="py-3 pr-4 text-right text-[15px] tabular-nums text-foreground">{formatCount(shop.wallet_iqd)}</td>
      <td className="py-3 pr-4 text-[15px] tabular-nums text-foreground" dir="ltr">
        {shop.contact_phone ? formatIraqiPhoneDisplay(shop.contact_phone) : <span className="text-foreground/50">Not set</span>}
      </td>
      <td className="whitespace-nowrap py-3 pr-4 text-[13px] text-foreground/70">{waitWords(shop, now)}</td>
      <td className="py-3 pr-5 text-right">
        <NextStep shop={shop} canCheckReceipts={canCheckReceipts} />
      </td>
    </tr>
  );
}

/**
 * The shops that need someone, grouped by why (board h1, h7): each shop once,
 * the longest wait (or the soonest lock) on top, five per group with Show all.
 * When nobody waits the list says so, with when it last looked (board h6).
 */
export function TodayList({
  shops,
  canCheckReceipts,
  now,
}: {
  shops: TodayShop[];
  canCheckReceipts: boolean;
  /** The moment of the last check: waits are counted to it. */
  now: Date;
}) {
  const [open, setOpen] = useState<ReadonlySet<TodayGroup>>(new Set());
  const groups = groupRows(shops);

  if (groups.length === 0) {
    return (
      <div className="pastel-card flex items-center gap-3 px-5 py-6">
        <CircleCheck className="h-5 w-5 text-emerald-700" aria-hidden />
        <p className="text-[15px] font-semibold text-foreground">Nobody is waiting.</p>
        <p className="text-[13px] text-foreground/60">Last checked at {formatTime(now)}</p>
      </div>
    );
  }

  return (
    <div className="pastel-card overflow-hidden">
      <table className="w-full text-left">
        <thead className="border-b border-[var(--card-border)] text-[13px] text-foreground/60">
          <tr>
            <th scope="col" className="py-2.5 pl-5 font-medium">Shop</th>
            <th scope="col" className="py-2.5 font-medium">Why it is here</th>
            <th scope="col" className="py-2.5 pr-4 text-right font-medium">Wallet, IQD</th>
            <th scope="col" className="py-2.5 font-medium">Owner phone</th>
            <th scope="col" className="py-2.5 font-medium">Waiting</th>
            <th scope="col" className="py-2.5 pr-5"><span className="sr-only">Next step</span></th>
          </tr>
        </thead>
        {groups.map(({ group, rows }) => {
          const showAll = open.has(group);
          const shown = showAll ? rows : rows.slice(0, GROUP_PREVIEW);
          return (
            <tbody key={group} className="divide-y divide-[var(--card-border)] border-b border-[var(--card-border)] last:border-b-0">
              <tr className="bg-foreground/[0.03]">
                <th scope="rowgroup" colSpan={6} className="py-2 pl-5 pr-5 text-left">
                  <span className="text-[15px] font-semibold text-foreground">{GROUP_TITLE[group]}</span>
                  <span className="ml-2 text-[13px] font-normal text-foreground/60">{groupCount(group, rows)}</span>
                  {rows.length > GROUP_PREVIEW && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpen((current) => {
                          const next = new Set(current);
                          if (showAll) next.delete(group);
                          else next.add(group);
                          return next;
                        })
                      }
                      className="ml-3 text-[13px] font-semibold text-foreground underline-offset-2 hover:underline"
                    >
                      {showAll ? `Show the ${GROUP_PREVIEW} longest waiting` : `Show all ${formatCount(rows.length)}`}
                    </button>
                  )}
                </th>
              </tr>
              {shown.map((shop) => (
                <Row key={shop.tenant_id} shop={shop} canCheckReceipts={canCheckReceipts} now={now} />
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
