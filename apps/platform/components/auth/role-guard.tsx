"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageSkeleton } from "@scheniders/ui/skeletons";

import { useAuth } from "@/components/auth/auth-provider";
import { AccessDenied } from "@/components/auth/access-denied";
import { AccountNotProvisioned } from "@/components/auth/account-not-provisioned";
import {
    UserRole,
    PermissionKey,
    hasRole,
    hasPermission
} from "@/lib/permissions";
import { canAccessRoute, isRestrictedRoute } from "@/lib/route-permissions";

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
    const { user, role: contextRole, permissions, isLoading, profileLoaded, profileMissing, retryAuth, signOut } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isRetrying, setIsRetrying] = useState(false);

    // Console log removed to prevent clogging the browser console

    // Use effect to handle redirect if needed (for auth)
    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    const role = contextRole as UserRole;

    // Until the user and their tenant role are known, a page that some roles may
    // not open is withheld; every other page renders immediately so the chrome
    // appears at once and the page shows its own skeleton. The useEffect above
    // still redirects if the user turns out to be unauthenticated.
    if (isLoading || !user || !profileLoaded) {
        return isRestrictedRoute(pathname) ? <PageSkeleton /> : <>{children}</>;
    }

    // Invite-only: signed in (e.g. via Google) but no account is provisioned —
    // show the branded "not set up yet" screen with a contact-admin path.
    if (user && profileMissing) {
        return <AccountNotProvisioned email={user.email} onSignOut={() => { void signOut(); }} />;
    }

    // Handle retry for auth failures
    const handleRetry = async () => {
        setIsRetrying(true);
        await retryAuth();
        setIsRetrying(false);
    };

    let allowed = true;

    if (role) {
        if (!canAccessRoute(pathname, role, permissions)) allowed = false;
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
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
                <div className="max-w-md w-full">
                    <AccessDenied message="You do not have the required permissions to view this page." />
                    {/* Show retry button if user exists but no role (auth might have failed) */}
                    {user && !role && (
                        <div className="mt-6 text-center">
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Authentication may have failed to complete. Try refreshing your session.
                            </p>
                            <button
                                onClick={handleRetry}
                                disabled={isRetrying}
                                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isRetrying ? 'Retrying...' : 'Retry Authentication'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
