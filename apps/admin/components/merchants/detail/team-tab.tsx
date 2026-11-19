"use client";

import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { CopyableText } from "@/components/shared/copyable-text";
import { formatCount, formatDay } from "@/lib/format";

interface TeamTabProps {
  team: MerchantDetail["team"];
}

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, manager: 2, staff: 3, employee: 3, member: 3 };
const ROLE_WORD: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  // The merchant app's word for a staff member is "employee".
  staff: "Staff",
  employee: "Staff",
  member: "Staff",
};
const STATUS_WORD: Record<string, string> = { invited: "Invited", inactive: "Removed", removed: "Removed", suspended: "Blocked" };

/** When the member joined; for one who has not signed in to the shop yet, when they were added. */
function since(member: TeamTabProps["team"][number]): string {
  if (member.joined_at) return `Joined ${formatDay(member.joined_at)}`;
  if (member.invited_at) return `Added ${formatDay(member.invited_at)}, not signed in yet`;
  return "Not signed in yet";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  return name.charAt(0).toUpperCase() || "?";
}

/** The shop's people, owner first: name, email, role and since when, in words. */
export function TeamTab({ team }: TeamTabProps) {
  if (team.length === 0) {
    return (
      <section className="pastel-card p-5" aria-label="Team">
        <p className="text-[15px] font-semibold text-foreground">This shop has no members</p>
        <p className="mt-1 text-[13px] text-foreground/70">Every shop should have at least its owner. Nobody can sign in to this one.</p>
      </section>
    );
  }

  const sorted = [...team].sort((a, b) => {
    const byRole = (ROLE_ORDER[a.role.toLowerCase()] ?? 4) - (ROLE_ORDER[b.role.toLowerCase()] ?? 4);
    if (byRole !== 0) return byRole;
    return (a.joined_at ?? a.invited_at ?? "").localeCompare(b.joined_at ?? b.invited_at ?? "");
  });
  const active = team.filter((member) => member.status === "active").length;

  return (
    <section className="pastel-card p-5" aria-label="Team">
      <h2 className="mb-2 text-[13px] font-semibold text-foreground/70">
        {formatCount(active)} active {active === 1 ? "member" : "members"}
        {team.length > active && ` of ${formatCount(team.length)}`}
      </h2>
      <ul className="divide-y divide-[var(--card-border)]">
        {sorted.map((member) => {
          const profile = member.user_profiles;
          const email = profile?.email ?? null;
          const name = profile?.display_name?.trim() || email?.split("@")[0] || "No name";
          const role = ROLE_WORD[member.role.toLowerCase()] ?? member.role;
          const inactive = member.status !== "active";
          return (
            <li key={member.id} className={inactive ? "flex items-center gap-3 py-3 opacity-60" : "flex items-center gap-3 py-3"}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-[13px] font-semibold text-foreground/70"
                >
                  {initials(name)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[15px] font-semibold text-foreground"
                  title={inactive ? `${name} · ${STATUS_WORD[member.status] ?? member.status}` : name}
                >
                  {name}
                  {inactive && (
                    <span className="text-[13px] font-normal text-foreground/70"> · {STATUS_WORD[member.status] ?? member.status}</span>
                  )}
                </p>
                {email ? (
                  <CopyableText value={email} className="text-[13px] text-foreground/70" />
                ) : (
                  <p className="text-[13px] text-foreground/70">No email</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[13px] font-semibold text-foreground">{role}</p>
                <p className="text-[13px] tabular-nums text-foreground/70">{since(member)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
