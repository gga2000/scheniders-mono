"use client";

import { Users, Crown, ShieldCheck, Briefcase, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { CopyableText } from "@/components/shared/copyable-text";

interface TeamTabProps {
  team: MerchantDetail["team"];
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
  // The merchant app's word for a staff member is "employee".
  if (r === "staff" || r === "member" || r === "employee") return "staff";
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

/** When the member joined; for one who has not signed in to the shop yet, when they were added. */
function memberSince(member: { joined_at: string | null; invited_at: string | null }): string | null {
  return member.joined_at ?? member.invited_at;
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

function TeamEmptyState() {
  return (
    <div className="pastel-card flex flex-col items-center text-center py-10 px-6">
      <Users className="w-6 h-6 text-foreground/40 mb-2" />
      <h3 className="text-sm font-bold text-foreground">This shop has no members</h3>
      <p className="text-xs text-foreground/55 mt-1 max-w-[320px] leading-relaxed">
        Every shop should have at least its owner. Nobody can sign in to this one.
      </p>
    </div>
  );
}

export function TeamTab({ team }: TeamTabProps) {
  if (team.length === 0) {
    return <TeamEmptyState />;
  }

  const sorted = [...team].sort((a, b) => {
    const order: Record<string, number> = { owner: 0, admin: 1, manager: 2, staff: 3 };
    const ra = order[a.role.toLowerCase()] ?? 4;
    const rb = order[b.role.toLowerCase()] ?? 4;
    if (ra !== rb) return ra - rb;
    return new Date(memberSince(a) ?? 0).getTime() - new Date(memberSince(b) ?? 0).getTime();
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
          const name = profile?.display_name || profile?.email?.split("@")[0] || "Unnamed";
          const email = profile?.email ?? null;
          const isActive = member.status === "active";
          const role = roleKey(member.role);
          const meta = ROLE_META[role];
          const RoleIcon = meta.icon;
          const seed = profile?.email || member.id;
          const gradient = gradientFor(seed);
          const initial = initialFor(profile?.display_name ?? null, email);
          const since = memberSince(member);

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
                  {member.joined_at ? "Joined" : "Added"}
                </p>
                <p className="text-[11px] font-bold text-foreground/70 tabular-nums mt-0.5">
                  {since ? relativeTime(since) : "\u2014"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
