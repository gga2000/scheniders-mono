"use client";

import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  vip: "bg-amber-100 text-amber-700 ring-amber-200",
  regular: "bg-blue-100 text-blue-700 ring-blue-200",
  new: "bg-teal-100 text-teal-700 ring-teal-200",
  blacklisted: "bg-red-100 text-red-600 ring-red-200",
};

// Deterministic color from phone string
const PALETTE = [
  "bg-violet-100 text-violet-700 ring-violet-200",
  "bg-sky-100 text-sky-700 ring-sky-200",
  "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "bg-rose-100 text-rose-700 ring-rose-200",
  "bg-indigo-100 text-indigo-700 ring-indigo-200",
  "bg-orange-100 text-orange-700 ring-orange-200",
  "bg-cyan-100 text-cyan-700 ring-cyan-200",
  "bg-pink-100 text-pink-700 ring-pink-200",
];

function hashPhone(phone: string): number {
  let h = 0;
  for (let i = 0; i < phone.length; i++) {
    h = ((h << 5) - h + phone.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface CustomerAvatarProps {
  name: string;
  phone: string;
  status?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "h-8 w-8 text-xs ring-1",
  md: "h-10 w-10 text-sm ring-2",
  lg: "h-16 w-16 text-xl ring-2",
};

export function CustomerAvatar({
  name,
  phone,
  status,
  size = "md",
  className,
}: CustomerAvatarProps) {
  const colorClass = status && STATUS_COLORS[status]
    ? STATUS_COLORS[status]
    : PALETTE[hashPhone(phone) % PALETTE.length];

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold shrink-0 ring-inset select-none",
        SIZE_MAP[size],
        colorClass,
        className
      )}
      aria-label={`Avatar for ${name}`}
    >
      {getInitials(name)}
    </div>
  );
}
