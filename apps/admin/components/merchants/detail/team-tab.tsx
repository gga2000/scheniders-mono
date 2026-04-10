"use client";

import { Users, UserCircle } from "lucide-react";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

const roleBadge: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800",
  admin: "bg-purple-100 text-purple-800",
  manager: "bg-blue-100 text-blue-800",
  staff: "bg-gray-100 text-gray-700",
};

interface TeamTabProps {
  team: MerchantDetail["team"];
}

export function TeamTab({ team }: TeamTabProps) {
  return (
    <div className="pastel-card p-5 md:p-6">
      <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Users className="w-4 h-4" />
        Team Members ({team.length})
      </h2>
      {team.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
          <Users className="w-8 h-8 mb-2" />
          <p className="text-sm">No team members</p>
        </div>
      ) : (
        <div>
          {team.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 py-3 border-b border-[var(--card-border)] last:border-0"
            >
              {member.user_profiles?.avatar_url ? (
                <img
                  src={member.user_profiles.avatar_url}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                  <UserCircle className="w-5 h-5 text-foreground/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {member.user_profiles?.full_name || "Unnamed"}
                </p>
                <p className="text-xs text-foreground/50 truncate">
                  {member.user_profiles?.email || "\u2014"}
                  {member.user_profiles?.phone && ` \u00b7 ${member.user_profiles.phone}`}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize shrink-0 ${
                  roleBadge[member.role] ?? "bg-gray-100 text-gray-700"
                }`}
              >
                {member.role}
              </span>
              <span className="text-xs text-foreground/40 shrink-0">
                {new Date(member.joined_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
