import type { AdminRole } from "@/types/admin";

const ALLOWED_ROLES: readonly AdminRole[] = ["super_admin", "support_staff"];

function isAdminRole(role: unknown): role is AdminRole {
  return ALLOWED_ROLES.some((allowed) => allowed === role);
}

/** Each role's name on screen. The database stores it as "super_admin". */
export const ROLE_LABELS: Readonly<Record<AdminRole, string>> = {
  super_admin: "Super admin",
  support_staff: "Support staff",
};

/** A stored role in words; a role the console does not know is shown as stored. */
export function roleLabel(role: string): string {
  return isAdminRole(role) ? ROLE_LABELS[role] : role;
}

/**
 * What the browser learnt from the person's own `admin_users` row. A read that
 * failed (a network or database blip) is not an answer: it says nothing about
 * whether the person may use the console.
 */
export type AccessCheck =
  | { kind: "role"; role: AdminRole }
  | { kind: "none" }
  | { kind: "failed" };

/** Reads the answer of `admin_users ... maybeSingle()` for the signed-in person. */
export function readAccessCheck(result: { data: unknown; error: unknown }): AccessCheck {
  if (result.error) return { kind: "failed" };
  const row = result.data as { admin_role?: unknown; is_active?: unknown } | null;
  if (!row || row.is_active !== true) return { kind: "none" };
  const role = row.admin_role;
  return isAdminRole(role) ? { kind: "role", role } : { kind: "none" };
}

/** The role the browser already knows, and whose it is. */
export interface KnownAccess {
  userId: string;
  role: AdminRole;
}

/**
 * What to do with a check:
 * - `grant`: use the role the row gave.
 * - `keep`: the read failed, but this person's role is already known; keep it.
 *   The server checks access on every request, so nothing opens because of it.
 * - `unknown`: the read failed and nothing is known for this person. Controls
 *   that need a role stay hidden and the page says why; nobody is signed out.
 * - `sign_out`: the row answered that this login has no console access.
 */
export type AccessStep =
  | { kind: "grant"; role: AdminRole }
  | { kind: "keep"; role: AdminRole }
  | { kind: "unknown" }
  | { kind: "sign_out" };

export function nextAccess(check: AccessCheck, known: KnownAccess | null, userId: string): AccessStep {
  if (check.kind === "role") return { kind: "grant", role: check.role };
  if (check.kind === "none") return { kind: "sign_out" };
  return known && known.userId === userId ? { kind: "keep", role: known.role } : { kind: "unknown" };
}
