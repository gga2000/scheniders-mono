"use client";

import { Users, UserPlus, Mail, Crown, ShieldCheck, Briefcase, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { CopyableText } from "@/components/shared/copyable-text";

interface TeamTabProps {
  team: MerchantDetail["team"];
  merchantId: string;
}

type RoleKey = "owner" | "admin" | "manager" | "staff" | "other";

const ROLE_META: Record<RoleKey, { label: string; chip: string; icon: typeof Crown }> = {
  owner: {
    label: "Owner",
    chip: "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/30 ring-1 ring-white/20",
    icon: Crown,
  },
  admin: {
    label: "Admin",
    chip: "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20",
    icon: ShieldCheck,
  },
  manager: {
    label: "Manager",
    chip: "bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm shadow-sky-500/30 ring-1 ring-white/20",
    icon: Briefcase,
  },
  staff: {
    label: "Staff",
    chip: "bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm shadow-slate-500/20 ring-1 ring-white/20",
    icon: User,
  },
  other: {
    label: "Member",
    chip: "bg-foreground/10 text-foreground/70 ring-1 ring-foreground/10",
    icon: User,
  },
};

const AVATAR_GRADIENTS = [
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-cyan-500",
  "from-violet-500 to-fuchsia-500",
  "from-indigo-500 to-purple-500",
  "from-lime-400 to-green-500",
  "from-fuchsia-400 to-pink-500",
];

function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!;
}

function roleKey(role: string): RoleKey {
  const r = role.toLowerCase();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  if (r === "manager") return "manager";
  if (r === "staff" || r === "member") return "staff";
  return "other";
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function initialFor(name: string | null, email: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return name.charAt(0).toUpperCase();
  }
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

function TeamEmptyState({ merchantId }: { merchantId: string }) {
  return (
    <div className="relative overflow-hidden flex flex-col items-center text-center py-10 px-6 rounded-2xl bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 dark:from-violet-400/10 dark:via-fuchsia-400/10 dark:to-pink-400/5 border border-violet-200 dark:border-violet-400/20">
      <div
        aria-hidden
        className="absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-40 bg-violet-300"
      />
      <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-md shadow-violet-500/30 ring-1 ring-white/30 mb-4">
        <Users className="w-5 h-5 text-white" />
      </div>
      <h3 className="relative text-base font-bold text-foreground">No team members yet</h3>
      <p className="relative text-xs text-foreground/55 mt-1 max-w-[280px] leading-relaxed">
        This merchant is operating solo. Invite the first teammate or send a quick walkthrough so
        they can collaborate on orders and the storefront.
      </p>
      <div className="relative flex items-center gap-2 mt-4">
        <a
          href={`/team?invite=${merchantId}`}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-xs font-bold shadow-sm shadow-violet-500/30 ring-1 ring-white/20 hover:scale-105 active:scale-95 transition-all"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Invite first teammate
        </a>
        <a
          href={`/outreach-templates?context=team-onboarding&tenant=${merchantId}`}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/80 dark:bg-white/10 text-foreground text-xs font-bold ring-1 ring-foreground/10 hover:ring-foreground/30 transition-all"
        >
          <Mail className="w-3.5 h-3.5" />
          Send walkthrough
        </a>
      </div>
    </div>
  );
}

export function TeamTab({ team, merchantId }: TeamTabProps) {
  if (team.length === 0) {
    return <TeamEmptyState merchantId={merchantId} />;
  }

  const sorted = [...team].sort((a, b) => {
    const order: Record<string, number> = { owner: 0, admin: 1, manager: 2, staff: 3 };
    const ra = order[a.role.toLowerCase()] ?? 4;
    const rb = order[b.role.toLowerCase()] ?? 4;
    if (ra !== rb) return ra - rb;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });

  const activeCount = team.filter((m) => m.status === "active").length;

  return (
    <div className="pastel-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1.5">
          <Users className="w-3 h-3" />
          Team members
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-full bg-foreground/[0.05] text-[9px] font-black uppercase tracking-wider text-foreground/55 tabular-nums">
            {team.length} total
          </span>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-emerald-500/30 ring-1 ring-white/20 tabular-nums">
              {activeCount} active
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {sorted.map((member) => {
          const profile = member.user_profiles;
          const name = profile?.full_name || profile?.email?.split("@")[0] || "Unnamed";
          const email = profile?.email ?? null;
          const isActive = member.status === "active";
          const role = roleKey(member.role);
          const meta = ROLE_META[role];
          const RoleIcon = meta.icon;
          const seed = profile?.email || member.id;
          const gradient = gradientFor(seed);
          const initial = initialFor(profile?.full_name ?? null, email);

          return (
            <div
              key={member.id}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border p-3 transition-colors",
                isActive
                  ? "border-foreground/[0.06] bg-foreground/[0.025] hover:bg-foreground/[0.04]"
                  : "border-foreground/[0.04] bg-foreground/[0.015] hover:bg-foreground/[0.03] opacity-70"
              )}
            >
              <div
                className={cn(
                  "relative shrink-0",
                  isActive && "p-[2px] rounded-full bg-gradient-to-br",
                  isActive && gradient
                )}
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className={cn(
                      "w-10 h-10 rounded-full object-cover",
                      !isActive && "grayscale"
                    )}
                  />
                ) : (
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black tracking-tight",
                      isActive
                        ? cn("bg-gradient-to-br", gradient, "ring-2 ring-white/40 dark:ring-white/10")
                        : "bg-foreground/15 text-foreground/50"
                    )}
                  >
                    {initial}
                  </div>
                )}
                {role === "owner" && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center ring-1 ring-white/40 shadow-sm shadow-amber-500/40">
                    <Crown className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-bold text-foreground truncate">{name}</p>
                  {!isActive && (
                    <span className="px-1.5 py-0 rounded-full bg-foreground/10 text-foreground/55 text-[9px] font-black uppercase tracking-wider">
                      {member.status}
                    </span>
                  )}
                </div>
                {email ? (
                  <CopyableText
                    value={email}
                    className="text-[11px] text-foreground/55 font-medium mt-0.5"
                  />
                ) : (
                  <p className="text-[11px] text-foreground/40 font-medium mt-0.5">
                    No email
                  </p>
                )}
              </div>

              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0",
                  meta.chip
                )}
              >
                <RoleIcon className="w-2.5 h-2.5" />
                {meta.label}
              </span>

              <div className="text-right shrink-0">
                <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45">
                  Joined
                </p>
                <p className="text-[11px] font-bold text-foreground/70 tabular-nums mt-0.5">
                  {relativeTime(member.joined_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
