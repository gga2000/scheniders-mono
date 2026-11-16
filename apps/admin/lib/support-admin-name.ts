import type { createAdminClient } from "@/lib/admin-supabase";
import type { AdminContext } from "@/lib/api-auth";

type AdminDb = ReturnType<typeof createAdminClient>;

/** The name merchants and teammates see on this admin's support messages. */
export async function adminDisplayName(supabase: AdminDb, admin: AdminContext): Promise<string> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("display_name, email")
    .eq("user_id", admin.user.id)
    .maybeSingle();
  if (error) throw error;
  const row = data as { display_name: string | null; email: string | null } | null;
  return row?.display_name?.trim() || row?.email || admin.user.email || "Support";
}
