"use client";

import { cn } from "@/lib/utils";
import type { LeadSocialLink, LeadSourcePlatform } from "@/types/leads";
import { PLATFORM_CONFIG } from "@/types/leads";
import {
  Instagram,
  Facebook,
  Music2,
  Ghost,
  Youtube,
  Twitter,
  Linkedin,
  Globe,
  UserPlus,
  Phone,
  MoreHorizontal,
  ExternalLink,
  Users,
  Link2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  Instagram: Instagram,
  Facebook: Facebook,
  Music2: Music2,
  Ghost: Ghost,
  Youtube: Youtube,
  Twitter: Twitter,
  Linkedin: Linkedin,
  Globe: Globe,
  UserPlus: UserPlus,
  Phone: Phone,
  MoreHorizontal: MoreHorizontal,
};

function getPlatformIcon(platform: string): LucideIcon {
  const config = PLATFORM_CONFIG[platform as LeadSourcePlatform];
  if (config) {
    return PLATFORM_ICONS[config.icon] || Link2;
  }
  return Link2;
}

function getPlatformColor(platform: string): string {
  const config = PLATFORM_CONFIG[platform as LeadSourcePlatform];
  return config?.color || "#6B7280";
}

function getPlatformLabel(platform: string): string {
  const config = PLATFORM_CONFIG[platform as LeadSourcePlatform];
  return config?.label || platform;
}

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return count.toLocaleString();
}

interface LeadSocialLinksProps {
  socialLinks: LeadSocialLink[];
}

export function LeadSocialLinks({ socialLinks }: LeadSocialLinksProps) {
  if (socialLinks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-[var(--muted)]">
        <Link2 className="w-8 h-8 mb-2 opacity-40" />
        <span className="text-sm">No social links added</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {socialLinks.map((link) => {
        const Icon = getPlatformIcon(link.platform);
        const color = getPlatformColor(link.platform);
        const label = getPlatformLabel(link.platform);

        return (
          <div
            key={link.id}
            className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-3 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${color}20` }}
                >
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--foreground)] truncate">
                    {label}
                  </div>
                  {link.username && (
                    <div className="text-[11px] text-[var(--muted)] truncate">
                      @{link.username}
                    </div>
                  )}
                </div>
              </div>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors shrink-0"
                title={`Open ${label} profile`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {link.follower_count > 0 && (
              <div className="flex items-center gap-1 text-xs text-[var(--muted)]">
                <Users className="w-3 h-3" />
                <span className="font-medium text-[var(--foreground)]">
                  {formatFollowers(link.follower_count)}
                </span>
                <span>followers</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
