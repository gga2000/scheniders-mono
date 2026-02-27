// =============================================
// AUTH DOMAIN TYPES
// =============================================

import type { User, Session, AuthError } from "@supabase/supabase-js";

export interface UserProfile {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    avatar_url: string | null;
    is_active?: boolean;
    last_login_at?: string | null;
}

export interface AuthContextType {
    user: User | null;
    session: Session | null;
    role: string | null;
    profile: UserProfile | null;
    permissions: string[];
    isLoading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
    updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
    refreshProfile: () => Promise<void>;
}
