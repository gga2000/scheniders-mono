export type UserRole = "admin" | "employee" | "viewer";

export interface Permission {
    id: string;
    label: string;
    description?: string;
}

export const ROLES: UserRole[] = ["admin", "employee", "viewer"];

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

    // System
    MANAGE_USERS: "system.users.manage",
    VIEW_ANALYTICS: "system.analytics.view",
    VIEW_FINANCIALS: "system.financials.view", // PROPOSAL: New permission for cost/profit data
    ACCESS_SETTINGS: "system.settings.access",
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Matrix of permissions per role
export const ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
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
        category: "System",
        items: [
            { key: PERMISSIONS.MANAGE_USERS, label: "Manage Users" },
            { key: PERMISSIONS.ACCESS_SETTINGS, label: "System Settings" },
            { key: PERMISSIONS.VIEW_ANALYTICS, label: "View Analytics Pages" },
            { key: PERMISSIONS.VIEW_FINANCIALS, label: "View Financial Data (Profit/Cost)" },
        ]
    }
];
