"use client";

import { MessageCircle } from "lucide-react";
import { toIntlIraqi } from "@/components/leads/lead-phone";
import { MarkContacted } from "@/components/trials/mark-contacted";
import { CopyTrialReport } from "@/components/trials/copy-trial-report";
import { formatAgo } from "@/lib/support";
import { trialFacts, type TrialFollowUpRow } from "@/lib/trial-pipeline";

interface TrialFollowUpLineProps {
  row: TrialFollowUpRow;
  shopName: string;
  /** Staff who handle support see "Mark contacted" and "Copy report for WhatsApp". */
  canLogCall: boolean;
  now: number;
}

/**
 * The follow-up line under a shop on Trials (Fermi B12 item 1, concept A,
 * Ali's pick 22 Nov): where its trial is, what it has done, who called last,
 * and what a caller does next: message the owner, send the trial report
 * (item 2), log the call. The row above it is unchanged.
 */
export function TrialFollowUpLine({ row, shopName, canLogCall, now }: TrialFollowUpLineProps) {
  const facts = trialFacts(row, (at) => formatAgo(at, now));
  const phone = row.follow_up?.owner_phone ? toIntlIraqi(row.follow_up.owner_phone) : null;

  return (
    <div className="rounded-xl border border-dashed border-amber-500/35 bg-amber-500/[0.06] px-3.5 py-2.5">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/80">
        {facts.map((fact) => (
          <span key={fact.label}>
            {fact.label}{" "}
            <span dir="auto" className="font-semibold text-foreground">
              {fact.value}
            </span>
          </span>
        ))}
      </p>
      {row.follow_up && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {phone ? (
            <a
              href={`https://wa.me/${phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp owner
            </a>
          ) : (
            <span className="text-xs text-foreground/70">No owner phone</span>
          )}
          {canLogCall && <CopyTrialReport shopId={row.id} shopName={shopName} />}
          {canLogCall && <MarkContacted shopId={row.id} shopName={shopName} />}
        </div>
      )}
    </div>
  );
}
