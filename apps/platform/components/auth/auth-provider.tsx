"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { activityLogger } from "@/lib/activity-logger";
import type { UserProfile, AuthContextType } from "@/types/auth";
import { diag } from "@/lib/diag";
import { perfTrace } from "@/lib/perf-trace";
import { clearPersistedBooks } from "@/lib/orders/persisted-book";
import { reportOrderError } from "@/lib/order-telemetry";
import { sentryIdentityFor } from "@/lib/sentry-identity";
import { applyPermissionOverrides, resolveEffectiveRole, type UserRole } from "@/lib/permissions";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Delete what the app keeps on the device for the signed-in user: the saved
 * order books hold customer names, phones and addresses.
 */
function forgetDeviceData(): void {
    clearPersistedBooks().catch((err: unknown) => reportOrderError(err, { operation: "orders-book-clear" }));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [clientReady, setClientReady] = useState(false);
    // True once we've confirmed the signed-in user has NO user_profiles row —
    // e.g. a brand-new Google sign-in that hasn't been invited/provisioned.
    const [profileMissing, setProfileMissing] = useState(false);

    const currentUserIdRef = useRef<string | null>(null);
    const profileLoadedRef = useRef(false);
    // The tenant last published, readable inside fetchProfile's closure.
    const tenantIdRef = useRef<string | null>(null);
    const deferredLogoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep ref in sync with state (ref is readable inside useEffect closures)
    const markProfileLoaded = useCallback((loaded: boolean) => {
        profileLoadedRef.current = loaded;
        setProfileLoaded(loaded);
    }, []);

    // ── Fetch profile, role, and permissions ──
    const fetchProfile = useCallback(async (userId: string) => {
        try {
            const { data: profileData } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (!profileData) {
                diag.error(`[Auth] NO PROFILE for userId=${userId} — unprovisioned (invite-only)`);
                setRole(null);
                setProfile(null);
                setPermissions([]);
                setProfileMissing(true);
                markProfileLoaded(true);
                return;
            }

            const currentTenantId: string | null = profileData.current_tenant_id ?? null;
            perfTrace.mark('auth:profile-row');
            // The tenant is known from this row alone, so publish it now: the
            // order book and every other tenant-scoped read start while the
            // role and permissions below are still loading, instead of two
            // round trips later (measured 0.5-4.2s on /orders). This grants
            // nothing. RLS decides what those reads return, and every UI gate
            // fails closed on a null role (hasPermission, canAccessRoute,
            // RoleGuard), while PageGuard holds restricted routes until
            // profileLoaded.
            if (tenantIdRef.current !== currentTenantId) {
                // A different tenant than the role and permissions in state
                // were read for (a tenant switch): drop them in the same
                // render, so the new tenant is never paired with the old
                // tenant's role, and hold restricted routes on their skeleton
                // until this tenant's role is in.
                setRole(null);
                setPermissions([]);
                markProfileLoaded(false);
            }
            tenantIdRef.current = currentTenantId;
            setTenantId(currentTenantId);
            perfTrace.mark('auth:tenant', { hasTenant: !!currentTenantId });

            // The role that governs what this user may do is their role in the
            // current tenant (tenant_members.role), the same row RLS reads.
            // user_profiles.role only contributes super_admin (platform staff).
            const { data: membership } = currentTenantId
                ? await supabase
                    .from('tenant_members')
                    .select('role')
                    .eq('tenant_id', currentTenantId)
                    .eq('user_id', userId)
                    .eq('status', 'active')
                    .maybeSingle()
                : { data: null };
            const effectiveRole = resolveEffectiveRole(profileData.role, membership?.role);
            perfTrace.mark('auth:membership');

            // Fetch role permissions + this tenant's user overrides in parallel.
            // Overrides are per tenant: one granted in another store grants
            // nothing here (has_tenant_permission applies the same rule).
            const [rolePermsResult, userOverridesResult] = effectiveRole
                ? await Promise.all([
                    supabase.from('role_permissions').select('permission').eq('role', effectiveRole),
                    currentTenantId
                        ? supabase.from('user_permissions').select('permission, is_granted')
                            .eq('tenant_id', currentTenantId)
                            .eq('user_id', userId)
                        : Promise.resolve({ data: null }),
                ])
                : [{ data: null }, { data: null }];

            const perms = applyPermissionOverrides(
                rolePermsResult.data?.map(p => p.permission) ?? [],
                userOverridesResult.data ?? [],
            );

            setProfileMissing(false);
            setRole(effectiveRole);
            setProfile(profileData as UserProfile);
            setPermissions(perms);
            markProfileLoaded(true);
            perfTrace.mark('auth:profile-loaded', { role: effectiveRole ?? 'none', perms: perms.length });
            diag.log(`[Auth] PROFILE_OK userId=${userId} role=${effectiveRole ?? 'none'} perms=${perms.length}`);
        } catch (err) {
            diag.error(`[Auth] PROFILE_ERR userId=${userId}:`, err);
            markProfileLoaded(true);
        }
    }, []);

    const refreshProfile = useCallback(async () => {
        if (user) await fetchProfile(user.id);
    }, [user, fetchProfile]);

    // ── Session health check on visibility change ──
    useEffect(() => {
        if (!session) return;

        const checkSession = async () => {
            const { data: { session: current }, error } = await supabase.auth.getSession();
            if (error || !current) {
                diag.error("[Auth] Session expired — attempting refresh");
                const { error: refreshErr } = await supabase.auth.refreshSession();
                if (refreshErr) {
                    diag.error("[Auth] Refresh FAILED — signing out");
                    await supabase.auth.signOut();
                }
            }
        };

        const interval = setInterval(checkSession, 5 * 60 * 1000);
        const handleVisibility = () => {
            if (document.visibilityState === "visible") checkSession();
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [session]);

    // ── Initialize auth state ──
    useEffect(() => {
        let mounted = true;
        const _tInit = performance.now();
        perfTrace.mark('auth:init');
        diag.log(`[Auth] INIT`);

        // Session lives in cookies (createBrowserClient) — onAuthStateChange fires
        // INITIAL_SESSION with the cookie session on init, so there's no localStorage
        // bootstrap. createBrowserClient also auto-refreshes the token during init,
        // so an empty INITIAL_SESSION genuinely means "not authenticated".

        // Safety net: if no auth event arrives within 15s (e.g. a network failure),
        // release the loading state so the UI can't get stuck. Cleared the moment
        // any auth event resolves.
        let safetyTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
            if (mounted) {
                diag.error(`[Auth] SAFETY_TIMEOUT — 15s with no auth event, releasing loading state`);
                setIsLoading(false);
            }
        }, 15_000);
        const clearSafety = () => {
            if (safetyTimeout) { clearTimeout(safetyTimeout); safetyTimeout = null; }
        };

        // ── Subscribe to auth events ──
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, currentSession) => {
                if (!mounted) return;
                diag.log(`[Auth] EVENT=${event} hasSession=${!!currentSession} elapsed=${(performance.now() - _tInit).toFixed(1)}ms`);

                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    if (!currentSession?.user) {
                        // No session (cookie absent or expired) = not authenticated.
                        // createBrowserClient already auto-refreshed during init, so there
                        // is nothing to wait for — clear state and let the route guard
                        // redirect to /login immediately (no more 10s deferred-logout wait).
                        clearSafety();
                        if (deferredLogoutRef.current) { clearTimeout(deferredLogoutRef.current); deferredLogoutRef.current = null; }
                        forgetDeviceData();
                        setSession(null);
                        setUser(null);
                        setRole(null);
                        setProfile(null);
                        setPermissions([]);
                        tenantIdRef.current = null;
                        setTenantId(null);
                        markProfileLoaded(false);
                        setClientReady(false);
                        setIsLoading(false);
                        return;
                    }

                    // Valid session — cancel the safety timer + any pending deferred logout.
                    clearSafety();
                    if (deferredLogoutRef.current) {
                        clearTimeout(deferredLogoutRef.current);
                        deferredLogoutRef.current = null;
                    }

                    const isSameUser = currentSession.user.id === currentUserIdRef.current;

                    setUser(currentSession.user);
                    setSession(currentSession);
                    setClientReady(true);
                    perfTrace.mark('auth:session', { event });
                    currentUserIdRef.current = currentSession.user.id;
                    setIsLoading(false);

                    // Private Realtime channels (chat presence + per-conversation
                    // broadcast) authorize via RLS on realtime.messages, which evaluates
                    // auth.uid()/role from the JWT on the socket. The SSR cookie client
                    // does NOT push that token to Realtime automatically, so set it
                    // explicitly on every (re)auth — without it, private channels fall
                    // back to `anon` and every subscribe is denied (presence shows 0).
                    void supabase.realtime.setAuth(currentSession.access_token);

                    // Skip the redundant profile refetch when only the token rotated.
                    if (event === 'TOKEN_REFRESHED' && isSameUser && profileLoadedRef.current) {
                        diag.log(`[Auth] TOKEN_REFRESHED — same user, skipping profile fetch`);
                        return;
                    }

                    // Fetch profile in background
                    fetchProfile(currentSession.user.id);

                    // Activity logging on sign-in
                    if (event === 'SIGNED_IN') {
                        supabase.from('user_profiles').update({
                            last_login_at: new Date().toISOString()
                        }).eq('id', currentSession.user.id).then();

                        activityLogger.log({
                            action: "user.login",
                            entityType: "user",
                            entityId: currentSession.user.id,
                        });
                    }
                } else if (event === 'SIGNED_OUT') {
                    clearSafety();
                    forgetDeviceData();
                    void supabase.realtime.setAuth(); // drop the JWT from the socket
                    currentUserIdRef.current = null;
                    setUser(null);
                    setSession(null);
                    setRole(null);
                    setProfile(null);
                    setPermissions([]);
                    tenantIdRef.current = null;
                    setTenantId(null);
                    markProfileLoaded(false);
                    setClientReady(false);
                    setIsLoading(false);
                }
            }
        );

        return () => {
            mounted = false;
            clearSafety();
            if (deferredLogoutRef.current) clearTimeout(deferredLogoutRef.current);
            subscription.unsubscribe();
        };
    }, []);

    // ── Auth actions ──
    const signIn = useCallback(async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            return { error };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const signUp = useCallback(async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signUp({ email, password });
            return { error };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const signOut = useCallback(async () => {
        setIsLoading(true);
        try {
            await supabase.auth.signOut();
        } finally {
            setIsLoading(false);
        }
    }, []);

    const resetPassword = useCallback(async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });
        return { error };
    }, []);

    const updatePassword = useCallback(async (password: string) => {
        const { error } = await supabase.auth.updateUser({ password });
        return { error };
    }, []);

    const signInWithGoogle = useCallback(async (returnTo: string = '/orders') => {
        // PKCE OAuth → Google → back to /api/auth/callback, which exchanges the
        // code for a COOKIE session (createServerClient) and forwards to `next`.
        // Reuses the exact cookie callback the email/password flow already uses.
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(returnTo)}`,
            },
        });
        return { error };
    }, []);

    // Link a Google identity to the CURRENT logged-in account — same auth user
    // id, so ALL existing data is preserved; Google just becomes an additional
    // way to sign in. Requires "Manual linking" enabled in Supabase Auth.
    const linkGoogle = useCallback(async () => {
        const { error } = await supabase.auth.linkIdentity({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent('/settings')}`,
            },
        });
        return { error };
    }, []);

    const retryAuth = useCallback(async () => {
        diag.log('[Auth] MANUAL_RETRY');
        setIsLoading(true);
        try {
            const { data: { session: current }, error } = await supabase.auth.getSession();
            if (error) {
                setIsLoading(false);
                return { error };
            }
            if (current?.user) {
                setUser(current.user);
                setSession(current);
                setClientReady(true);
                await fetchProfile(current.user.id);
            }
            setIsLoading(false);
            return { error: null };
        } catch (err) {
            setIsLoading(false);
            return { error: err };
        }
    }, [fetchProfile]);

    // Attach identity to Sentry once, here, so every captured error is
    // attributable to a user and a tenant instead of being an anonymous stack
    // trace. Cleared on sign-out so a shared machine does not mis-attribute the
    // next session. The SDK is imported dynamically, as in
    // instrumentation-client.ts: this provider is in the root layout, and a
    // static import would put the SDK on every route's first load.
    const sentryUserId = user?.id ?? null;
    useEffect(() => {
        const identity = sentryIdentityFor(sentryUserId, tenantId, role);
        void import("@sentry/nextjs").then((Sentry) => {
            Sentry.setUser(identity.user);
            Sentry.setTag("tenant_id", identity.tags.tenant_id);
            Sentry.setTag("user_role", identity.tags.user_role);
        });
    }, [sentryUserId, tenantId, role]);

    // Whether the current user already has a Google identity linked.
    const googleLinked = !!user?.identities?.some((i) => i.provider === 'google');

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                role,
                profile,
                permissions,
                tenantId,
                isLoading,
                profileLoaded,
                profileMissing,
                clientReady,
                signIn,
                signUp,
                signOut,
                resetPassword,
                updatePassword,
                signInWithGoogle,
                linkGoogle,
                googleLinked,
                refreshProfile,
                retryAuth,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}

/**
 * Auth if there is any, `undefined` if this tree has no provider.
 *
 * For leaf components that only need a session to ENRICH themselves — a
 * picker that lists products, say. Throwing there turns a missing provider
 * into a blank screen for the whole form, when the honest behaviour is to
 * render with no data to offer. Anything that gates access or writes must
 * keep using `useAuth`, so a missing provider stays loud.
 */
export function useOptionalAuth() {
    return useContext(AuthContext);
}
