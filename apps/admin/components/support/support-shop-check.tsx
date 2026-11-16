"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, RotateCw, Stethoscope, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupportShopCheck } from "@/hooks/use-support-cases";
import { shopCheckLines, type CheckState } from "@/lib/support-shop-check";
import { formatTime } from "@/lib/format";

const STATE_ICON: Record<CheckState, { icon: typeof CheckCircle2; className: string; label: string }> = {
  ok: { icon: CheckCircle2, className: "text-green-700", label: "Fine" },
  look: { icon: AlertTriangle, className: "text-amber-600", label: "Worth a look" },
  broken: { icon: XCircle, className: "text-red-700", label: "Broken" },
  none: { icon: MinusCircle, className: "text-foreground/30", label: "Not in use" },
};

/** One button runs every check on the shop that wrote; red lines first. */
export function SupportShopCheck({ caseId }: { caseId: string }) {
  const [asked, setAsked] = useState(false);
  const check = useSupportShopCheck(caseId, asked);

  if (!asked) {
    return (
      <button
        type="button"
        onClick={() => setAsked(true)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90"
      >
        <Stethoscope className="h-3.5 w-3.5" />
        Check this shop
      </button>
    );
  }

  if (check.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
        Could not check this shop. {check.error.message}
        <button type="button" onClick={() => check.refetch()} className="ml-1 font-semibold underline">
          Try again
        </button>
      </div>
    );
  }

  if (!check.data) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-xs text-foreground-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking the shop...
      </div>
    );
  }

  const order: Record<CheckState, number> = { broken: 0, look: 1, ok: 2, none: 3 };
  const lines = shopCheckLines(check.data.check, check.data.tenantId).sort((a, b) => order[a.state] - order[b.state]);
  const broken = lines.filter((l) => l.state === "broken").length;
  const look = lines.filter((l) => l.state === "look").length;
  const checkedAt = formatTime(check.data.check.checked_at);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">
          {broken > 0 ? `${broken} broken` : look > 0 ? `${look} worth a look` : "All fine"}
          <span className="ml-1.5 font-normal text-foreground/40">at {checkedAt}</span>
        </p>
        <button
          type="button"
          onClick={() => check.refetch()}
          disabled={check.isFetching}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-foreground/60 transition-colors hover:bg-foreground/5 disabled:opacity-50"
        >
          <RotateCw className={cn("h-3 w-3", check.isFetching && "animate-spin")} />
          Check again
        </button>
      </div>
      <ul className="space-y-1.5">
        {lines.map((line) => {
          const { icon: Icon, className, label } = STATE_ICON[line.state];
          const body = (
            <>
              <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", className)} aria-label={label} />
              <span className="min-w-0">
                <span className="font-semibold text-foreground">{line.label}</span>{" "}
                <span dir="auto" className="break-words text-foreground/70">
                  {line.text}
                </span>
              </span>
            </>
          );
          const row = cn(
            "flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs",
            line.state === "broken" && "bg-red-50",
            line.state === "look" && "bg-amber-50",
          );
          if (!line.href) {
            return (
              <li key={line.key} className={row}>
                {body}
              </li>
            );
          }
          const external = line.href.startsWith("https://");
          return (
            <li key={line.key}>
              <Link
                href={line.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                className={cn(row, "transition-colors hover:bg-foreground/5")}
              >
                {body}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
