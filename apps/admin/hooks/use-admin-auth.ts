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
import type { AdminAction, AdminRole } from "@/types/admin";
import { hasPermission } from "@/lib/admin-permissions";
import { nextAccess, readAccessCheck, type AccessCheck, type KnownAccess } from "@/lib/admin-access";

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

  // ── Bootstrap: check the session & subscribe to auth changes ──
  useEffect(() => {
    let mounted = true;
    // Answers can come back out of order; only the newest one counts.
    let newest = 0;
    // The role last read, and whose, so a failed read keeps it for that person only.
    let known: KnownAccess | null = null;

    function clear() {
      known = null;
      setUser(null);
      setRole(null);
      setProfile(null);
      setAccessCheckFailed(false);
      setIsLoading(false);
    }

    async function handleSession(sessionUser: User | null) {
      const call = ++newest;
      if (!sessionUser) {
        clear();
        return;
      }

      const [check, profileRow] = await Promise.all([
        fetchAccessCheck(sessionUser.id, supabase),
        fetchProfile(sessionUser.id, supabase),
      ]);

      if (!mounted || call !== newest) return;

      const step = nextAccess(check, known, sessionUser.id);
      if (step.kind === "sign_out") {
        // The row answered: this login has no console access. Only this
        // browser is signed out; the person's other sessions are not ours.
        setError("You do not have admin access.");
        await supabase.auth.signOut({ scope: "local" });
        clear();
        return;
      }

      const nextRole = step.kind === "unknown" ? null : step.role;
      known = nextRole ? { userId: sessionUser.id, role: nextRole } : null;
      setUser(sessionUser);
      setRole(nextRole);
      setProfile((previous) => profileRow ?? (step.kind === "keep" ? previous : null));
      setAccessCheckFailed(step.kind === "unknown");
      setError(null);
      setIsLoading(false);
    }

    // The first event is INITIAL_SESSION, with the stored session or none, so
    // the session is read once here and not again through getSession().
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        clear();
        return;
      }
      // A new token changes nobody's access, and the server checks access on
      // every request. Reading the row at each hourly refresh only gave a
      // blip one more chance to look like "no access".
      if (event === "TOKEN_REFRESHED") return;
      handleSession(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, recheckCount]);

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
