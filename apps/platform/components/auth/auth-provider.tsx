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
    const [profileLoaded, setProfileLoaded] = useState(false);

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
        let authEventReceived = false;
        const _tAuthInit = performance.now();
        console.log(`[Diag:Auth] INIT`);

        // ── SAFETY NET: If onAuthStateChange never fires ──
        // Supabase's internal auth initialization can hang when it tries to
        // verify/refresh a stored token over a stale TCP connection (e.g., after
        // device sleep). If no auth event arrives within 10s, we manually call
        // getSession() + refreshSession() to break out of the stuck state.
        const AUTH_INIT_TIMEOUT_MS = 10_000;
        const authInitTimeout = setTimeout(async () => {
            if (authEventReceived || !mounted) return;
            console.error(`[Diag:Auth] INIT_TIMEOUT — no auth event received within ${AUTH_INIT_TIMEOUT_MS}ms, attempting manual recovery`);

            try {
                // Try getSession first (reads from localStorage, fast)
                const { data: { session: localSession } } = await supabase.auth.getSession();
                if (!mounted) return;

                if (localSession?.user) {
                    console.log(`[Diag:Auth] INIT_RECOVERY — found session via getSession, userId=${localSession.user.id}`);
                    setUser(localSession.user);
                    setSession(localSession);
                    currentUserIdRef.current = localSession.user.id;

                    const cachedAuth = getCachedAuthState(localSession.user.id);
                    if (cachedAuth) {
                        setRole(cachedAuth.role);
                        setPermissions(cachedAuth.permissions);
                        setProfileLoaded(true);
                    }
                    setIsLoading(false);

                    // Fetch fresh profile in background
                    fetchRoleAndPermissions(localSession.user.id).then(() => {
                        if (mounted) setProfileLoaded(true);
                    });
                } else {
                    // No local session — try refreshSession as last resort
                    console.warn(`[Diag:Auth] INIT_RECOVERY — no local session, trying refreshSession`);
                    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
                    if (!mounted) return;

                    if (refreshData?.session?.user) {
                        console.log(`[Diag:Auth] INIT_RECOVERY_REFRESH_OK userId=${refreshData.session.user.id}`);
                        setUser(refreshData.session.user);
                        setSession(refreshData.session);
                        currentUserIdRef.current = refreshData.session.user.id;
                        setIsLoading(false);

                        fetchRoleAndPermissions(refreshData.session.user.id).then(() => {
                            if (mounted) setProfileLoaded(true);
                        });
                    } else {
                        console.error(`[Diag:Auth] INIT_RECOVERY_FAILED — no session available, redirecting to login. err=${refreshErr?.message ?? 'none'}`);
                        setIsLoading(false);
                        // User will be redirected to login by PageGuard
                    }
                }
            } catch (err) {
                console.error(`[Diag:Auth] INIT_RECOVERY_ERR:`, err);
                if (mounted) setIsLoading(false);
            }
        }, AUTH_INIT_TIMEOUT_MS);

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, currentSession) => {
                if (!mounted) return;
                authEventReceived = true;
                clearTimeout(authInitTimeout);
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
                            // ACTIVE RECOVERY: Instead of passively waiting for SIGNED_IN,
                            // we proactively call refreshSession(). This forces a fresh HTTP
                            // request to GoTrue, bypassing any stale TCP connections.
                            // If it succeeds, onAuthStateChange will fire SIGNED_IN/TOKEN_REFRESHED.
                            // If it fails, we clear state after the timeout.
                            const DEFERRED_LOGOUT_MS = 10_000;
                            console.warn(`[Diag:Auth] INITIAL_SESSION_EMPTY — actively attempting refresh + deferring logout for ${DEFERRED_LOGOUT_MS}ms`);

                            // Proactively try to refresh the session (non-blocking)
                            supabase.auth.refreshSession().then(({ data, error: refreshErr }) => {
                                if (!mounted) return;
                                if (refreshErr || !data.session) {
                                    console.error(`[Diag:Auth] ACTIVE_REFRESH_FAILED err=${refreshErr?.message ?? 'no session returned'}`);
                                    // Don't clear yet — let the deferred timeout handle it
                                } else {
                                    console.log(`[Diag:Auth] ACTIVE_REFRESH_OK userId=${data.session.user.id} — onAuthStateChange will fire`);
                                    // onAuthStateChange will fire SIGNED_IN or TOKEN_REFRESHED,
                                    // which cancels the deferred logout automatically
                                }
                            });

                            deferredLogoutRef.current = setTimeout(() => {
                                if (!mounted) return;
                                console.error(`[Diag:Auth] DEFERRED_LOGOUT — no valid session arrived within ${DEFERRED_LOGOUT_MS}ms, clearing auth state`);
                                setSession(null);
                                setUser(null);
                                setRole(null);
                                setProfile(null);
                                setPermissions([]);
                                setProfileLoaded(false);
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
                        setProfileLoaded(false);
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
                        setProfileLoaded(true); // Cache hit = role is known
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

                    // ── Background: fetch fresh profile with timeout + retry ──
                    // Abort any in-flight profile fetch from a previous event (deduplication)
                    if (profileAbortRef.current) {
                        profileAbortRef.current.abort();
                        console.log(`[Diag:Auth] PROFILE_FETCH_DEDUP — aborted previous in-flight fetch`);
                    }

                    const profileController = new AbortController();
                    profileAbortRef.current = profileController;
                    console.log(`[Diag:Auth] PROFILE_FETCH_START mounted=${mounted} userId=${currentSession.user.id}`);

                    // Fire connection health check in background (non-blocking diagnostic)
                    SupabaseConnectionMonitor.checkConnectionHealth()
                        .then(h => console.log(`[Diag:Auth] CONN_HEALTH healthy=${h.isHealthy} latency=${h.latency.toFixed(1)}ms`))
                        .catch(e => console.error(`[Diag:Auth] CONN_HEALTH_FAILED err=${e instanceof Error ? e.message : e}`));

                    // Helper: fetch profile with Promise.race timeout
                    // AbortSignal alone doesn't reliably abort on stale TCP connections after device sleep
                    const PROFILE_TIMEOUT_MS = 7_000;
                    const fetchProfileWithTimeout = async (attempt: number) => {
                        const _tStart = performance.now();
                        const timeoutPromise = new Promise<never>((_, reject) => {
                            setTimeout(() => reject(new Error(`Profile fetch timed out after ${PROFILE_TIMEOUT_MS}ms`)), PROFILE_TIMEOUT_MS);
                        });

                        const queryPromise = supabase
                            .from('user_profiles')
                            .select('*')
                            .eq('id', currentSession.user.id)
                            .single();

                        const result = await Promise.race([queryPromise, timeoutPromise]);
                        const queryMs = performance.now() - _tStart;
                        console.log(`[Diag:Auth] PROFILE_FETCH_DONE attempt=${attempt} mounted=${mounted} hasData=${!!result.data} error=${result.error?.message ?? 'none'} queryMs=${queryMs.toFixed(1)}ms`);
                        return result;
                    };

                    try {
                        let profileResult: { data: any; error: any };

                        try {
                            profileResult = await fetchProfileWithTimeout(1);
                        } catch (firstErr) {
                            // First attempt timed out — connection likely stale after sleep.
                            // Force a fresh connection by calling refreshSession (GoTrue uses separate endpoint),
                            // then retry the profile fetch once.
                            console.warn(`[Diag:Auth] PROFILE_ATTEMPT_1_FAILED err=${firstErr instanceof Error ? firstErr.message : firstErr} — retrying with fresh connection`);

                            // refreshSession forces a new HTTP request to GoTrue, which can
                            // wake up the browser's network stack for subsequent PostgREST calls
                            await supabase.auth.refreshSession();
                            console.log(`[Diag:Auth] PROFILE_RETRY — refreshed session, retrying profile fetch`);

                            profileResult = await fetchProfileWithTimeout(2);
                        }

                        if (profileController.signal.aborted) {
                            // This fetch was superseded by a newer auth event — discard
                            return;
                        }

                        const profileData = profileResult.data;

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
                                setProfileLoaded(true);
                            }
                            console.log(`[Diag:Auth] PROFILE_OK role=${finalRole} elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms`);
                        } else if (mounted) {
                            setProfileLoaded(true); // Mark as loaded even if no data (genuine issue)
                        }
                    } catch (profileErr) {
                        if (profileController.signal.aborted) {
                            // Superseded by newer auth event — silently ignore
                        } else {
                            console.error(`[Diag:Auth] PROFILE_ERR mounted=${mounted} elapsed=${(performance.now() - _tAuthInit).toFixed(1)}ms:`, profileErr);
                            if (mounted) {
                                setProfileLoaded(true); // Mark loaded so PageGuard can show retry
                            }
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
                    setProfileLoaded(false);
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
            clearTimeout(authInitTimeout);
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
                profileLoaded,
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
