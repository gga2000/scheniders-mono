import { useAuth } from "@/hooks/use-auth";
import { PermissionKey, UserRole } from "@/lib/permissions";

export function usePermission() {
    const { permissions, role, isLoading } = useAuth();

    /**
     * Check if the current user has a specific permission.
     * Admins always have access (God Mode fallback).
     */
    const can = (permission: PermissionKey): boolean => {
        if (role === "admin") return true;
        return permissions.includes(permission);
    };

    /**
     * Check if the current user matches one of the required roles.
     */
    const hasRole = (requiredRoles: UserRole[]): boolean => {
        if (!role) return false;
        return requiredRoles.includes(role as UserRole);
    };

    return {
        can,
        hasRole,
        role: role as UserRole | null,
        isLoading,
    };
}
