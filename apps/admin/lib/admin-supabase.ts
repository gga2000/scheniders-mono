import { createClient } from "@supabase/supabase-js";
import { env } from "./admin-env";
import { isOAuthClientToken } from "@scheniders/shared";
import { AdminAuthError } from "./admin-auth-error";
import { SIGN_IN_ENDED, signInEnded, verifyStaffToken } from "./staff-sign-in";
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
 * the validated role. Throws `AdminAuthError(403)` if there is no active row or
 * the role is not allowed; a failed lookup throws a plain error (server fault).
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
    .maybeSingle();

  if (adminError) {
    throw new Error(`admin_users lookup failed: ${adminError.message}`, { cause: adminError });
  }

  if (!adminRow) {
    throw new AdminAuthError(403, "No admin-console access");
  }

  if (!adminRow.is_active) {
    throw new AdminAuthError(403, "Admin-console access is disabled");
  }

  const role = adminRow.admin_role as AdminRole;

  if (!ALLOWED_ROLES.includes(role)) {
    throw new AdminAuthError(403, `Role "${role}" is not an admin role`);
  }

  return role;
}

/**
 * Validate a user's access token (bearer transport) and verify they have
 * admin-console access.
 *
 * 1. Checks the token once (lib/staff-sign-in.ts): signature and expiry, with
 *    the project's published keys, so no call to the auth server. The
 *    middleware has already asked the auth server about this browser's
 *    session on the same request.
 * 2. Refuses a sign-in older than the staff limit (16 hours).
 * 3. Resolves their admin-console role via `resolveAdminRole` (which reads the
 *    dedicated `admin_users` access list, decoupled from user_profiles.role)
 *
 * Throws `AdminAuthError` (401 bad or old token, 403 not an admin) for caller
 * faults and a plain error when the key read or database fails. Routes should
 * not call this directly — use `requireBearerAdmin` / `requireAdminFromRequest`
 * (lib/api-auth.ts), which map those to the right status.
 */
export async function requireAdmin(accessToken: string) {
  // The Claude connector's OAuth tokens are for the platform's /api/mcp only.
  if (isOAuthClientToken(accessToken)) {
    throw new AdminAuthError(401, "Claude connector tokens cannot be used in the admin console");
  }
  const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const token = await verifyStaffToken(userClient.auth, accessToken);
  if (!token) throw new AdminAuthError(401, "Invalid access token");
  if (signInEnded(token.signedInAt)) throw new AdminAuthError(401, SIGN_IN_ENDED);

  const role = await resolveAdminRole(token.userId);

  return { user: { id: token.userId, email: token.email }, role };
}
