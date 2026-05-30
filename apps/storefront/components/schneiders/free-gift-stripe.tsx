"use client";

import Image from "next/image";
import type { FreeGiftConfig } from "@scheniders/shared";
import { BentoCard, MaterialIcon, Sticker } from "./primitives";
import { formatPrice } from "./format";

/**
 * Cart upsell stripe — shows when free_gift is enabled.
 * Progress bar fills as the subtotal approaches the threshold.
 * Switches to a "🎉 Free gift unlocked!" state when met.
 */
export function FreeGiftStripe({
  config,
  subtotal,
}: {
  config: FreeGiftConfig | undefined;
  subtotal: number;
}) {
  if (!config?.enabled) return null;
  const threshold = config.threshold_iqd ?? 0;
  if (threshold <= 0) return null;

  const remaining = Math.max(0, threshold - subtotal);
  const unlocked = remaining === 0;
  const progress = Math.min(100, Math.round((subtotal / threshold) * 100));
  const label = config.label ?? "Free Gift with this order 🎁";

  return (
    <BentoCard bg={unlocked ? "mint" : "butter"} rotate={unlocked ? -1 : 1} className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        {config.image_url ? (
          <div className="w-12 h-12 rounded-xl border-[3px] border-candy-ink overflow-hidden bg-white shrink-0 relative">
            <Image src={config.image_url} alt="" fill className="object-cover" sizes="48px" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-xl border-[3px] border-candy-ink flex items-center justify-center bg-white text-2xl shrink-0">
            🎁
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-display font-black uppercase text-sm leading-tight">{label}</p>
          {unlocked ? (
            <p className="font-body text-xs text-candy-ink/80 mt-0.5">Added to your order automatically.</p>
          ) : (
            <p className="font-body text-xs text-candy-ink/80 mt-0.5">
              Add {formatPrice(remaining)} more to unlock.
            </p>
          )}
        </div>
        {unlocked && (
          <Sticker bg="pink" rotate={-6} size="xs">
            <MaterialIcon name="redeem" className="text-sm align-middle" /> Unlocked
          </Sticker>
        )}
      </div>
      <div className="h-3 w-full rounded-full border-[3px] border-candy-ink bg-white overflow-hidden">
        <div
          className="h-full bg-candy-pink transition-all"
          style={{ width: `${progress}%` }}
          aria-label={`${progress}% to free gift`}
        />
      </div>
    </BentoCard>
  );
}
