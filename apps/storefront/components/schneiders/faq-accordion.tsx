"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BentoCard, MaterialIcon } from "./primitives";

interface FaqItem {
  q: string;
  a: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const open = openIdx === i;
        const tints = ["bg-bk-decor-a", "bg-bk-accent", "bg-bk-decor-c", "bg-bk-decor-b"] as const;
        const tint = tints[i % tints.length];
        return (
          <BentoCard key={item.q} bg="white" rotate={open ? 0 : (i % 2 === 0 ? 0.5 : -0.5)} className="p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenIdx(open ? null : i)}
              className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left"
            >
              <span className="font-display font-black text-base uppercase leading-tight flex-1">{item.q}</span>
              <span
                className={cn(
                  "w-9 h-9 rounded-xl border-[3px] border-bk-ink flex items-center justify-center shrink-0 transition-transform",
                  tint,
                  open && "rotate-45",
                )}
              >
                <MaterialIcon name="add" className="text-xl" />
              </span>
            </button>
            {open && (
              <div className="px-4 pb-4 font-body text-sm leading-relaxed text-bk-ink/90 border-t-[3px] border-dashed border-bk-ink/10 pt-3">
                {item.a}
              </div>
            )}
          </BentoCard>
        );
      })}
    </div>
  );
}
