import type { createAdminClient } from "@/lib/admin-supabase";

type AdminDb = ReturnType<typeof createAdminClient>;

/** What the console reads of a staff member to name them on a step. */
export interface StaffProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

/**
 * The profiles of the staff who took these steps. A failed read throws: a
 * step named "Automatic", or by an email, because the names did not load
 * would name the wrong person.
 */
export async function readStaffProfiles(
  supabase: AdminDb,
  ids: readonly (string | null | undefined)[],
): Promise<StaffProfile[]> {
  const people = [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (people.length === 0) return [];
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, display_name, email, avatar_url")
    .in("id", people);
  if (error) throw error;
  return data ?? [];
}

/**
 * Each staff member by the name steps show (`logActor`): their name, else
 * their email. One rule for Activity, the shop's timeline, its "stopped by"
 * line and the Merchants badge, so one step names one person everywhere
 * (round 24 structure new 4, round 25 data new 2).
 */
export function staffNames(profiles: readonly StaffProfile[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const profile of profiles) {
    const name = profile.display_name?.trim() || profile.email;
    if (name) names.set(profile.id, name);
  }
  return names;
}
