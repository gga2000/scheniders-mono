"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyableTextProps {
  value: string;
  display?: string;
  className?: string;
  iconClassName?: string;
}

export function CopyableText({
  value,
  display,
  className,
  iconClassName,
}: CopyableTextProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard might be blocked; silently ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : `Copy ${value}`}
      aria-label={copied ? "Copied" : `Copy ${value}`}
      className={cn(
        "group/copy inline-flex items-center gap-1.5 transition-colors text-left",
        "hover:text-[var(--primary)] cursor-copy",
        className
      )}
    >
      <span className="truncate">{display ?? value}</span>
      <span
        className={cn(
          "shrink-0 transition-all opacity-0 group-hover/copy:opacity-100",
          copied && "opacity-100",
          iconClassName
        )}
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-500" />
        ) : (
          <Copy className="w-3 h-3 text-foreground/40" />
        )}
      </span>
    </button>
  );
}
