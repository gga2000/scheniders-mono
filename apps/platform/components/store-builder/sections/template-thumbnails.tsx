"use client";

import type { TemplateName } from "@scheniders/shared";

interface Props {
  template: TemplateName;
  accent: string;
}

export function TemplateThumbnail({ template, accent }: Props) {
  switch (template) {
    case "schneiders":
      return <SchneidersThumb accent={accent} />;
    case "fashion":
      return <FashionThumb accent={accent} />;
    case "beauty":
      return <BeautyThumb accent={accent} />;
    case "electronics":
      return <ElectronicsThumb accent={accent} />;
    case "general":
      return <GeneralThumb accent={accent} />;
    case "clean":
      return <CleanThumb accent={accent} />;
    default:
      return <GeneralThumb accent={accent} />;
  }
}

function Bar({ w = 50, h = 4, c = "#27272a", op = 1 }: { w?: number; h?: number; c?: string; op?: number }) {
  return (
    <div
      style={{ width: `${w}%`, height: h, backgroundColor: c, opacity: op, borderRadius: 1 }}
    />
  );
}

function Tile({ c = "#e4e4e7", aspect = "1/1" }: { c?: string; aspect?: string }) {
  return <div className="rounded-sm" style={{ backgroundColor: c, aspectRatio: aspect }} />;
}

/* ── Schneiders: editorial, asymmetric, marquee ── */
function SchneidersThumb({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0 bg-[#fafaf7] flex flex-col">
      {/* Top header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: accent }} />
          <div className="h-1.5 w-10 bg-zinc-800 rounded-sm" />
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => <div key={i} className="h-1 w-4 bg-zinc-400 rounded-sm" />)}
        </div>
      </div>
      {/* Marquee */}
      <div className="bg-zinc-900 px-2 py-0.5">
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-0.5 w-6 bg-white/40 rounded-full" />)}
        </div>
      </div>
      {/* Hero split */}
      <div className="flex-1 grid grid-cols-12 gap-2 p-3">
        <div className="col-span-7 flex flex-col justify-between">
          <div className="space-y-1.5">
            <div className="h-1 w-6 bg-zinc-400 rounded-full" />
            <div className="space-y-1 pt-1">
              <div className="h-2.5 w-[90%] bg-zinc-900 rounded-sm" style={{ fontFamily: "serif" }} />
              <div className="h-2.5 w-[70%] bg-zinc-700 rounded-sm" />
              <div className="h-2.5 w-[80%] bg-zinc-900 rounded-sm" />
            </div>
            <div className="pt-2 space-y-0.5">
              <div className="h-1 w-[60%] bg-zinc-400 rounded-full" />
              <div className="h-1 w-[55%] bg-zinc-400 rounded-full" />
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="h-3 w-12 bg-zinc-900 rounded-sm" />
            <div className="h-3 w-10 border-b border-zinc-400" />
          </div>
        </div>
        <div className="col-span-5 relative">
          <div className="absolute inset-0 bg-zinc-300 rounded-sm" style={{ background: `linear-gradient(135deg, ${accent}55, #71717a)` }} />
          <div className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full" style={{ backgroundColor: accent }} />
        </div>
      </div>
      {/* Category rail */}
      <div className="px-3 pb-2 flex gap-1.5 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-5 w-10 shrink-0 rounded-sm bg-gradient-to-br from-zinc-300 to-zinc-200" />
        ))}
      </div>
    </div>
  );
}

/* ── Fashion: full-bleed hero, 4-up grid ── */
function FashionThumb({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200">
        <div className="h-1.5 w-8 bg-zinc-900 rounded-sm" />
        <div className="flex gap-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-1 w-3 bg-zinc-400 rounded-sm" />)}</div>
      </div>
      {/* Full-bleed hero */}
      <div className="relative h-[55%]" style={{ background: `linear-gradient(160deg, ${accent}, #18181b)` }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 space-y-1">
          <div className="h-2.5 w-[60%] bg-white rounded-sm" />
          <div className="h-1 w-[45%] bg-white/70 rounded-sm" />
          <div className="h-2.5 w-12 border border-white/80 mt-1" />
        </div>
      </div>
      {/* 4-up grid */}
      <div className="flex-1 grid grid-cols-4 gap-1.5 p-3">
        {[0, 1, 2, 3].map((i) => (
          <Tile key={i} c="#e4e4e7" />
        ))}
      </div>
    </div>
  );
}

