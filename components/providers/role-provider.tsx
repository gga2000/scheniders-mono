"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

const ROUTE_PERMISSIONS: Record<string, string[]> = {
    '/admin/data-import': ['admin'],
    '/settings': ['admin'],
    '/analytics': ['admin'],
    '/reports': ['admin'],
    '/team': ['admin'],
    '/printing': ['admin', 'employee'],
    '/products': ['admin', 'employee', 'viewer'],
    '/orders': ['admin', 'employee', 'viewer'],
    '/customers': ['admin', 'employee', 'viewer'],
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
    const { role, isLoading, user } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (isLoading || !user) return; // Wait until auth state is resolved

        const requiredRoles = getRequiredRolesForPath(pathname);
        if (requiredRoles) {
            const userRole = role || 'viewer';
            if (!requiredRoles.includes(userRole)) {
                router.replace('/orders?error=access_denied');
            }
        }
    }, [pathname, role, isLoading, user, router]);

    return <>{children}</>;
}
