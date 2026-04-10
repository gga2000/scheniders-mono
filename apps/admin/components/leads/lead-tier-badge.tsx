"use client";

import { cn } from "@/lib/utils";
import type { LeadTier } from "@/types/leads";
import { LEAD_TIER_CONFIG } from "@/types/leads";
import { Circle, Award, Star, Diamond, Crown } from "lucide-react";

const TIER_ICONS = {
  bronze: Circle,
  silver: Award,
  gold: Star,
  diamond: Diamond,
  legendary: Crown,
};

const TIER_FOLLOWER_RANGES: Record<LeadTier, string> = {
  bronze: "0 – 999",
  silver: "1K – 9.9K",
  gold: "10K – 49.9K",
  diamond: "50K – 99.9K",
  legendary: "100K+",
};

interface LeadTierBadgeProps {
  tier: LeadTier;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function LeadTierBadge({ tier, size = "md", showLabel = true }: LeadTierBadgeProps) {
  const config = LEAD_TIER_CONFIG[tier];
  const Icon = TIER_ICONS[tier];

  if (size === "sm") {
    return (
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: config.color }}
        title={config.label}
      />
    );
  }

  if (size === "md") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold"
        style={{
          backgroundColor: `${config.color}26`,
          color: config.color,
        }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        {showLabel && config.label}
      </span>
    );
  }

  // lg
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold"
      style={{
        backgroundColor: `${config.color}26`,
        color: config.color,
      }}
    >
      <Icon className="w-4 h-4" />
      {showLabel && (
        <>
          <span>{config.label}</span>
          <span className="text-xs font-normal opacity-75">
            {TIER_FOLLOWER_RANGES[tier]}
          </span>
        </>
      )}
    </span>
  );
}