/* ── Beauty: centered serif hero, soft pink ── */
function BeautyThumb({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0 bg-rose-50 flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-rose-200">
        <div className="h-1.5 w-8 bg-zinc-900 rounded-sm" />
        <div className="flex gap-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-1 w-3 bg-zinc-400 rounded-sm" />)}</div>
      </div>
      {/* Centered hero */}
      <div className="h-[48%] flex flex-col items-center justify-center px-4 gap-1.5">
        <div className="h-1 w-4 rounded-full" style={{ backgroundColor: accent }} />
        <div className="h-2.5 w-[70%] bg-zinc-900 rounded-sm" />
        <div className="h-2.5 w-[55%] bg-zinc-700 rounded-sm" />
        <div className="h-1 w-6 rounded-full mt-1" style={{ backgroundColor: accent }} />
        <div className="h-3 w-16 bg-zinc-900 rounded-full mt-2" />
      </div>
      {/* Grid with whitespace */}
      <div className="flex-1 grid grid-cols-4 gap-2 px-4 pb-3">
        {[0, 1, 2, 3].map((i) => (
          <Tile key={i} c="#fff" />
        ))}
      </div>
    </div>
  );
}

/* ── Electronics: dark surface, split hero with feature cards ── */
function ElectronicsThumb({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0 bg-zinc-950 flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800">
        <div className="h-1.5 w-8 bg-white rounded-sm" />
        <div className="flex gap-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-1 w-3 bg-zinc-600 rounded-sm" />)}</div>
      </div>
      {/* Hero split */}
      <div className="relative grid grid-cols-2 gap-2 p-3 h-[50%]" style={{ background: `radial-gradient(circle at 80% 20%, ${accent}30, transparent)` }}>
        <div className="space-y-1 self-center">
          <div className="h-2.5 w-[85%] bg-white rounded-sm" />
          <div className="h-2.5 w-[60%] bg-zinc-300 rounded-sm" />
          <div className="h-1 w-[40%] bg-zinc-500 rounded-sm" />
          <div className="h-3 w-12 mt-1 rounded-sm" style={{ backgroundColor: accent }} />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-sm bg-zinc-900 border border-zinc-800 flex flex-col items-center justify-center gap-0.5 p-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
              <div className="h-0.5 w-3 bg-zinc-500 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      {/* Grid */}
      <div className="flex-1 grid grid-cols-4 gap-1.5 p-3 pt-0">
        {[0, 1, 2, 3].map((i) => (
          <Tile key={i} c="#1f1f23" />
        ))}
      </div>
    </div>
  );
}

/* ── General: gradient hero + categories + grid ── */
function GeneralThumb({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0 bg-zinc-50 flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-zinc-200">
        <div className="h-1.5 w-8 bg-zinc-900 rounded-sm" />
        <div className="flex gap-1.5">{[0, 1, 2].map((i) => <div key={i} className="h-1 w-3 bg-zinc-400 rounded-sm" />)}</div>
      </div>
      {/* Gradient hero */}
      <div className="h-[35%] flex flex-col items-center justify-center gap-1.5" style={{ background: `linear-gradient(135deg, ${accent}, #8b5cf6)` }}>
        <div className="h-2.5 w-[65%] bg-white rounded-sm" />
        <div className="h-1 w-[45%] bg-white/80 rounded-full" />
        <div className="h-3 w-14 bg-white rounded-md" />
      </div>
      {/* Category pills */}
      <div className="grid grid-cols-6 gap-1.5 p-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="aspect-square rounded-md bg-white border border-zinc-200" />
        ))}
      </div>
      {/* Grid */}
      <div className="flex-1 grid grid-cols-4 gap-1.5 px-2.5 pb-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Tile key={i} c="#fff" />
        ))}
      </div>
    </div>
  );
}

/* ── Clean: minimalist hero, dense grid ── */
function CleanThumb({ accent }: { accent: string }) {
  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-100">
        <div className="h-1.5 w-6 bg-zinc-900 rounded-sm" />
        <div className="flex gap-1.5">{[0, 1].map((i) => <div key={i} className="h-1 w-3 bg-zinc-300 rounded-sm" />)}</div>
      </div>
      <div className="h-[38%] flex flex-col items-center justify-center gap-1.5">
        <div className="h-2 w-[55%] bg-zinc-900 rounded-sm" />
        <div className="h-1 w-[35%] bg-zinc-500 rounded-sm" />
        <div className="h-2.5 w-10 rounded-sm mt-1" style={{ backgroundColor: accent }} />
      </div>
      <div className="flex-1 grid grid-cols-4 gap-1 p-2.5 border-t border-zinc-100">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Tile key={i} c="#f4f4f5" />
        ))}
      </div>
    </div>
  );
}
