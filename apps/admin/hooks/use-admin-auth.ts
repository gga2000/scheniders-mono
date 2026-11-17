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
import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminAction, AdminRole } from "@/types/admin";
import { hasPermission } from "@/lib/admin-permissions";
import { readAccessCheck, type AccessCheck } from "@/lib/admin-access";
import { watchAdminSession } from "@/lib/admin-session-watch";
import { useAdminStore } from "@/store/use-admin-store";

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
  /**
   * The read of the person's own staff row failed and no role is known yet,
   * so controls that need a role are hidden. Not the same as "no access".
   */
  accessCheckFailed: boolean;
}

interface AdminAuthContextValue extends AdminAuthState {
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Reads the person's staff row again after a failed read. */
  recheckAccess: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * The signed-in person's admin-console role from the dedicated `admin_users`
 * table (decoupled from the main app's user_profiles.role). Reads the user's
 * own row via their session; the `admin_users_read_own` RLS policy permits
 * exactly that. A failed read is its own answer (lib/admin-access).
 */
async function fetchAccessCheck(
  userId: string,
  supabase: ReturnType<typeof makeBrowserClient>
): Promise<AccessCheck> {
  const result = await supabase
    .from("admin_users")
    .select("admin_role, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  return readAccessCheck(result);
}

/**
 * Fetch the signed-in user's own profile (name + avatar) from `user_profiles`.
 * The `user_read_own_profile` RLS policy (`id = auth.uid()`) permits this read.
 * Returns null if the row is missing or unreadable — callers fall back to the
 * email initial.
 */
async function fetchProfile(
  userId: string,
  supabase: ReturnType<typeof makeBrowserClient>
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
  const [accessCheckFailed, setAccessCheckFailed] = useState(false);
  // Bumped by "Try again": the session is read and checked once more.
  const [recheckCount, setRecheckCount] = useState(0);

  // Stable reference — created once
  const [supabase] = useState(makeBrowserClient);
  const queryClient = useQueryClient();

  // ── Bootstrap: follow the session and the person's access (lib/admin-session-watch) ──
  useEffect(
    () =>
      watchAdminSession<AdminProfile>(
        {
          onAuthStateChange: (listener) => {
            const {
              data: { subscription },
            } = supabase.auth.onAuthStateChange(listener);
            return () => subscription.unsubscribe();
          },
          signOutHere: () => supabase.auth.signOut({ scope: "local" }),
          readAccess: (userId) => fetchAccessCheck(userId, supabase),
          readProfile: (userId) => fetchProfile(userId, supabase),
          forgetPerson: () => {
            queryClient.clear();
            useAdminStore.setState({ starredMerchants: [] });
          },
        },
        (view) => {
          if (view.kind === "signed_in") {
            setUser(view.user);
            setRole(view.role);
            setProfile((previous) => view.profile ?? (view.keepProfile ? previous : null));
            setAccessCheckFailed(view.checkFailed);
            setError(null);
            setIsLoading(false);
            return;
          }
          if (view.kind === "no_access") setError("You do not have admin access.");
          setUser(null);
          setRole(null);
          setProfile(null);
          setAccessCheckFailed(false);
          setIsLoading(false);
        },
      ),
    [supabase, recheckCount, queryClient],
  );

  const recheckAccess = useCallback(() => setRecheckCount((n) => n + 1), []);

  // ── Auth actions ──
  const signIn = useCallback(
    async (email: string, password: string, captchaToken?: string) => {
      setIsLoading(true);
      setError(null);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
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
    setAccessCheckFailed(false);
    setIsLoading(false);
  }, [supabase]);

  const value: AdminAuthContextValue = {
    user,
    role,
    profile,
    isLoading,
    error,
    accessCheckFailed,
    signIn,
    signOut,
    recheckAccess,
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

/**
 * Whether the signed-in person's role may do `action` (lib/admin-permissions),
 * and false until the role is known. Screens use it to leave out a control
 * the server would refuse with a 403.
 */
export function useCan(): (action: AdminAction) => boolean {
  const { role } = useAdminAuth();
  return useCallback((action: AdminAction) => (role ? hasPermission(role, action) : false), [role]);
}
