"use client";

import { Eye, X } from "lucide-react";

interface ImpersonateBannerProps {
  businessName: string;
  onExit: () => void;
}

export function ImpersonateBanner({
  businessName,
  onExit,
}: ImpersonateBannerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 py-2 px-4 flex items-center justify-center gap-3 text-sm font-semibold">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4" />
        <span>Viewing as: {businessName}</span>
      </div>
      <button
        type="button"
        onClick={onExit}
        className="px-3 py-1 rounded-lg bg-amber-950/15 hover:bg-amber-950/25 transition-colors flex items-center gap-1.5 text-xs font-bold"
      >
        <X className="w-3.5 h-3.5" />
        Exit
      </button>
    </div>
  );
}
