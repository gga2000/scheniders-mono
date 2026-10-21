"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { canAccessRoute } from "@/lib/route-permissions";

/**
 * Redirects away from a dashboard route the current user may not open. The
 * rules live in `lib/route-permissions.ts`; `role` is the user's role in the
 * current tenant. This is navigation UX — RLS and the server-side guards are
 * what actually protect the data.
 */
export function RoleProvider({ children }: { children: React.ReactNode }) {
    const { role, permissions, isLoading, user, profileLoaded } = useAuth();
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        if (isLoading || !user) return; // Wait until auth state is resolved
        if (!profileLoaded) return; // Wait for the tenant role to finish loading
        if (!role) return; // No role in this tenant: PageGuard shows access denied with a retry

        if (!canAccessRoute(pathname, role, permissions)) {
            router.replace('/orders?error=access_denied');
        }
    }, [pathname, role, permissions, isLoading, user, profileLoaded, router]);

    return <>{children}</>;
}
