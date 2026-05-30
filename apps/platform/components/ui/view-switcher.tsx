"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

export interface ViewOption<T extends string> {
  mode: T;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

interface ViewSwitcherProps<T extends string> {
  options: ViewOption<T>[];
  value: T;
  onChange: (mode: T) => void;
  size?: "sm" | "md";
  className?: string;
}

export function ViewSwitcher<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: ViewSwitcherProps<T>) {
  const btn = size === "sm" ? "p-1.5" : "p-2";
  const iconSz = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <div
      className={cn(
        "flex bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]",
        className,
      )}
      role="tablist"
    >
      {options.map(({ mode, icon: Icon, label }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(mode)}
            title={label}
            className={cn(
              btn,
              "rounded-lg transition-all",
              active
                ? "bg-[var(--ink)] text-white"
                : "text-muted hover:text-foreground",
            )}
          >
            <Icon className={iconSz} />
          </button>
        );
      })}
    </div>
  );
}
