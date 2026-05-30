"use client";

import { useState } from "react";
import { BentoCard, ChunkyButton, MaterialIcon, ScribbleHeading, SectionEyebrow, Sticker, WhatsAppIcon } from "./primitives";
import { cn } from "@/lib/utils";

interface Props {
  whatsappNumber?: string | null;
  initialOrder?: string;
}

const SAMPLE_TIMELINE = [
  { state: "✅", label: "Order placed", time: "Today 10:42 AM", bg: "bg-candy-mint" },
  { state: "✅", label: "Confirmed", time: "Today 11:08 AM", bg: "bg-candy-mint" },
  { state: "🚚", label: "Dispatched from warehouse", time: "Today 1:30 PM", bg: "bg-candy-butter" },
  { state: "⏳", label: "Out for delivery", time: "Estimated 3:30–4:30 PM", bg: "bg-candy-pink text-white" },
  { state: "⚪", label: "Delivered — pay cash on arrival", time: "", bg: "bg-candy-lilac" },
];

export function SchneidersTrackForm({ whatsappNumber, initialOrder }: Props) {
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState(initialOrder ?? "");
  const [submitted, setSubmitted] = useState(!!initialOrder);

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="space-y-6">
      {/* Lookup form */}
      <BentoCard bg="white" className="p-5 space-y-4">
        <ScribbleHeading color="mint" as="h2">Find your order</ScribbleHeading>
        <form onSubmit={handleLookup} className="space-y-3">
          <div>
            <SectionEyebrow className="mb-1">Phone number</SectionEyebrow>
            <div className="flex gap-2">
              <span className="bento-card-sm bg-candy-butter rounded-xl px-3 py-3 font-display font-black text-base">+964</span>
              <div className="flex-1 bento-card-sm bg-candy-cream rounded-xl px-4 py-3">
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XX XXX XXXX"
                  className="w-full bg-transparent font-body font-bold text-base focus:outline-none placeholder:opacity-50"
                />
              </div>
            </div>
          </div>
          <div>
            <SectionEyebrow className="mb-1">Order number (optional)</SectionEyebrow>
            <div className="bento-card-sm bg-candy-cream rounded-xl px-4 py-3">
              <input
                type="text"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                placeholder="SCH-2026-00247"
                className="w-full bg-transparent font-body font-bold text-base focus:outline-none placeholder:opacity-50"
              />
            </div>
          </div>
          <ChunkyButton type="submit" bg="pink" size="md" fullWidth>
            Track order <MaterialIcon name="arrow_forward" className="text-lg" />
          </ChunkyButton>
        </form>
      </BentoCard>

      {/* Result */}
      {submitted && (
        <>
          <BentoCard bg="mint" rotate={1} className="p-5">
            <div className="flex items-center justify-between mb-2">
              <Sticker bg="cream" rotate={-3} size="xs">{order || "Order #SCH-2026-00247"}</Sticker>
              <Sticker bg="butter" rotate={3} size="xs">Live</Sticker>
            </div>
            <h2 className="font-display font-black text-2xl uppercase mt-2">On the way 🚚</h2>
            <p className="font-body text-sm mt-1">Out for delivery — arriving 3:30–4:30 PM</p>
          </BentoCard>

          <div className="relative space-y-3 pl-6">
            <div className="absolute top-2 bottom-2 left-3 border-l-[3px] border-dashed border-candy-ink/30" aria-hidden />
            {SAMPLE_TIMELINE.map((step) => (
              <div key={step.label} className="flex items-start gap-3">
                <div className={cn("w-8 h-8 rounded-full border-[3px] border-candy-ink flex items-center justify-center font-display font-black text-sm shadow-bento-sm relative", step.bg)}>
                  {step.state}
                </div>
                <div className="flex-1 pt-1">
                  <p className="font-display font-bold text-sm uppercase">{step.label}</p>
                  {step.time && <p className="font-body text-xs text-candy-ink/60">{step.time}</p>}
                </div>
              </div>
            ))}
          </div>

          {whatsappNumber && (
            <BentoCard bg="pink" className="p-5 text-white text-center">
              <h3 className="font-display font-black text-xl uppercase mb-2">Need help? 🆘</h3>
              <a
                href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="bento-card bg-white text-candy-ink font-display font-black text-base px-5 py-3 inline-flex items-center gap-2 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all rounded-xl uppercase tracking-tight"
              >
                <WhatsAppIcon className="w-5 h-5 text-candy-mint" />
                Get help
              </a>
            </BentoCard>
          )}
        </>
      )}
    </div>
  );
}
