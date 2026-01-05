"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { AccessDenied } from "@/components/auth/access-denied";
import {
    UserRole,
    PermissionKey,
    hasRole,
    hasPermission
} from "@/lib/permissions";

export interface RoleGuardProps {
    children: React.ReactNode;
    allowedRoles?: UserRole[];
    requiredPermission?: PermissionKey;
    fallback?: React.ReactNode;
}

export function RoleGuard({
    children,
    allowedRoles,
    requiredPermission,
    fallback = null
}: RoleGuardProps) {
    const { user, role: contextRole, permissions, isLoading } = useAuth();
    const role = contextRole as UserRole;

    if (isLoading) return null;

    if (!role) return <>{fallback}</>;

    let hasAccess = true;

    if (allowedRoles && !hasRole(role, allowedRoles)) {
        hasAccess = false;
    }

    // Dynamic Permission Check
    if (requiredPermission) {
        // If we have dynamic permissions loaded, check them
        if (permissions && permissions.length > 0) {
            if (!permissions.includes(requiredPermission)) {
                hasAccess = false;
            }
        } else {
            // Fallback to static check if dynamic not loaded (should generally not happen if auth provider is working)
            if (!hasPermission(role, requiredPermission)) {
                hasAccess = false;
            }
        }
    }

    return hasAccess ? <>{children}</> : <>{fallback}</>;
}

export function PageGuard({
    children,
    allowedRoles,
    requiredPermission
}: {
    children: React.ReactNode;
    allowedRoles?: UserRole[];
    requiredPermission?: PermissionKey
}) {
    const { user, role: contextRole, permissions, isLoading } = useAuth();
    const router = useRouter();

    // Use effect to handle redirect if needed (for auth)
    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const role = contextRole as UserRole;

    if (!user) {
        return null;
    }

    let allowed = true;

    if (role) {
        if (allowedRoles && !hasRole(role, allowedRoles)) allowed = false;

        if (requiredPermission) {
            if (permissions && permissions.length > 0) {
                if (!permissions.includes(requiredPermission)) allowed = false;
            } else {
                if (!hasPermission(role, requiredPermission)) allowed = false;
            }
        }
    } else {
        allowed = false; // No role = no access to protected pages
    }

    if (!allowed) {
        return <AccessDenied message="You do not have the required permissions to view this page." />;
    }

    return <>{children}</>;
}
