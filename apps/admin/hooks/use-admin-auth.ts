"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  createElement,
  type ReactNode,
} from "react";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import type { AdminRole } from "@/types/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The signed-in user's display fields, sourced from `user_profiles`. */
interface AdminProfile {
  display_name: string | null;
  avatar_url: string | null;
}

interface AdminAuthState {
  user: User | null;
  role: AdminRole | null;
  profile: AdminProfile | null;
  isLoading: boolean;
  error: string | null;
}

interface AdminAuthContextValue extends AdminAuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_ROLES: AdminRole[] = ["super_admin", "support_staff"];

/**
 * Create a browser-side Supabase client (anon key) for auth operations.
 * This is created once per provider mount.
 */
function makeBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // During SSG/build, env vars may not be available — return a dummy
    // that won't be used (the provider only runs on the client).
    return null as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(url, key);
}

/**
 * Resolve the signed-in user's admin-console role from the dedicated
 * `admin_users` table (decoupled from the main app's user_profiles.role).
 * Reads the user's own row via their session — the `admin_users_read_own`
 * RLS policy permits exactly that. Returns null when there's no active admin
 * row or the role isn't allowed.
 */
async function fetchAdminRole(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createBrowserClient<any>>
): Promise<AdminRole | null> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("admin_role, is_active")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  if (row.is_active !== true) return null;

  const role = row.admin_role as string;
  return ALLOWED_ROLES.includes(role as AdminRole) ? (role as AdminRole) : null;
}

/**
 * Fetch the signed-in user's own profile (name + avatar) from `user_profiles`.
 * The `user_read_own_profile` RLS policy (`id = auth.uid()`) permits this read.
 * Returns null if the row is missing or unreadable — callers fall back to the
 * email initial.
 */
async function fetchProfile(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createBrowserClient<any>>
): Promise<AdminProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  return {
    display_name: (row.display_name as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable reference — created once
  const [supabase] = useState(makeBrowserClient);

  // ── Bootstrap: check existing session & subscribe to auth changes ──
  useEffect(() => {
    let mounted = true;

    async function handleSession(sessionUser: User | null) {
      if (!sessionUser) {
        setUser(null);
        setRole(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const [adminRole, profileRow] = await Promise.all([
        fetchAdminRole(sessionUser.id, supabase),
        fetchProfile(sessionUser.id, supabase),
      ]);

      if (!mounted) return;

      if (!adminRole) {
        // Not an admin — sign them out
        setError("You do not have admin access.");
        await supabase.auth.signOut();
        setUser(null);
        setRole(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setUser(sessionUser);
      setRole(adminRole);
      setProfile(profileRow);
      setError(null);
      setIsLoading(false);
    }

    // 1. Check for an existing session
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      if (mounted) handleSession(session?.user ?? null);
    });

    // 2. Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return;
      if (_event === "SIGNED_OUT") {
        setUser(null);
        setRole(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }
      if (session?.user) {
        handleSession(session.user);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // ── Auth actions ──
  const signIn = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      setError(null);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setIsLoading(false);
        setError(signInError.message);
        return { error: signInError.message };
      }
      // onAuthStateChange will handle the rest
      return { error: null };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setProfile(null);
    setError(null);
    setIsLoading(false);
  }, [supabase]);

  const value: AdminAuthContextValue = {
    user,
    role,
    profile,
    isLoading,
    error,
    signIn,
    signOut,
  };

  return createElement(AdminAuthContext.Provider, { value }, children);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  }
  return context;
}
