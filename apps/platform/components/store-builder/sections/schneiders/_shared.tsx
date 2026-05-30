"use client";

import type { CandyColor } from "@scheniders/shared";
import { cn } from "@/lib/utils";

// ── Candy palette (matches storefront tokens) ──
export const CANDY_COLORS: { key: CandyColor; hex: string; name: string }[] = [
  { key: "pink", hex: "#ff5a8a", name: "Pink" },
  { key: "mint", hex: "#7cf0bd", name: "Mint" },
  { key: "butter", hex: "#ffd84a", name: "Butter" },
  { key: "lilac", hex: "#c5b6ff", name: "Lilac" },
  { key: "sky", hex: "#9ad8ff", name: "Sky" },
  { key: "cream", hex: "#fff7ed", name: "Cream" },
  { key: "ink", hex: "#1a1a1a", name: "Ink" },
];

export const candyHex = (c?: CandyColor) =>
  CANDY_COLORS.find((x) => x.key === c)?.hex ?? "#ff5a8a";

// ── IQD helpers ──
export const formatIQD = (n?: number | null) =>
  n == null ? "" : new Intl.NumberFormat("en-US").format(n);
export const parseIQD = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

// ── Candy swatch picker ──
export function CandyColorPicker({
  value,
  onChange,
  size = "md",
}: {
  value?: CandyColor;
  onChange: (next: CandyColor) => void;
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "w-6 h-6" : "w-8 h-8";
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {CANDY_COLORS.map(({ key, hex, name }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            title={name}
            className={cn(
              sz,
              "rounded-full border-[3px] border-[#1a1a1a] transition-transform",
              selected
                ? "ring-4 ring-primary/40 scale-110"
                : "hover:scale-105"
            )}
            style={{ backgroundColor: hex }}
          />
        );
      })}
    </div>
  );
}

// ── Common UI atoms ──
export function TextInput({
  value,
  onChange,
  placeholder,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      type={rest.type ?? "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-xl px-3 py-2 text-sm",
        "border border-(--card-border) bg-background",
        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
        "transition-colors",
        className
      )}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  className,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-xl px-3 py-2 text-sm",
        "border border-(--card-border) bg-background",
        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
        "transition-colors",
        className
      )}
    />
  );
}

export function Textarea({
  value,
  onChange,
  rows = 3,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-xl px-3 py-2 text-sm resize-y",
        "border border-(--card-border) bg-background",
        "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
        "transition-colors",
        className
      )}
    />
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors border-2",
          checked
            ? "bg-primary border-primary"
            : "bg-muted border-(--card-border)"
        )}
      >
        <span
          className={cn(
            "inline-block h-3 w-3 rounded-full bg-white shadow transition-transform",
            "absolute top-1/2 -translate-y-1/2",
            checked ? "translate-x-[18px]" : "translate-x-[2px]"
          )}
        />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  bg = "var(--pastel-pink)",
  iconClass = "text-rose-700",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  bg?: string;
  iconClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        <Icon className={cn("w-4 h-4", iconClass)} />
      </div>
      <h3 className="text-base font-semibold flex-1">{title}</h3>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium block">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
