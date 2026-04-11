"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Globe } from "lucide-react";
import dynamic from "next/dynamic";
import type { StoreConfig } from "@scheniders/shared";
import { DeviceFrame } from "./preview/device-frame";
import { DarkModeToggle } from "./preview/dark-mode-toggle";

const StorePreviewRenderer = dynamic(
  () =>
    import("./preview/store-preview-renderer").then(
      (mod) => mod.StorePreviewRenderer
    ),
  {
    ssr: false,
    loading: () => <PreviewSkeleton />,
  }
);

interface PreviewPanelProps {
  config: StoreConfig;
  businessName: string;
  device: "desktop" | "tablet" | "mobile";
  storefrontUrl: string;
  className?: string;
}

export function PreviewPanel({
  config,
  businessName,
  device,
  storefrontUrl,
  className,
}: PreviewPanelProps) {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-xl border border-(--card-border) bg-(--card-bg)",
        className
      )}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b border-(--card-border) bg-gray-50 px-4 py-2.5">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#FF5F57]" />
          <span className="h-2 w-2 rounded-full bg-[#FFBD2E]" />
          <span className="h-2 w-2 rounded-full bg-[#28C840]" />
        </div>

        {/* URL bar */}
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-white px-3 py-1 text-xs text-gray-500 shadow-inner ring-1 ring-gray-200">
          <Globe className="h-3 w-3 flex-shrink-0 text-gray-400" />
          <span className="truncate">{storefrontUrl}</span>
        </div>

        {/* Dark mode toggle */}
        <DarkModeToggle darkMode={darkMode} onChange={setDarkMode} />
      </div>

      {/* Preview area with dotted background pattern */}
      <div
        className="flex-1 overflow-y-auto p-6"
        style={{
          backgroundImage:
            "radial-gradient(circle, #d1d5db 0.75px, transparent 0.75px)",
          backgroundSize: "16px 16px",
          backgroundColor: "var(--background, #f9fafb)",
        }}
      >
        <DeviceFrame device={device}>
          <div
            style={darkMode ? {
              filter: "invert(1) hue-rotate(180deg)",
              backgroundColor: "#111",
            } : undefined}
          >
            <StorePreviewRenderer config={config} businessName={businessName} />
          </div>
        </DeviceFrame>
      </div>
    </div>
  );
}

/* ---------- Loading skeleton ---------- */

function PreviewSkeleton() {
  return (
    <div className="flex min-h-[400px] flex-col bg-white">
      {/* Header skeleton */}
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 animate-pulse rounded-md bg-gray-200" />
          <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-10 animate-pulse rounded bg-gray-100" />
          <div className="h-2 w-10 animate-pulse rounded bg-gray-100" />
          <div className="h-2 w-10 animate-pulse rounded bg-gray-100" />
        </div>
      </div>

      {/* Hero skeleton */}
      <div className="flex min-h-[200px] flex-col items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 px-6 py-10">
        <div className="mb-3 h-6 w-48 animate-pulse rounded bg-white/40" />
        <div className="mb-5 h-3 w-36 animate-pulse rounded bg-white/30" />
        <div className="h-8 w-24 animate-pulse rounded-full bg-white/50" />
      </div>

      {/* Products skeleton */}
      <div className="px-5 py-8">
        <div className="mb-4 h-4 w-20 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-gray-100">
              <div className="aspect-square animate-pulse bg-gray-100" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
