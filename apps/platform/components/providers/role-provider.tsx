"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

const ROUTE_PERMISSIONS: Record<string, string[]> = {
    '/admin/data-import': ['admin', 'super_admin'],
    '/settings': ['admin', 'super_admin'],
    '/analytics': ['admin', 'super_admin'],
    '/reports': ['admin', 'super_admin'],
    '/team': ['admin', 'super_admin'],
    '/printing': ['admin', 'super_admin', 'employee'],
    '/products': ['admin', 'super_admin', 'employee', 'viewer'],
    '/orders': ['admin', 'super_admin', 'employee', 'viewer'],
    '/customers': ['admin', 'super_admin', 'employee', 'viewer'],
};

function getRequiredRolesForPath(pathname: string): string[] | null {
    if (ROUTE_PERMISSIONS[pathname]) {
        return ROUTE_PERMISSIONS[pathname];
    }
    for (const [route, roles] of Object.entries(ROUTE_PERMISSIONS)) {
        if (pathname.startsWith(`${route}/`)) {
            return roles;
        }
    }
    return null;
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
    const { role, isLoading, user, profileLoaded } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (isLoading || !user) return; // Wait until auth state is resolved
        if (user && !profileLoaded) return; // Crucial: Wait for profile (role) to finish loading

        const requiredRoles = getRequiredRolesForPath(pathname);
        if (requiredRoles) {
            const userRole = role || 'viewer';
            if (!requiredRoles.includes(userRole)) {
                router.replace('/orders?error=access_denied');
            }
        }
    }, [pathname, role, isLoading, user, profileLoaded, router]);

    return <>{children}</>;
}
