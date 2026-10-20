import { PERMISSIONS, TENANT_ROLES, type PermissionKey, type UserRole } from "@/lib/permissions";

/**
 * Who may open a dashboard route: any of `roles`, or — when `permission` is
 * set — anyone whose effective permissions include it (a role default or a
 * per-user override). The role is the caller's role in the current tenant
 * (see `resolveEffectiveRole`).
 */
export interface RouteRule {
    roles: readonly UserRole[];
    permission?: PermissionKey;
}

const ADMINS: readonly UserRole[] = ["admin", "super_admin"];
const STAFF: readonly UserRole[] = ["admin", "super_admin", "employee"];
const EVERYONE: readonly UserRole[] = ["admin", "super_admin", "employee", "viewer"];

/** Money pages: salaries, expenses, the wallet and full-data backups. */
const FINANCIALS: RouteRule = { roles: ADMINS, permission: PERMISSIONS.VIEW_FINANCIALS };

export const ROUTE_PERMISSIONS: Readonly<Record<string, RouteRule>> = {
    "/admin/data-import": { roles: ADMINS },
    "/settings": { roles: ADMINS },
    "/analytics": { roles: ADMINS },
    "/reports": { roles: ADMINS },
    "/team": { roles: ADMINS },
    "/finances": FINANCIALS,
    "/salaries": FINANCIALS,
    "/vault": FINANCIALS,
    "/printing": { roles: STAFF },
    "/products": { roles: EVERYONE },
    "/orders": { roles: EVERYONE },
    "/customers": { roles: EVERYONE },
};

/** The rule for `pathname` (exact match, else the route it is nested under), or null when ungated. */
export function getRouteRule(pathname: string): RouteRule | null {
    const exact = ROUTE_PERMISSIONS[pathname];
    if (exact) return exact;
    for (const [route, rule] of Object.entries(ROUTE_PERMISSIONS)) {
        if (pathname.startsWith(`${route}/`)) return rule;
    }
    return null;
}

/** Whether a user with `role` and `permissions` may open `pathname`. No role opens no gated route. */
export function canAccessRoute(
    pathname: string,
    role: string | null | undefined,
    permissions: readonly string[],
): boolean {
    const rule = getRouteRule(pathname);
    if (!rule) return true;
    if (!role) return false;
    if (rule.roles.includes(role as UserRole)) return true;
    return rule.permission !== undefined && permissions.includes(rule.permission);
}

/**
 * Whether `pathname` is closed to some tenant role. Such a page must not be
 * rendered until the user's role is known, or it flashes to people who will be
 * turned away.
 */
export function isRestrictedRoute(pathname: string): boolean {
    const rule = getRouteRule(pathname);
    return rule !== null && !TENANT_ROLES.every((r) => rule.roles.includes(r));
}
