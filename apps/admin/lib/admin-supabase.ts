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

export const ADMIN_ROLES: AdminRole[] = ["super_admin", "support_staff"];

/**
 * Fetch and validate the admin role for an already-authenticated user id.
 * Uses the service role client (bypasses RLS). Throws if the user has no
 * profile or holds a non-admin role.
 */
export async function requireAdminRole(userId: string): Promise<AdminRole> {
  const adminClient = createAdminClient();
  const { data: profile, error: profileError } = await adminClient
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    throw new Error("User profile not found");
  }

  const role = profile.role as AdminRole;

  if (!ADMIN_ROLES.includes(role)) {
    throw new Error(`Unauthorized: role "${role}" is not an admin role`);
  }

  return role;
}

/**
 * Validate a user's access token and verify they have an admin role.
 *
 * 1. Creates a client with the user's access token to validate the JWT
 * 2. Fetches the user's role via `requireAdminRole` (service role)
 * 3. Throws if the role is not super_admin or support_staff
 * 4. Returns the validated user and their role
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

  const role = await requireAdminRole(user.id);

  return { user, role };
}
