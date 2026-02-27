"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { activityLogger } from "@/lib/activity-logger";
import type { UserProfile, AuthContextType } from "@/types/auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null); // Added state
    const [permissions, setPermissions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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

    // Initialize auth state
    useEffect(() => {
        const initAuth = async () => {
            try {
                // Get initial session
                const { data: { session: initialSession } } = await supabase.auth.getSession();
                setSession(initialSession);
                setUser(initialSession?.user ?? null);

                if (initialSession?.user) {
                    await fetchRoleAndPermissions(initialSession.user.id);
                }
            } catch (error) {
                console.error("Auth initialization error:", error);
            } finally {
                setIsLoading(false);
            }
        };

        initAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, currentSession) => {

                setSession(currentSession);
                setUser(currentSession?.user ?? null);

                if (currentSession?.user) {
                    // Only fetch if user changed or just signed in
                    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {

                        await fetchRoleAndPermissions(currentSession.user.id);


                        if (event === 'SIGNED_IN') {
                            // Fire-and-forget: Don't block auth flow with activity logging

                            (async () => {
                                try {
                                    // Update last_login_at
                                    await supabase.from('user_profiles').update({
                                        last_login_at: new Date().toISOString()
                                    }).eq('id', currentSession.user.id);

                                    // Log activity (non-blocking)
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
                        // Fallback if role missing
                        await fetchRoleAndPermissions(currentSession.user.id);
                    }
                } else {
                    setRole(null);
                    setProfile(null);
                    setPermissions([]);
                }

                setIsLoading(false);

                if (event === "SIGNED_OUT") {
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
