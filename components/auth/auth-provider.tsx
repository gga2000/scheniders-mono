"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { activityLogger } from "@/lib/activity-logger";
import type { UserProfile, AuthContextType } from "@/types/auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Track the current user ID to avoid redundant state updates on TOKEN_REFRESHED
    const currentUserIdRef = useRef<string | null>(null);

    const fetchRoleAndPermissions = async (userId: string) => {
        try {
            // 1. Fetch Full Profile first (needed to get role)
            const { data: profileData, error: profileError } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (profileData) {
                setRole(profileData.role);
                setProfile(profileData as UserProfile);

                // 2. Fetch Role Permissions AND User Overrides in PARALLEL
                // These don't depend on each other, only on profile/userId
                const [rolePermsResult, userOverridesResult] = await Promise.all([
                    supabase
                        .from('role_permissions')
                        .select('permission')
                        .eq('role', profileData.role),
                    supabase
                        .from('user_permissions')
                        .select('permission, is_granted')
                        .eq('user_id', userId)
                ]);

                const finalPermissions = new Set(rolePermsResult.data?.map(p => p.permission) || []);

                // Apply user overrides
                if (userOverridesResult.data) {
                    userOverridesResult.data.forEach(override => {
                        if (override.is_granted) {
                            finalPermissions.add(override.permission);
                        } else {
                            finalPermissions.delete(override.permission);
                        }
                    });
                }

                setPermissions(Array.from(finalPermissions));

            } else {
                console.error(`[Auth] NO PROFILE FOUND for user ${userId} — this user CANNOT write to orders (RLS will block all writes)`);
                setRole(null);
                setProfile(null);
                setPermissions([]);
            }
        } catch (error) {
            console.error("Error fetching user role/permissions:", error);
            setRole(null);
            setProfile(null);
            setPermissions([]);
        }
    };

    const refreshProfile = useCallback(async () => {
        if (user) {
            await fetchRoleAndPermissions(user.id);
        }
    }, [user]);

    // Session health check: detect expired/invalid sessions
    // that would cause silent RLS write failures
    useEffect(() => {
        if (!session) return;

        const checkSession = async () => {
            const { data: { session: currentSession }, error } = await supabase.auth.getSession();
            if (error || !currentSession) {
                console.error("[Auth] Session expired or invalid — attempting refresh");
                const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError || !refreshData.session) {
                    console.error("[Auth] Session refresh FAILED — user must re-login", refreshError?.message);
                    // Force sign out so they get redirected to login
                    await supabase.auth.signOut();
                }
            }
        };

        // Check session health every 5 minutes
        const interval = setInterval(checkSession, 5 * 60 * 1000);

        // Also check when app regains focus (user switches back to tab)
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                checkSession();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [session]);

    // Session Storage Keys for instant Auth hydration
    const AUTH_CACHE_KEY = 'auth_session_cache';

    // Helper to cache auth state
    const cacheAuthState = (user: User | null, role: string | null, permissions: string[]) => {
        if (!user) {
            sessionStorage.removeItem(AUTH_CACHE_KEY);
            return;
        }
        sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
            userId: user.id,
            role,
            permissions,
            timestamp: Date.now()
        }));
    };

    // Helper to load auth state from cache
    const getCachedAuthState = (currentUserId: string): { role: string | null, permissions: string[] } | null => {
        try {
            const cached = sessionStorage.getItem(AUTH_CACHE_KEY);
            if (!cached) return null;
            const parsed = JSON.parse(cached);

            // Only use cache if it belongs to the current user and is less than 1 hour old
            if (parsed.userId !== currentUserId || (Date.now() - parsed.timestamp) > 60 * 60 * 1000) {
                sessionStorage.removeItem(AUTH_CACHE_KEY);
                return null;
            }
            return { role: parsed.role, permissions: parsed.permissions };
        } catch (e) {
            return null;
        }
    };

    // Initialize auth state
    useEffect(() => {
        let mounted = true;
        const _tAuthInit = performance.now();
        console.log(`[Diag:Auth] INIT`);

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, currentSession) => {
                if (!mounted) return;
                console.log(`[Diag:Auth] EVENT=${event} hasSession=${!!currentSession} elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms`);

                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    if (!currentSession?.user) {
                        setSession(null);
                        setUser(null);
                        setRole(null);
                        setProfile(null);
                        setPermissions([]);
                        cacheAuthState(null, null, []);
                        setIsLoading(false);
                        return;
                    }

                    // ── CRITICAL FIX: Set session IMMEDIATELY ──
                    // This unblocks useOrdersQuery (enabled: !!session) and
                    // prevents the app from deadlocking if the profile DB fetch
                    // hangs on a stale connection after device sleep.
                    setUser(currentSession.user);
                    setSession(currentSession);
                    currentUserIdRef.current = currentSession.user.id;

                    // Try cache for instant role/permissions hydration
                    const cachedAuth = getCachedAuthState(currentSession.user.id);
                    if (cachedAuth) {
                        console.log(`[Diag:Auth] CACHE_HIT role=${cachedAuth.role} elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms`);
                        setRole(cachedAuth.role);
                        setPermissions(cachedAuth.permissions);
                    } else {
                        console.log(`[Diag:Auth] CACHE_MISS — fetching profile in background`);
                    }

                    // Unblock UI — session is ready, profile loads in background
                    console.log(`[Diag:Auth] SESSION_READY elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms`);
                    setIsLoading(false);

                    // ── Background: fetch fresh profile with 10s timeout ──
                    // If Supabase connection is stale (after sleep), this aborts
                    // instead of hanging forever. Cached permissions are used as fallback.
                    const profileController = new AbortController();
                    const profileTimeoutId = setTimeout(() => profileController.abort(), 10_000);

                    try {
                        const { data: profileData } = await supabase
                            .from('user_profiles')
                            .select('*')
                            .eq('id', currentSession.user.id)
                            .abortSignal(profileController.signal)
                            .single();

                        clearTimeout(profileTimeoutId);

                        if (profileData && mounted) {
                            let finalRole = cachedAuth?.role ?? null;
                            let finalPermissions = cachedAuth?.permissions ?? [];
                            const finalProfile = profileData as UserProfile;

                            // Re-fetch permissions if role changed or no cache existed
                            if (!cachedAuth || cachedAuth.role !== profileData.role) {
                                finalRole = profileData.role;
                                const [rolePermsResult, userOverridesResult] = await Promise.all([
                                    supabase.from('role_permissions').select('permission').eq('role', profileData.role),
                                    supabase.from('user_permissions').select('permission, is_granted').eq('user_id', currentSession.user.id)
                                ]);

                                const permsSet = new Set(rolePermsResult.data?.map(p => p.permission) || []);
                                if (userOverridesResult.data) {
                                    userOverridesResult.data.forEach(override => {
                                        if (override.is_granted) permsSet.add(override.permission);
                                        else permsSet.delete(override.permission);
                                    });
                                }
                                finalPermissions = Array.from(permsSet);
                            }

                            cacheAuthState(currentSession.user, profileData.role, finalPermissions);

                            if (mounted) {
                                setRole(finalRole);
                                setProfile(finalProfile);
                                setPermissions(finalPermissions);
                            }
                            console.log(`[Diag:Auth] PROFILE_OK role=${finalRole} elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms`);
                        }
                    } catch (profileErr) {
                        clearTimeout(profileTimeoutId);
                        if (profileErr instanceof Error && profileErr.name === 'AbortError') {
                            console.warn('[Diag:Auth] PROFILE_TIMEOUT — using cached/default permissions');
                        } else {
                            console.error('[Diag:Auth] PROFILE_ERR:', profileErr);
                        }
                    }

                    // Background Activity Logging for sign-in
                    if (event === 'SIGNED_IN') {
                        supabase.from('user_profiles').update({
                            last_login_at: new Date().toISOString()
                        }).eq('id', currentSession.user.id).then();

                        activityLogger.log({
                            action: "user.login",
                            entityType: "user",
                            entityId: currentSession.user.id
                        });
                    }
                } else if (event === 'SIGNED_OUT') {
                    currentUserIdRef.current = null;
                    setUser(null);
                    setSession(null);
                    setRole(null);
                    setProfile(null);
                    setPermissions([]);
                    cacheAuthState(null, null, []);
                    setIsLoading(false);
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            // Role fetch will be handled by onAuthStateChange
            return { error };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const signUp = useCallback(async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signUp({
                email,
                password,
            });
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

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                role,
                profile,
                permissions,
                isLoading,
                signIn,
                signUp,
                signOut,
                resetPassword,
                updatePassword,
                refreshProfile,
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
