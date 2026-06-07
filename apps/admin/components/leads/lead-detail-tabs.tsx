"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PLATFORM_CONFIG } from "@/types/leads";
import type { Lead } from "@/types/leads";
import {
  Phone,
  MessageCircle,
  MapPin,
  TrendingUp,
  Users,
  Star,
  ExternalLink,
  Copy,
  Store,
  Globe,
  Building2,
  Mail,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────

export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffMonth / 12)}y ago`;
}

export function daysBetween(from: string, to: Date = new Date()): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000);
}

export function stalenessColor(dateStr: string | null | undefined): string {
  if (!dateStr) return "#EF4444"; // red - never contacted
  const days = daysBetween(dateStr);
  if (days <= 3) return "#22C55E"; // green
  if (days <= 7) return "#F59E0B"; // amber
  return "#EF4444"; // red
}

export const fmt = (n: number) => n.toLocaleString();

// ── Score Breakdown Keys ───────────────────────────────────────────────

export const SCORE_KEYS: { key: keyof Lead["score_breakdown"]; label: string; color: string }[] = [
  { key: "followers", label: "Followers", color: "#60A5FA" },
  { key: "engagement", label: "Engagement", color: "#34D399" },
  { key: "orders", label: "Orders", color: "#F59E0B" },
  { key: "contact", label: "Contact", color: "#A78BFA" },
  { key: "platform", label: "Platform", color: "#F97316" },
  { key: "responsiveness", label: "Responsiveness", color: "#EC4899" },
  { key: "store", label: "Store", color: "#06B6D4" },
];

// ═══════════════════════════════════════════════════════════════════════
// Tab Content Components
// ═══════════════════════════════════════════════════════════════════════

// ── Overview Tab ───────────────────────────────────────────────────────

export function OverviewContent({ lead }: { lead: Lead }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Contact Info */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Phone className="w-4 h-4 text-[var(--muted)]" />
          Contact Information
        </h3>
        <div className="space-y-3">
          {lead.contact_via_dm && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#A78BFA]/10 text-[#A78BFA]">
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold">Direct messages only — no phone on file</span>
            </div>
          )}
          {lead.website_url && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-[var(--muted)]">Website</span>
              <a
                href={lead.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline truncate max-w-[200px]"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{lead.website_url.replace(/^https?:\/\//, "")}</span>
              </a>
            </div>
          )}
          {lead.email && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-[var(--muted)]">Email</span>
              <a
                href={`mailto:${lead.email}`}
                className="flex items-center gap-1 text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors truncate max-w-[200px]"
              >
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{lead.email}</span>
              </a>
            </div>
          )}
          {lead.page_phone && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Page Phone</span>
              <a
                href={`tel:${lead.page_phone}`}
                className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
              >
                {lead.page_phone}
              </a>
            </div>
          )}
          {lead.phone_numbers?.length > 0 && (
            <div>
              <span className="text-xs text-[var(--muted)] block mb-2">Additional Numbers</span>
              {lead.phone_numbers.map((pn, i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <span className="text-xs text-[var(--muted)]">{pn.title}</span>
                  <a
                    href={`tel:${pn.number}`}
                    className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
                  >
                    {pn.number}
                  </a>
                </div>
              ))}
            </div>
          )}
          {lead.management_info && (
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs text-[var(--muted)] shrink-0">Management Info</span>
              <p className="text-sm text-[var(--foreground)] text-right">{lead.management_info}</p>
            </div>
          )}
          {!lead.contact_via_dm &&
            !lead.website_url &&
            !lead.email &&
            !lead.page_phone &&
            !lead.phone_numbers?.length &&
            !lead.management_info && (
              <p className="text-sm text-[var(--muted)] italic">No contact info available</p>
            )}
        </div>
      </div>

      {/* Location */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[var(--muted)]" />
          Location
        </h3>
        <div className="space-y-3">
          {lead.is_online_only ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#A78BFA]/10 text-[#A78BFA]">
              <Globe className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold">Online shop only — no physical location</span>
            </div>
          ) : (
            <>
              {lead.city && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--muted)]">City</span>
                  <span className="text-sm font-medium text-[var(--foreground)]">{lead.city}</span>
                </div>
              )}
              {lead.address && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--muted)]">Address</span>
                  <span className="text-sm font-medium text-[var(--foreground)]">{lead.address}</span>
                </div>
              )}
              {lead.governorate_code && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--muted)]">Governorate</span>
                  <span className="text-sm font-medium text-[var(--foreground)]">{lead.governorate_code}</span>
                </div>
              )}
              {!lead.city && !lead.address && !lead.governorate_code && !lead.branches?.length && (
                <p className="text-sm text-[var(--muted)] italic">No location info available</p>
              )}

              {lead.branches?.length > 0 && (
                <div className="pt-1 space-y-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                    <Building2 className="w-3.5 h-3.5" />
                    Branches ({lead.branches.length})
                  </span>
                  {lead.branches.map((branch, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-[var(--card-border)] bg-black/[0.02] dark:bg-white/[0.02] p-3"
                    >
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {branch.name || `Branch ${i + 1}`}
                      </p>
                      {(branch.city || branch.address) && (
                        <p className="text-xs text-[var(--muted)] mt-0.5">
                          {[branch.city, branch.address].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {branch.phones?.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {branch.phones.map((pn, pi) => (
                            <div key={pi} className="flex items-center justify-between gap-3">
                              <span className="text-xs text-[var(--muted)]">{pn.title || "Phone"}</span>
                              <a
                                href={`tel:${pn.number}`}
                                className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] transition-colors font-mono"
                              >
                                {pn.number}
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Social Metrics */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[var(--muted)]" />
          Social Metrics
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-[var(--muted)] block">Avg Views</span>
            <span className="text-lg font-bold text-[var(--foreground)]">{fmt(lead.avg_view_count)}</span>
          </div>
          <div>
            <span className="text-xs text-[var(--muted)] block">Avg Likes</span>
            <span className="text-lg font-bold text-[var(--foreground)]">{fmt(lead.avg_like_count)}</span>
          </div>
          <div>
            <span className="text-xs text-[var(--muted)] block">Avg Comments</span>
            <span className="text-lg font-bold text-[var(--foreground)]">{fmt(lead.avg_comments_count)}</span>
          </div>
          <div>
            <span className="text-xs text-[var(--muted)] block">Avg Orders / Day</span>
            <span className="text-lg font-bold text-[var(--foreground)]">{fmt(lead.avg_order_count)}</span>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-[var(--muted)]" />
          Tags
        </h3>
        {lead.tags?.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {lead.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)] italic">No tags</p>
        )}
      </div>

      {/* Source Info */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--muted)]" />
          Source Information
        </h3>
        <div className="space-y-3">
          {lead.source_campaign && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Campaign</span>
              <span className="text-sm font-medium text-[var(--foreground)]">{lead.source_campaign}</span>
            </div>
          )}
          {lead.source_medium && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Medium</span>
              <span className="text-sm font-medium text-[var(--foreground)]">{lead.source_medium}</span>
            </div>
          )}
          {lead.source_referrer && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Referrer</span>
              <span className="text-sm font-medium text-[var(--foreground)] truncate max-w-[200px]">{lead.source_referrer}</span>
            </div>
          )}
          {!lead.source_campaign && !lead.source_medium && !lead.source_referrer && (
            <p className="text-sm text-[var(--muted)] italic">No source info available</p>
          )}
        </div>
      </div>

      {/* Assignment & Staleness */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--muted)]" />
          Assignment & Staleness
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Assigned To</span>
            <span className="text-sm font-medium text-[var(--foreground)]">
              {lead.assigned_user?.display_name ?? lead.assigned_user?.email ?? "Unassigned"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Last Contacted</span>
            <span className="flex items-center gap-2 text-sm font-medium">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: stalenessColor(lead.last_contacted_at) }}
              />
              <span className="text-[var(--foreground)]">{relativeTime(lead.last_contacted_at)}</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Next Follow-up</span>
            <span className="flex items-center gap-2 text-sm font-medium">
              {lead.next_follow_up_at ? (
                <>
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        new Date(lead.next_follow_up_at) < new Date() ? "#EF4444" : "#22C55E",
                    }}
                  />
                  <span className="text-[var(--foreground)]">
                    {new Date(lead.next_follow_up_at).toLocaleDateString()}
                  </span>
                </>
              ) : (
                <span className="text-[var(--muted)] italic">Not scheduled</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Social Tab ─────────────────────────────────────────────────────────

export function SocialContent({
  socialLinks,
}: {
  socialLinks: { id: string; platform: string; url: string; username: string | null; follower_count: number }[];
}) {
  if (!socialLinks?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--muted)]">
        <Globe className="w-10 h-10 mb-3" />
        <p className="text-sm font-semibold">No social links added</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {socialLinks.map((link) => {
        const cfg = PLATFORM_CONFIG[link.platform as keyof typeof PLATFORM_CONFIG];
        return (
          <div
            key={link.id}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${cfg?.color ?? "#6B7280"}15` }}
              >
                <Globe className="w-5 h-5" style={{ color: cfg?.color ?? "#6B7280" }} />
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">
                  {cfg?.label ?? link.platform}
                </p>
                {link.username && (
                  <p className="text-xs text-[var(--muted)]">@{link.username}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">
                {fmt(link.follower_count)} followers
              </span>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
              >
                Visit <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Competitors Tab ────────────────────────────────────────────────────

export function CompetitorsContent({
  competitors,
}: {
  competitors: {
    id: string;
    relationship_type: string;
    notes: string | null;
    competitor_lead?: { id: string; merchant_name: string; follower_count: number; tier: string } | null;
    competitor_tenant?: { id: string; business_name: string; slug: string } | null;
  }[];
}) {
  const relationshipColors: Record<string, { bg: string; text: string }> = {
    direct: { bg: "rgba(239,68,68,0.15)", text: "#EF4444" },
    indirect: { bg: "rgba(245,158,11,0.15)", text: "#F59E0B" },
    substitute: { bg: "rgba(96,165,250,0.15)", text: "#60A5FA" },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-[var(--foreground)]">
          Competitors ({competitors.length})
        </h3>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-white/5 transition-all">
          <Building2 className="w-3.5 h-3.5" />
          Link Competitor
        </button>
      </div>

      {competitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--muted)]">
          <Building2 className="w-10 h-10 mb-3" />
          <p className="text-sm font-semibold">No competitors linked</p>
        </div>
      ) : (
        <div className="space-y-3">
          {competitors.map((comp) => {
            const name =
              comp.competitor_lead?.merchant_name ??
              comp.competitor_tenant?.business_name ??
              "Unknown";
            const relColors = relationshipColors[comp.relationship_type] ?? {
              bg: "rgba(107,114,128,0.15)",
              text: "#6B7280",
            };

            return (
              <div
                key={comp.id}
                className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-white font-bold text-sm">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{name}</p>
                    {comp.notes && (
                      <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-1">
                        {comp.notes}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold capitalize"
                  style={{ backgroundColor: relColors.bg, color: relColors.text }}
                >
                  {comp.relationship_type}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Store Tab ──────────────────────────────────────────────────────────

export function StoreContent({ lead }: { lead: Lead }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!lead.prospect_tenant_id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--muted)]">
        <Store className="w-10 h-10 mb-3" />
        <p className="text-lg font-bold text-[var(--foreground)] mb-2">No store built yet</p>
        <p className="text-sm text-[var(--muted)] mb-6 max-w-sm text-center">
          Build a prospect store to showcase what their online presence could look like.
        </p>
        <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#A78BFA] text-white text-sm font-bold hover:brightness-110 transition-all shadow-sm">
          <Store className="w-4 h-4" />
          Build Store
        </button>
      </div>
    );
  }

  const storeUrl = `/merchants/${lead.prospect_tenant_id}`;

  return (
    <div className="space-y-4">
      {/* Store Info Card */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--foreground)] mb-4 flex items-center gap-2">
          <Store className="w-4 h-4 text-[var(--muted)]" />
          Store Details
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Tenant ID</span>
            <span className="text-sm font-mono font-medium text-[var(--foreground)]">
              {lead.prospect_tenant_id}
            </span>
          </div>
          {lead.store_built_at && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted)]">Built At</span>
              <span className="text-sm font-medium text-[var(--foreground)]">
                {new Date(lead.store_built_at).toLocaleDateString()} ({relativeTime(lead.store_built_at)})
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">Merchant Page</span>
            <Link
              href={storeUrl}
              className="flex items-center gap-1 text-sm font-medium text-[var(--primary)] hover:underline"
            >
              View Merchant <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Store Preview Card */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--foreground)]">Store Preview</h3>
          <button
            onClick={() => handleCopy(`${window.location.origin}${storeUrl}`)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
              copied
                ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                : "border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Copy Link"}
          </button>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] bg-black/5 dark:bg-white/5 p-8 flex flex-col items-center justify-center text-center">
          <Store className="w-8 h-8 text-[var(--muted)] mb-2" />
          <p className="text-sm font-medium text-[var(--foreground)]">{lead.merchant_name}</p>
          <p className="text-xs text-[var(--muted)] mt-1">Prospect Store</p>
        </div>
      </div>
    </div>
  );
}
