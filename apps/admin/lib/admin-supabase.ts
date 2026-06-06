import { createClient } from "@supabase/supabase-js";
import { env } from "./admin-env";
import type { AdminRole } from "@/types/admin";

/**
 * Create a Supabase client with the service role key.
 * Bypasses all RLS — used for cross-tenant admin operations.
 */
export function createAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Create a Supabase client for browser use with the anon key.
 * Used for auth operations (login/logout) only.
 */
export function createBrowserClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

const ALLOWED_ROLES: AdminRole[] = ["super_admin", "support_staff"];

/**
 * Given an already-authenticated user id, look up their admin-console access in
 * the dedicated `admin_users` table (service role — bypasses RLS) and return
 * the validated role. Throws if there is no active row or the role is not
 * allowed.
 *
 * Transport-agnostic: callers validate the identity (bearer token or cookie
 * session) first, then hand the resolved user id here for authorization.
 */
export async function resolveAdminRole(userId: string): Promise<AdminRole> {
  const adminClient = createAdminClient();
  const { data: adminRow, error: adminError } = await adminClient
    .from("admin_users")
    .select("admin_role, is_active")
    .eq("user_id", userId)
    .single();

  if (adminError || !adminRow) {
    throw new Error("No admin-console access");
  }

  if (!adminRow.is_active) {
    throw new Error("Admin-console access is disabled");
  }

  const role = adminRow.admin_role as AdminRole;

  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error(`Unauthorized: role "${role}" is not an admin role`);
  }

  return role;
}

/**
 * Validate a user's access token (bearer transport) and verify they have
 * admin-console access.
 *
 * 1. Creates a client with the user's access token to validate the JWT
 * 2. Resolves their admin-console role via `resolveAdminRole` (which reads the
 *    dedicated `admin_users` access list, decoupled from user_profiles.role)
 * 3. Returns the validated user and their admin role
 */
export async function requireAdmin(accessToken: string) {
  // Create a client authenticated as the user to validate the JWT
  const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    throw new Error(userError?.message ?? "Invalid access token");
  }

  const role = await resolveAdminRole(user.id);

  return { user, role };
}
