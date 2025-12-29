"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

// =============================================
// TYPES
// =============================================

export type UserRole = "admin" | "employee" | "viewer";

export interface UserProfile {
    id: string;
    email: string;
    display_name: string | null;
    role: UserRole;
    avatar_url: string | null;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface AuthState {
    user: User | null;
    profile: UserProfile | null;
    session: Session | null;
    loading: boolean;
    error: string | null;
}

export interface AuthContextType extends AuthState {
    signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    signUp: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    isAdmin: boolean;
    isEmployee: boolean;
    isViewer: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canManageTeam: boolean;
}

// =============================================
// CONTEXT
// =============================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// =============================================
// PROVIDER COMPONENT
// =============================================

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        user: null,
        profile: null,
        session: null,
        loading: true,
        error: null,
    });

    // Fetch user profile from database
    const fetchProfile = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from("user_profiles")
                .select("*")
                .eq("id", userId)
                .single();

            if (error) {
                console.error("Error fetching profile:", error);
                return null;
            }

            return data as UserProfile;
        } catch (err) {
            console.error("Error in fetchProfile:", err);
            return null;
        }
    }, []);

    // Update last login timestamp
    const updateLastLogin = useCallback(async (userId: string) => {
        try {
            await supabase
                .from("user_profiles")
                .update({ last_login_at: new Date().toISOString() })
                .eq("id", userId);
        } catch (err) {
            console.error("Error updating last login:", err);
        }
    }, []);

    // Initialize auth state
    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                // Get current session
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error("Error getting session:", error);
                    if (mounted) {
                        setState(prev => ({ ...prev, loading: false, error: error.message }));
                    }
                    return;
                }

                if (session?.user) {
                    const profile = await fetchProfile(session.user.id);
                    if (mounted) {
                        setState({
                            user: session.user,
                            profile,
                            session,
                            loading: false,
                            error: null,
                        });
                    }
                } else {
                    if (mounted) {
                        setState({
                            user: null,
                            profile: null,
                            session: null,
                            loading: false,
                            error: null,
                        });
                    }
                }
            } catch (err) {
                console.error("Error initializing auth:", err);
                if (mounted) {
                    setState(prev => ({
                        ...prev,
                        loading: false,
                        error: err instanceof Error ? err.message : "Unknown error",
                    }));
                }
            }
        };

        initAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log("[Auth] State change:", event);

                if (session?.user) {
                    const profile = await fetchProfile(session.user.id);

                    // Update last login on sign in
                    if (event === "SIGNED_IN") {
                        await updateLastLogin(session.user.id);
                    }

                    if (mounted) {
                        setState({
                            user: session.user,
                            profile,
                            session,
                            loading: false,
                            error: null,
                        });
                    }
                } else {
                    if (mounted) {
                        setState({
                            user: null,
                            profile: null,
                            session: null,
                            loading: false,
                            error: null,
                        });
                    }
                }
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [fetchProfile, updateLastLogin]);

    // Sign in with email/password
    const signIn = async (email: string, password: string) => {
        try {
            setState(prev => ({ ...prev, loading: true, error: null }));

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setState(prev => ({ ...prev, loading: false, error: error.message }));
                return { success: false, error: error.message };
            }

            if (data.user) {
                const profile = await fetchProfile(data.user.id);

                // Check if user is active
                if (profile && !profile.is_active) {
                    await supabase.auth.signOut();
                    const errorMsg = "حسابك غير نشط. يرجى التواصل مع المسؤول.";
                    setState(prev => ({ ...prev, loading: false, error: errorMsg }));
                    return { success: false, error: errorMsg };
                }

                await updateLastLogin(data.user.id);

                setState({
                    user: data.user,
                    profile,
                    session: data.session,
                    loading: false,
                    error: null,
                });
            }

            return { success: true };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "حدث خطأ أثناء تسجيل الدخول";
            setState(prev => ({ ...prev, loading: false, error: errorMsg }));
            return { success: false, error: errorMsg };
        }
    };

    // Sign up new user
    const signUp = async (email: string, password: string, displayName?: string) => {
        try {
            setState(prev => ({ ...prev, loading: true, error: null }));

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        display_name: displayName || email.split("@")[0],
                        role: "employee", // Default role
                    },
                },
            });

            if (error) {
                setState(prev => ({ ...prev, loading: false, error: error.message }));
                return { success: false, error: error.message };
            }

            // Profile is auto-created by database trigger
            setState(prev => ({ ...prev, loading: false }));
            return { success: true };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "حدث خطأ أثناء إنشاء الحساب";
            setState(prev => ({ ...prev, loading: false, error: errorMsg }));
            return { success: false, error: errorMsg };
        }
    };

    // Sign out
    const signOut = async () => {
        try {
            await supabase.auth.signOut();
            setState({
                user: null,
                profile: null,
                session: null,
                loading: false,
                error: null,
            });
        } catch (err) {
            console.error("Error signing out:", err);
        }
    };

    // Refresh profile data
    const refreshProfile = async () => {
        if (state.user) {
            const profile = await fetchProfile(state.user.id);
            setState(prev => ({ ...prev, profile }));
        }
    };

    // Role-based permissions
    const isAdmin = state.profile?.role === "admin";
    const isEmployee = state.profile?.role === "employee";
    const isViewer = state.profile?.role === "viewer";

    // Permission helpers
    const canEdit = isAdmin || isEmployee; // Viewers can't edit
    const canDelete = isAdmin; // Only admins can delete
    const canManageTeam = isAdmin; // Only admins can manage team

    const value: AuthContextType = {
        ...state,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        isAdmin,
        isEmployee,
        isViewer,
        canEdit,
        canDelete,
        canManageTeam,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// =============================================
// HOOK
// =============================================

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}

// =============================================
// PROTECTED ROUTE COMPONENT
// =============================================

interface ProtectedRouteProps {
    children: ReactNode;
    requiredRole?: UserRole | UserRole[];
    fallback?: ReactNode;
}

export function ProtectedRoute({
    children,
    requiredRole,
    fallback,
}: ProtectedRouteProps) {
    const { user, profile, loading } = useAuth();

    // Show loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    // Not logged in - redirect to login
    if (!user) {
        if (typeof window !== "undefined") {
            window.location.href = "/login";
        }
        return fallback || null;
    }

    // Check role requirement
    if (requiredRole && profile) {
        const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

        // Admin has access to everything
        if (profile.role !== "admin" && !allowedRoles.includes(profile.role)) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-destructive mb-2">
                            غير مصرح
                        </h1>
                        <p className="text-muted-foreground">
                            ليس لديك صلاحية للوصول إلى هذه الصفحة
                        </p>
                    </div>
                </div>
            );
        }
    }

    return <>{children}</>;
}
