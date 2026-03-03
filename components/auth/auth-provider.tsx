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

    // Initialize auth state
    useEffect(() => {
        const initAuth = async () => {
            const t0 = performance.now();
            console.log(`[initAuth] started at ${Math.round(t0)}ms`);
            try {
                // Get initial session
                const { data: { session: initialSession } } = await supabase.auth.getSession();
                const t1 = performance.now();
                console.log(`[initAuth] getSession took ${Math.round(t1 - t0)}ms, session=${initialSession ? 'YES' : 'NULL'}`);

                setSession(initialSession);
                setUser(initialSession?.user ?? null);

                if (initialSession?.user) {
                    await fetchRoleAndPermissions(initialSession.user.id);
                    const t2 = performance.now();
                    console.log(`[initAuth] fetchRoleAndPermissions took ${Math.round(t2 - t1)}ms`);
                }
            } catch (error) {
                console.error("Auth initialization error:", error);
            } finally {
                setIsLoading(false);
                console.log(`[initAuth] complete, isLoading=false, total=${Math.round(performance.now() - t0)}ms`);
            }
        };

        initAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, currentSession) => {
                // TOKEN_REFRESHED fires frequently (every ~hour) and the user/session
                // objects have new references but the same user ID. Calling setSession/
                // setUser here would re-render the ENTIRE app tree for no reason.
                // Only update state when the actual user identity changes.
                if (event === "TOKEN_REFRESHED") {
                    // Silently accept the refreshed session — Supabase SDK
                    // already updates its internal state. No React re-render needed.
                    return;
                }

                setSession(currentSession);
                setUser(currentSession?.user ?? null);
                currentUserIdRef.current = currentSession?.user?.id ?? null;

                if (currentSession?.user) {
                    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                        await fetchRoleAndPermissions(currentSession.user.id);

                        if (event === 'SIGNED_IN') {
                            // Fire-and-forget: Don't block auth flow with activity logging
                            (async () => {
                                try {
                                    await supabase.from('user_profiles').update({
                                        last_login_at: new Date().toISOString()
                                    }).eq('id', currentSession.user.id);

                                    activityLogger.log({
                                        action: "user.login",
                                        entityType: "user",
                                        entityId: currentSession.user.id
                                    });
                                } catch (err) {
                                    console.error("Error logging login:", err);
                                }
                            })();
                        }
                    } else if (!role) {
                        await fetchRoleAndPermissions(currentSession.user.id);
                    }
                } else {
                    setRole(null);
                    setProfile(null);
                    setPermissions([]);
                }

                setIsLoading(false);

                if (event === "SIGNED_OUT") {
                    currentUserIdRef.current = null;
                    setUser(null);
                    setSession(null);
                    setRole(null);
                    setProfile(null);
                    setPermissions([]);
                }
            }
        );

        return () => {
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
