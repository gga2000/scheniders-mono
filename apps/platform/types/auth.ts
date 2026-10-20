// =============================================
// AUTH DOMAIN TYPES
// =============================================

import type { User, Session, AuthError } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/permissions";

export interface UserProfile {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    avatar_url: string | null;
    is_active?: boolean;
    last_login_at?: string | null;
    current_tenant_id?: string | null;
}

export interface AuthContextType {
    user: User | null;
    session: Session | null;
    /**
     * The user's role in the current tenant (`tenant_members.role`), or
     * `super_admin` for platform staff; null when they have no active
     * membership there. `profile.role` is the global column and must not be
     * used for authorization.
     */
    role: UserRole | null;
    profile: UserProfile | null;
    /** `role_permissions` for `role`, with the user's `user_permissions` overrides applied. */
    permissions: string[];
    tenantId: string | null;
    isLoading: boolean;
    profileLoaded: boolean;
    profileMissing: boolean; // signed in, but no user_profiles row (unprovisioned / not invited)
    clientReady: boolean; // Supabase client's internal session ready (not just React state)
    signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
    updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
    signInWithGoogle: (returnTo?: string) => Promise<{ error: AuthError | null }>;
    linkGoogle: () => Promise<{ error: AuthError | null }>;
    googleLinked: boolean;
    refreshProfile: () => Promise<void>;
    retryAuth: () => Promise<{ error: any }>;
}
