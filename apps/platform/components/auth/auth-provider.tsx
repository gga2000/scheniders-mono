"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { activityLogger } from "@/lib/activity-logger";
import type { UserProfile, AuthContextType } from "@/types/auth";
import { diag } from "@/lib/diag";
import { perfTrace } from "@/lib/perf-trace";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [tenantId, setTenantId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [clientReady, setClientReady] = useState(false);

    const currentUserIdRef = useRef<string | null>(null);
    const profileLoadedRef = useRef(false);
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
                diag.error(`[Auth] NO PROFILE for userId=${userId} — RLS will block writes`);
                setRole(null);
                setProfile(null);
                setPermissions([]);
                markProfileLoaded(true);
                return;
            }

            setRole(profileData.role);
            setProfile(profileData as UserProfile);
            setTenantId(profileData.current_tenant_id ?? null);

            // Fetch role permissions + user overrides in parallel
            const [rolePermsResult, userOverridesResult] = await Promise.all([
                supabase.from('role_permissions').select('permission').eq('role', profileData.role),
                supabase.from('user_permissions').select('permission, is_granted').eq('user_id', userId),
            ]);

            const perms = new Set(rolePermsResult.data?.map(p => p.permission) || []);
            userOverridesResult.data?.forEach(override => {
                if (override.is_granted) perms.add(override.permission);
                else perms.delete(override.permission);
            });
            setPermissions(Array.from(perms));
            markProfileLoaded(true);
            perfTrace.mark('auth:profile-loaded', { role: profileData.role, perms: perms.size });
            diag.log(`[Auth] PROFILE_OK userId=${userId} role=${profileData.role} perms=${perms.size}`);
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
                        setSession(null);
                        setUser(null);
                        setRole(null);
                        setProfile(null);
                        setPermissions([]);
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
                    currentUserIdRef.current = currentSession.user.id;
                    setIsLoading(false);

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
                    currentUserIdRef.current = null;
                    setUser(null);
                    setSession(null);
                    setRole(null);
                    setProfile(null);
                    setPermissions([]);
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

    const signInWithGoogle = useCallback(async (returnTo: string = '/') => {
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
                clientReady,
                signIn,
                signUp,
                signOut,
                resetPassword,
                updatePassword,
                signInWithGoogle,
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
