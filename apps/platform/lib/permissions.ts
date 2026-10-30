export type UserRole = "super_admin" | "admin" | "employee" | "viewer";

export interface Permission {
    id: string;
    label: string;
    description?: string;
}

export const ROLES: UserRole[] = ["super_admin", "admin", "employee", "viewer"];

/**
 * Roles with full administrative access (super_admin is a superset of admin).
 * Use this rather than checking `role === "admin"` directly so super_admin
 * users aren't accidentally locked out of admin features.
 */
export const ADMIN_LEVEL_ROLES: UserRole[] = ["super_admin", "admin"];

export function isAdminRole(role: UserRole | string | undefined | null): boolean {
    return role === "admin" || role === "super_admin";
}

/**
 * Platform-level administration — acting across tenants, editing the
 * platform-wide permission tables, crediting wallets — belongs to
 * `super_admin` alone. Self-serve signup gives every new account the `admin`
 * role, so `admin` must never be read as platform-wide: that is what let any
 * signup pass `requireTenantAdminFor` for every tenant.
 */
export function isPlatformAdminRole(role: UserRole | string | undefined | null): boolean {
    return role === "super_admin";
}

/** The per-store roles stored in `tenant_members.role` (and `team_invites.role`). */
export type TenantRole = Exclude<UserRole, "super_admin">;

export const TENANT_ROLES: readonly TenantRole[] = ["admin", "employee", "viewer"];

export function isTenantRole(role: string | null | undefined): role is TenantRole {
    return TENANT_ROLES.includes(role as TenantRole);
}

/**
 * The role a user acts with in a tenant. `tenant_members.role` is the source of
 * truth for merchant users; the global `user_profiles.role` only contributes
 * `super_admin` (platform staff), which stays a superset of every tenant role.
 * Anything else — no active membership, an unknown value — is no role at all.
 */
export function resolveEffectiveRole(
    platformRole: string | null | undefined,
    memberRole: string | null | undefined,
): UserRole | null {
    if (isPlatformAdminRole(platformRole)) return "super_admin";
    return isTenantRole(memberRole) ? memberRole : null;
}

/**
 * A role's permissions (`role_permissions` rows) with the user's
 * `user_permissions` overrides applied: a granted override adds the
 * permission, a revoked one removes it. Mirrors `has_tenant_permission` in SQL.
 */
export function applyPermissionOverrides(
    rolePermissions: readonly string[],
    overrides: readonly { permission: string; is_granted: boolean }[],
): string[] {
    const perms = new Set(rolePermissions);
    for (const o of overrides) {
        if (o.is_granted) perms.add(o.permission);
        else perms.delete(o.permission);
    }
    return Array.from(perms);
}

export const PERMISSIONS = {
    // Orders
    VIEW_ORDERS: "orders.view",
    CREATE_ORDERS: "orders.create",
    EDIT_ORDERS: "orders.edit",
    DELETE_ORDERS: "orders.delete",
    EXPORT_DATA: "orders.export",

    // Customers
    VIEW_CUSTOMERS: "customers.view",
    EDIT_CUSTOMERS: "customers.edit",
    BLOCK_CUSTOMERS: "customers.block",

    // Products
    EDIT_PRODUCTS: "products.edit", // create/edit products, variants, categories and stock
    MANAGE_PRODUCTS: "products.manage", // delete products, bulk price changes, inventory tools

    // System
    MANAGE_USERS: "system.users.manage",
    VIEW_ANALYTICS: "system.analytics.view",
    VIEW_FINANCIALS: "system.financials.view", // PROPOSAL: New permission for cost/profit data
    ACCESS_SETTINGS: "system.settings.access",
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Matrix of permissions per role
export const ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
    super_admin: [
        // Super admin has ALL permissions (same as admin, kept distinct for org hierarchy)
        ...Object.values(PERMISSIONS),
    ],
    admin: [
        // Admin has ALL permissions
        ...Object.values(PERMISSIONS),
    ],
    employee: [
        PERMISSIONS.VIEW_ORDERS,
        PERMISSIONS.CREATE_ORDERS,
        PERMISSIONS.EDIT_ORDERS,
        PERMISSIONS.EXPORT_DATA,
        PERMISSIONS.VIEW_CUSTOMERS,
        PERMISSIONS.EDIT_CUSTOMERS,
        PERMISSIONS.BLOCK_CUSTOMERS,
        PERMISSIONS.EDIT_PRODUCTS,
        // No Analytics, No Financials, No Settings
    ],
    viewer: [
        PERMISSIONS.VIEW_ORDERS,
        PERMISSIONS.VIEW_CUSTOMERS,
        // No Analytics, No Financials
    ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole | string | undefined | null, permission: PermissionKey): boolean {
    if (!role || !ROLES.includes(role as UserRole)) return false;
    return ROLE_PERMISSIONS[role as UserRole].includes(permission);
}

/**
 * Check if a role matches required roles
 */
export function hasRole(userRole: UserRole | string | undefined | null, allowedRoles: UserRole[]): boolean {
    if (!userRole) return false;
    return allowedRoles.includes(userRole as UserRole);
}

// Helper for UI Matrix display
export const PERMISSION_CATEGORIES = [
    {
        category: "Orders",
        items: [
            { key: PERMISSIONS.VIEW_ORDERS, label: "View Orders" },
            { key: PERMISSIONS.CREATE_ORDERS, label: "Create Orders" },
            { key: PERMISSIONS.EDIT_ORDERS, label: "Edit Orders" },
            { key: PERMISSIONS.DELETE_ORDERS, label: "Delete Orders" },
            { key: PERMISSIONS.EXPORT_DATA, label: "Export Data" },
        ]
    },
    {
        category: "Customers",
        items: [
            { key: PERMISSIONS.VIEW_CUSTOMERS, label: "View Customers" },
            { key: PERMISSIONS.EDIT_CUSTOMERS, label: "Edit Customer Details" },
            { key: PERMISSIONS.BLOCK_CUSTOMERS, label: "Block Customers" },
        ]
    },
    {
        category: "Products",
        items: [
            { key: PERMISSIONS.EDIT_PRODUCTS, label: "Add and Edit Products and Stock" },
            { key: PERMISSIONS.MANAGE_PRODUCTS, label: "Delete Products, Bulk Prices, Inventory Tools" },
        ]
    },
    {
        category: "System",
        items: [
            { key: PERMISSIONS.MANAGE_USERS, label: "Manage Users" },
            { key: PERMISSIONS.ACCESS_SETTINGS, label: "System Settings" },
            { key: PERMISSIONS.VIEW_ANALYTICS, label: "View Analytics Pages" },
            { key: PERMISSIONS.VIEW_FINANCIALS, label: "View Financial Data (Profit/Cost)" },
        ]
    }
];
