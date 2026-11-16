"use client";

import { useState } from "react";
import Link from "next/link";
import { getMerchantCode } from "@scheniders/shared";
import { formatCount, formatTime } from "@/lib/format";
import { HANDLED_PREVIEW, handledWords, type HandledRow } from "@/lib/today";

/**
 * Handled today, under the waiting list (board h8): what staff dealt with since
 * midnight, newest first, with the time and who did it. A row someone handles
 * leaves the list above and shows here at the next check. It answers who did
 * what this morning; nothing handled yet shows nothing.
 */
export function HandledToday({ rows }: { rows: HandledRow[] }) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) return null;
  const shown = showAll ? rows : rows.slice(0, HANDLED_PREVIEW);

  return (
    <section aria-labelledby="handled-today" className="pastel-card overflow-hidden">
      <div className="flex items-baseline gap-2 border-b border-[var(--card-border)] bg-foreground/[0.03] px-5 py-2">
        <h2 id="handled-today" className="text-[15px] font-semibold text-foreground">Handled today</h2>
        <span className="text-[13px] text-foreground/60">{formatCount(rows.length)} so far</span>
        {rows.length > HANDLED_PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll((current) => !current)}
            className="ml-1 text-[13px] font-semibold text-foreground underline-offset-2 hover:underline"
          >
            {showAll ? `Show the ${HANDLED_PREVIEW} latest` : `Show all ${formatCount(rows.length)}`}
          </button>
        )}
      </div>
      <table className="w-full text-left">
        <thead className="sr-only">
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Shop</th>
            <th scope="col">What was done</th>
            <th scope="col">Who</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--card-border)]">
          {shown.map((row, index) => (
            <tr key={`${row.kind}-${row.tenant_id}-${row.at}-${index}`} className="align-baseline">
              <td className="w-20 whitespace-nowrap py-2.5 pl-5 pr-4 text-[13px] tabular-nums text-foreground/60">
                {formatTime(row.at)}
              </td>
              <td className="w-64 py-2.5 pr-4">
                <Link href={`/merchants/${row.tenant_id}`} dir="auto" className="text-[15px] font-semibold text-foreground hover:underline">
                  {row.business_name}
                </Link>
                <span className="ml-2 text-[13px] tabular-nums text-foreground/55">
                  #{getMerchantCode({ id: row.tenant_id, display_id: row.display_id })}
                </span>
              </td>
              <td className="py-2.5 pr-4 text-[15px] text-foreground/80">
                {row.kind === "reply" ? (
                  <Link href={`/support?case=${row.case_id}`} className="hover:underline">{handledWords(row)}</Link>
                ) : (
                  handledWords(row)
                )}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-5 text-right text-[13px] text-foreground/70">{row.who}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
