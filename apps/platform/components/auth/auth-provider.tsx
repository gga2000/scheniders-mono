"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, getStoredSupabaseSession, getJwtExpiry } from "@/lib/supabase";
import { activityLogger } from "@/lib/activity-logger";
import type { UserProfile, AuthContextType } from "@/types/auth";
import { diag } from "@/lib/diag";

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
        diag.log(`[Auth] INIT`);

        // ── PHASE 1: Instant bootstrap from localStorage ──
        const storedSession = getStoredSupabaseSession();
        let bootstrapped = false;

        if (storedSession?.user?.id && storedSession.access_token) {
            const expiry = getJwtExpiry(storedSession.access_token);
            const nowSec = Math.floor(Date.now() / 1000);
            const tokenValid = expiry !== null && (expiry - nowSec) > 60;

            setUser(storedSession.user as unknown as User);
            setSession(storedSession as unknown as Session);
            currentUserIdRef.current = storedSession.user.id;
            setIsLoading(false);
            bootstrapped = true;

            if (tokenValid) {
                // Token is valid — queries can start immediately.
                // The fetch wrapper injects auth headers from localStorage.
                // For valid tokens, _initialize() completes in <10ms (no network call).
                setClientReady(true);
                diag.log(`[Auth] BOOTSTRAP — clientReady=true (token valid, expires in ${expiry! - nowSec}s)`);

                // Eagerly fetch profile so role/permissions are available ASAP.
                // The fetch wrapper injects the stored token, so this works pre-init.
                fetchProfile(storedSession.user.id);
            } else {
                diag.log(`[Auth] BOOTSTRAP — token expired, waiting for refresh`);
            }
        } else {
            diag.log(`[Auth] BOOTSTRAP_NONE — no stored session`);
        }

        // ── PHASE 2: Subscribe to auth events ──
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, currentSession) => {
                if (!mounted) return;
                diag.log(`[Auth] EVENT=${event} hasSession=${!!currentSession} elapsed=${(performance.now() - _tInit).toFixed(1)}ms`);

                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    if (!currentSession?.user) {
                        if (event === 'INITIAL_SESSION') {
                            // Token may be expired — Supabase will auto-refresh and fire SIGNED_IN.
                            // Also proactively attempt refresh to speed things up.
                            diag.warn(`[Auth] INITIAL_SESSION_EMPTY — attempting refresh`);
                            supabase.auth.refreshSession().catch(() => {});

                            // If no valid session arrives within 10s, clear state
                            if (deferredLogoutRef.current) clearTimeout(deferredLogoutRef.current);
                            deferredLogoutRef.current = setTimeout(() => {
                                if (!mounted) return;
                                diag.error(`[Auth] DEFERRED_LOGOUT — no session after 10s`);
                                setSession(null);
                                setUser(null);
                                setRole(null);
                                setProfile(null);
                                setPermissions([]);
                                setTenantId(null);
                                markProfileLoaded(false);
                                setClientReady(false);
                                setIsLoading(false);
                                deferredLogoutRef.current = null;
                            }, 10_000);
                            return;
                        }
                        // SIGNED_IN/TOKEN_REFRESHED with no session — clear immediately
                        setSession(null);
                        setUser(null);
                        setRole(null);
                        setProfile(null);
                        setPermissions([]);
                        markProfileLoaded(false);
                        setIsLoading(false);
                        return;
                    }

                    // Valid session arrived — cancel any deferred logout
                    if (deferredLogoutRef.current) {
                        clearTimeout(deferredLogoutRef.current);
                        deferredLogoutRef.current = null;
                    }

                    // Skip redundant profile fetch on token refresh for same user
                    const isSameUser = currentSession.user.id === currentUserIdRef.current;

                    // Update state
                    setUser(currentSession.user);
                    setSession(currentSession);
                    setClientReady(true);
                    currentUserIdRef.current = currentSession.user.id;
                    setIsLoading(false);

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

        // Safety: if no bootstrap AND no auth event within 15s, stop loading
        const safetyTimeout = !bootstrapped ? setTimeout(() => {
            if (mounted) {
                diag.error(`[Auth] SAFETY_TIMEOUT — 15s with no auth, setting isLoading=false`);
                setIsLoading(false);
            }
        }, 15_000) : null;

        return () => {
            mounted = false;
            if (safetyTimeout) clearTimeout(safetyTimeout);
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
