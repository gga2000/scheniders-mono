"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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
    const { user, role: contextRole, permissions, isLoading, profileLoaded, retryAuth } = useAuth();
    const router = useRouter();
    const [isRetrying, setIsRetrying] = useState(false);

    if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log(`[PageGuard] render: isLoading=${isLoading}, user=${!!user}, role=${contextRole}, profileLoaded=${profileLoaded}`);
    }

    // Use effect to handle redirect if needed (for auth)
    useEffect(() => {
        if (!isLoading && !user) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    const role = contextRole as UserRole;

    // While loading, render children immediately — the sidebar/topbar chrome
    // appears instantly and each page handles its own skeleton/loading state.
    // The useEffect above still handles redirect if user turns out unauthenticated.
    if (isLoading || !user) {
        return <>{children}</>;
    }

    // If user is authenticated but profile hasn't loaded yet, keep showing children.
    // This replaces the old timer-based grace period — we now wait for the actual
    // profile fetch to complete (or fail) instead of using a fixed timeout.
    if (user && !role && !profileLoaded) {
        return <>{children}</>;
    }

    // Handle retry for auth failures
    const handleRetry = async () => {
        setIsRetrying(true);
        await retryAuth();
        setIsRetrying(false);
    };

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
