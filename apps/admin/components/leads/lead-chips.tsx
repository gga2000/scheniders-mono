"use client";

import type { LeadSourcePlatform, Industry, LeadTier } from "@/types/leads";
import { LEAD_TIER_CONFIG, LEAD_TIER_UI } from "@/types/leads";
import {
  Phone,
  UserPlus,
  MoreHorizontal,
  Globe,
  ShoppingBag,
  Shirt,
  Sparkles,
  Utensils,
  Laptop,
  Heart,
  Palette,
  Camera,
  Music,
  Book,
  Home,
  Car,
  Plane,
  Flower,
  Coffee,
  Building2,
  Circle,
  Award,
  Star,
  Diamond,
  Crown,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Platform "source" chips ─────────────────────────────────────────────────
// Real brand logos on brand-colored pills, mirroring the platform app's order
// source badges. Brand SVG paths are from simple-icons (24×24).

function BrandSvg({ d, className }: { d: string; className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const PATHS = {
  instagram:
    "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  tiktok:
    "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  snapchat:
    "M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015-.06 0-.119.015-.18.015-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.123-.78-1.737-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.65.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  twitter:
    "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z",
} as const;

type ChipMeta = {
  label: string;
  /** Brand color applied to the logo only — the chip itself stays neutral/minimal. */
  color: string;
  logo: (cls: string) => React.ReactNode;
};

const PLATFORM_CHIP: Record<LeadSourcePlatform, ChipMeta> = {
  instagram: { label: "Instagram", color: "#E4405F", logo: (c) => <BrandSvg d={PATHS.instagram} className={c} /> },
  facebook: { label: "Facebook", color: "#1877F2", logo: (c) => <BrandSvg d={PATHS.facebook} className={c} /> },
  tiktok: { label: "TikTok", color: "var(--foreground)", logo: (c) => <BrandSvg d={PATHS.tiktok} className={c} /> },
  snapchat: { label: "Snapchat", color: "#E4B100", logo: (c) => <BrandSvg d={PATHS.snapchat} className={c} /> },
  youtube: { label: "YouTube", color: "#FF0000", logo: (c) => <BrandSvg d={PATHS.youtube} className={c} /> },
  twitter: { label: "X", color: "var(--foreground)", logo: (c) => <BrandSvg d={PATHS.twitter} className={c} /> },
  linkedin: { label: "LinkedIn", color: "#0A66C2", logo: (c) => <BrandSvg d={PATHS.linkedin} className={c} /> },
  website: { label: "Website", color: "var(--muted)", logo: (c) => <Globe className={c} /> },
  referral: { label: "Referral", color: "#8B5CF6", logo: (c) => <UserPlus className={c} /> },
  cold_call: { label: "Cold Call", color: "#F97316", logo: (c) => <Phone className={c} /> },
  other: { label: "Other", color: "var(--muted)", logo: (c) => <MoreHorizontal className={c} /> },
};

export function PlatformChip({
  platform,
  size = "md",
}: {
  platform: LeadSourcePlatform;
  size?: "sm" | "md";
}) {
  const meta = PLATFORM_CHIP[platform];
  const sm = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium text-[var(--foreground)] bg-black/[0.04] dark:bg-white/[0.06] ring-1 ring-inset ring-black/[0.05] dark:ring-white/[0.06]",
        sm ? "h-5 gap-1 px-2 text-[10px]" : "h-6 gap-1.5 px-2.5 text-[11px]",
      )}
    >
      <span className="inline-flex shrink-0" style={{ color: meta.color }}>
        {meta.logo(sm ? "h-3 w-3" : "h-3.5 w-3.5")}
      </span>
      {meta.label}
    </span>
  );
}

// ── Industry "category" chips ───────────────────────────────────────────────
// Soft tinted pill with the industry's own icon (in its brand color) and the
// Arabic label in readable foreground text.

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  ShoppingBag,
  Shirt,
  Sparkles,
  Utensils,
  Laptop,
  Heart,
  Palette,
  Camera,
  Music,
  Book,
  Home,
  Car,
  Plane,
  Flower,
  Coffee,
  Building2,
};

export function IndustryChip({
  industry,
  size = "md",
}: {
  industry?: Industry | null;
  size?: "sm" | "md";
}) {
  if (!industry) {
    return <span className="text-xs text-[var(--muted)]">—</span>;
  }
  const Icon = INDUSTRY_ICONS[industry.icon] ?? Building2;
  const color = industry.color || "#6B7280";
  const sm = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full font-medium text-[var(--foreground)]",
        sm ? "h-5 gap-1 pl-0.5 pr-2 text-[10px]" : "h-6 gap-1.5 pl-1 pr-2.5 text-[11px]",
      )}
      style={{ backgroundColor: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}3d` }}
    >
      <span
        className={cn("flex items-center justify-center rounded-full", sm ? "h-4 w-4" : "h-[18px] w-[18px]")}
        style={{ backgroundColor: color }}
      >
        <Icon className={cn("text-white", sm ? "h-2.5 w-2.5" : "h-3 w-3")} />
      </span>
      {industry.name_ar || industry.name}
    </span>
  );
}

// ── Tier / ranking chips ────────────────────────────────────────────────────

const TIER_ICONS: Record<LeadTier, LucideIcon> = {
  bronze: Circle,
  silver: Award,
  gold: Star,
  diamond: Diamond,
  legendary: Crown,
};

export function TierChip({ tier, size = "md" }: { tier: LeadTier; size?: "sm" | "md" }) {
  const cfg = LEAD_TIER_CONFIG[tier];
  const ui = LEAD_TIER_UI[tier];
  const Icon = TIER_ICONS[tier];
  const sm = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full font-bold",
        sm ? "h-5 gap-1 px-2 text-[10px]" : "h-6 gap-1.5 px-2.5 text-[11px]",
      )}
      style={{ backgroundColor: ui.soft, color: ui.solid }}
    >
      <Icon className={sm ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {cfg.label}
    </span>
  );
}
