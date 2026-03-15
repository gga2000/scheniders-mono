"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, SupabaseConnectionMonitor } from "@/lib/supabase";
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

    // Track deferred logout timeout — when INITIAL_SESSION fires with no session,
    // Supabase may still be refreshing the token. We wait before clearing state.
    const deferredLogoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Abort in-flight profile fetches when a new auth event arrives (deduplication)
    const profileAbortRef = useRef<AbortController | null>(null);

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

    // localStorage (NOT sessionStorage) for cross-tab auth synchronization
    const AUTH_CACHE_KEY = 'auth_session_cache';

    // Helper to cache auth state (uses localStorage for cross-tab sync)
    const cacheAuthState = (user: User | null, role: string | null, permissions: string[]) => {
        if (!user) {
            console.log(`[Diag:Cache] CLEAR reason=noUser`);
            localStorage.removeItem(AUTH_CACHE_KEY);
            return;
        }
        localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
            userId: user.id,
            role,
            permissions,
            timestamp: Date.now()
        }));
        console.log(`[Diag:Cache] WRITE userId=${user.id} role=${role} permsCount=${permissions.length}`);
    };

    // Helper to load auth state from cache (uses localStorage)
    const getCachedAuthState = (currentUserId: string): { role: string | null, permissions: string[] } | null => {
        try {
            const cached = localStorage.getItem(AUTH_CACHE_KEY);
            if (!cached) {
                console.log(`[Diag:Cache] MISS reason=notFound userId=${currentUserId}`);
                return null;
            }
            const parsed = JSON.parse(cached);
            const age = Date.now() - parsed.timestamp;
            const ttl = 8 * 60 * 60 * 1000; // 8 hours (increased from 1 hour to reduce expiry on long-lived sessions)

            // User mismatch
            if (parsed.userId !== currentUserId) {
                console.log(`[Diag:Cache] MISS reason=userMismatch cachedUser=${parsed.userId} currentUser=${currentUserId}`);
                localStorage.removeItem(AUTH_CACHE_KEY);
                return null;
            }

            // Expired (>8 hours old)
            if (age > ttl) {
                console.log(`[Diag:Cache] MISS reason=expired age=${(age / 1000).toFixed(1)}s ttl=${(ttl / 1000).toFixed(1)}s userId=${currentUserId}`);
                localStorage.removeItem(AUTH_CACHE_KEY);
                return null;
            }

            console.log(`[Diag:Cache] HIT age=${(age / 1000).toFixed(1)}s role=${parsed.role} userId=${currentUserId}`);
            return { role: parsed.role, permissions: parsed.permissions };
        } catch (e) {
            console.error(`[Diag:Cache] ERROR parsing cache userId=${currentUserId} err=${e instanceof Error ? e.message : e}`);
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
                console.log(`[Diag:Auth] EVENT=${event} hasSession=${!!currentSession} hasUser=${!!currentSession?.user} elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms`);

                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    if (!currentSession?.user) {
                        if (event === 'INITIAL_SESSION') {
                            // ── CRITICAL: Don't immediately clear state! ──
                            // When the stored token is expired, Supabase fires INITIAL_SESSION
                            // with NO session, then auto-refreshes the token and fires SIGNED_IN
                            // a few seconds later. If we clear state now, the app shows "not logged in"
                            // during the refresh window.
                            //
                            // Instead, keep isLoading=true and set a deferred timeout.
                            // If SIGNED_IN arrives before the timeout, we cancel and proceed normally.
                            const DEFERRED_LOGOUT_MS = 10_000; // 10s grace for token refresh
                            console.warn(`[Diag:Auth] INITIAL_SESSION_EMPTY — deferring logout for ${DEFERRED_LOGOUT_MS}ms to allow token refresh`);

                            deferredLogoutRef.current = setTimeout(() => {
                                if (!mounted) return;
                                console.error(`[Diag:Auth] DEFERRED_LOGOUT — no valid session arrived within ${DEFERRED_LOGOUT_MS}ms, clearing auth state`);
                                setSession(null);
                                setUser(null);
                                setRole(null);
                                setProfile(null);
                                setPermissions([]);
                                cacheAuthState(null, null, []);
                                setIsLoading(false);
                            }, DEFERRED_LOGOUT_MS);
                            return;
                        }

                        // For SIGNED_IN/TOKEN_REFRESHED with no session: clear immediately
                        setSession(null);
                        setUser(null);
                        setRole(null);
                        setProfile(null);
                        setPermissions([]);
                        cacheAuthState(null, null, []);
                        setIsLoading(false);
                        return;
                    }

                    // We got a valid session — cancel any deferred logout
                    if (deferredLogoutRef.current) {
                        clearTimeout(deferredLogoutRef.current);
                        deferredLogoutRef.current = null;
                        console.log(`[Diag:Auth] DEFERRED_LOGOUT_CANCELLED — valid session arrived via ${event}`);
                    }

                    // ── Set session IMMEDIATELY ──
                    // This unblocks useOrdersQuery (enabled: !!session) and
                    // prevents the app from deadlocking if the profile DB fetch
                    // hangs on a stale connection after device sleep.
                    setUser(currentSession.user);
                    setSession(currentSession);
                    currentUserIdRef.current = currentSession.user.id;

                    // Try cache for instant role/permissions hydration (getCachedAuthState logs internally)
                    const cachedAuth = getCachedAuthState(currentSession.user.id);
                    if (cachedAuth) {
                        setRole(cachedAuth.role);
                        setPermissions(cachedAuth.permissions);
                    }

                    // Unblock UI — session is ready, profile loads in background
                    console.log(`[Diag:Auth] SESSION_READY elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms`);
                    setIsLoading(false);

                    // ── Skip redundant profile fetch on TOKEN_REFRESHED ──
                    // If same user and cache is fresh (<5 min old), no need to re-fetch
                    if (event === 'TOKEN_REFRESHED' && cachedAuth) {
                        console.log(`[Diag:Auth] TOKEN_REFRESHED_SKIP — same user, cache fresh, skipping profile fetch`);
                        // Still update session object (token changed) but skip profile re-fetch
                        // Background Activity Logging not needed for token refresh
                        return;
                    }

                    // ── Background: fetch fresh profile with 10s timeout ──
                    // Abort any in-flight profile fetch from a previous event (deduplication)
                    if (profileAbortRef.current) {
                        profileAbortRef.current.abort();
                        console.log(`[Diag:Auth] PROFILE_FETCH_DEDUP — aborted previous in-flight fetch`);
                    }

                    const profileController = new AbortController();
                    profileAbortRef.current = profileController;
                    const profileTimeoutId = setTimeout(() => profileController.abort(), 10_000);
                    console.log(`[Diag:Auth] PROFILE_FETCH_START mounted=${mounted} userId=${currentSession.user.id}`);

                    // Fire connection health check in background (non-blocking diagnostic)
                    SupabaseConnectionMonitor.checkConnectionHealth()
                        .then(h => console.log(`[Diag:Auth] CONN_HEALTH healthy=${h.isHealthy} latency=${h.latency.toFixed(1)}ms`))
                        .catch(e => console.error(`[Diag:Auth] CONN_HEALTH_FAILED err=${e instanceof Error ? e.message : e}`));

                    const _tProfileQuery = performance.now();
                    try {
                        const { data: profileData, error: profileQueryError } = await supabase
                            .from('user_profiles')
                            .select('*')
                            .eq('id', currentSession.user.id)
                            .abortSignal(profileController.signal)
                            .single();

                        clearTimeout(profileTimeoutId);
                        const profileQueryMs = performance.now() - _tProfileQuery;
                        console.log(`[Diag:Auth] PROFILE_FETCH_DONE mounted=${mounted} hasData=${!!profileData} error=${profileQueryError?.message ?? 'none'} queryMs=${profileQueryMs.toFixed(1)}ms totalElapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms`);

                        if (!profileData && mounted) {
                            console.error(`[Diag:Auth] PROFILE_NULL — no row returned for userId=${currentSession.user.id}. RLS blocking or missing row? role will stay null!`);
                        }
                        if (profileData && !mounted) {
                            console.warn(`[Diag:Auth] PROFILE_STALE — data arrived but mounted=false (HMR/unmount race). role=${profileData.role} DISCARDED`);
                        }

                        if (profileData && mounted) {
                            let finalRole = profileData.role;
                            let finalPermissions = cachedAuth?.permissions ?? [];
                            const finalProfile = profileData as UserProfile;

                            // Re-fetch permissions if role changed or no cache existed
                            if (!cachedAuth || cachedAuth.role !== profileData.role) {
                                try {
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
                                } catch (permErr) {
                                    // Permissions fetch failed — use cached permissions as fallback
                                    console.error(`[Diag:Auth] PERMS_FETCH_FAILED — using ${cachedAuth ? 'cached' : 'empty'} permissions:`, permErr);
                                    finalPermissions = cachedAuth?.permissions ?? [];
                                }
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
                            // Only log as warning if this was a timeout, not a deduplication abort
                            if (profileAbortRef.current === profileController) {
                                console.warn(`[Diag:Auth] PROFILE_TIMEOUT aborted=true mounted=${mounted} elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms`);
                            }
                            // else: silently ignore — this fetch was superseded by a newer one
                        } else {
                            console.error(`[Diag:Auth] PROFILE_ERR mounted=${mounted} elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms:`, profileErr);
                        }
                    } finally {
                        // Clear the ref if this controller is still the active one
                        if (profileAbortRef.current === profileController) {
                            profileAbortRef.current = null;
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

        // Listen for auth changes in other tabs (cross-tab synchronization)
        let crossTabDebounce: ReturnType<typeof setTimeout> | null = null;
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key !== AUTH_CACHE_KEY || !mounted) return;

            // Debounce rapid storage events (e.g., multiple tabs syncing)
            if (crossTabDebounce) clearTimeout(crossTabDebounce);
            crossTabDebounce = setTimeout(() => {
                if (!mounted) return;
                console.log('[Diag:Auth] Cross-tab auth change detected');

                if (e.newValue === null) {
                    // Another tab logged out — verify session is actually gone
                    console.log('[Diag:Auth] Other tab logged out — verifying session');
                    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
                        if (!mounted) return;
                        if (!currentSession) {
                            setUser(null);
                            setSession(null);
                            setRole(null);
                            setProfile(null);
                            setPermissions([]);
                            setIsLoading(false);
                        }
                    });
                } else {
                    // Another tab logged in — apply cached state
                    try {
                        const parsed = JSON.parse(e.newValue);
                        if (parsed?.role && mounted) {
                            supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
                                if (!mounted || !currentSession?.user) return;
                                if (currentSession.user.id === parsed.userId) {
                                    setUser(currentSession.user);
                                    setSession(currentSession);
                                    setRole(parsed.role);
                                    setPermissions(parsed.permissions || []);
                                    setIsLoading(false);
                                }
                            });
                        }
                    } catch {
                        // Malformed cache data from other tab — ignore
                    }
                }
            }, 300); // 300ms debounce
        };

        window.addEventListener('storage', handleStorageChange);

        return () => {
            mounted = false;
            subscription.unsubscribe();
            window.removeEventListener('storage', handleStorageChange);
            if (deferredLogoutRef.current) {
                clearTimeout(deferredLogoutRef.current);
                deferredLogoutRef.current = null;
            }
            if (crossTabDebounce) {
                clearTimeout(crossTabDebounce);
            }
            if (profileAbortRef.current) {
                profileAbortRef.current.abort();
                profileAbortRef.current = null;
            }
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

    // Manual auth refresh/retry - useful when auth gets stuck
    const retryAuth = useCallback(async () => {
        console.log('[Diag:Auth] MANUAL_RETRY triggered');
        setIsLoading(true);
        try {
            const { data: { session: currentSession }, error } = await supabase.auth.getSession();

            if (error) {
                console.error('[Diag:Auth] RETRY_ERROR:', error);
                setIsLoading(false);
                return { error };
            }

            if (currentSession?.user) {
                setUser(currentSession.user);
                setSession(currentSession);
                await fetchRoleAndPermissions(currentSession.user.id);
                console.log('[Diag:Auth] RETRY_SUCCESS');
            } else {
                console.log('[Diag:Auth] RETRY_NO_SESSION');
            }

            setIsLoading(false);
            return { error: null };
        } catch (err) {
            console.error('[Diag:Auth] RETRY_EXCEPTION:', err);
            setIsLoading(false);
            return { error: err };
        }
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
