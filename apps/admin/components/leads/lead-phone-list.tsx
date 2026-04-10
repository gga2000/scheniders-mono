"use client";

import { cn } from "@/lib/utils";
import type { LeadPhoneNumber } from "@/types/leads";
import { Phone, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";

interface LeadPhoneListProps {
  pagePhone: string | null;
  phoneNumbers: LeadPhoneNumber[];
}

function PhoneRow({ title, number }: { title: string; number: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = number;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [number]);

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors">
      <Phone className="w-4 h-4 text-[var(--muted)] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium">
          {title}
        </div>
        <a
          href={`tel:${number}`}
          className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
        >
          {number}
        </a>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "p-1.5 rounded-md transition-all shrink-0",
          copied
            ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10"
            : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
        )}
        title="Copy number"
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export function LeadPhoneList({ pagePhone, phoneNumbers }: LeadPhoneListProps) {
  const hasAny = pagePhone || phoneNumbers.length > 0;

  if (!hasAny) {
    return (
      <div className="text-sm text-[var(--muted)] py-3 text-center">
        No phone numbers available
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {pagePhone && <PhoneRow title="Page Phone" number={pagePhone} />}
      {phoneNumbers.map((pn, i) => (
        <PhoneRow key={i} title={pn.title} number={pn.number} />
      ))}
    </div>
  );
}
