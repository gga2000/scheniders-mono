import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import type { AdminRole } from "@/types/admin";
import { nextAccess, type AccessCheck, type KnownAccess } from "./admin-access";

/** What the console shows for the session, after one answer. */
export type SessionView<Profile> =
  | { kind: "signed_out" }
  /** The person's staff row answered "no": this browser is being signed out. */
  | { kind: "no_access" }
  | {
      kind: "signed_in";
      user: User;
      /** Null while the staff row could not be read and no role is known. */
      role: AdminRole | null;
      profile: Profile | null;
      /** The read failed for a known person: keep the profile already shown. */
      keepProfile: boolean;
      checkFailed: boolean;
    };

/** The parts of the browser's Supabase client the watch uses. */
export interface SessionSource<Profile> {
  /** Calls `listener` on each auth event, the stored session first; returns the way to stop. */
  onAuthStateChange(listener: (event: AuthChangeEvent, session: Session | null) => void): () => void;
  /** Signs out this browser only: the person's other sessions are not ours. */
  signOutHere(): Promise<unknown>;
  readAccess(userId: string): Promise<AccessCheck>;
  readProfile(userId: string): Promise<Profile | null>;
  /**
   * Drops what this tab keeps in memory for the person signed in before (read
   * pages, stars). Called when someone else signs in, before their first read.
   */
  forgetPerson(): void;
  /**
   * Takes the page to the login page, which says this login has no console
   * access. Called after the sign-out here: the browser then holds no session,
   * so a reload would reach the login page with no reason.
   */
  leaveNoAccess(): void;
}

/**
 * Follows the signed-in session and the person's console access (#1285). A
 * failed read of the staff row is not "no access": it keeps the role already
 * known for that person, and only a row that answers "no" signs out, this
 * browser only, and then leaves for the login page with the reason. A new
 * token is not read again, since it changes nobody's access and the server
 * checks every request. Only the newest answer counts, and a sign-out drops
 * any answer still on its way. Returns the way to stop.
 */
export function watchAdminSession<Profile>(
  source: SessionSource<Profile>,
  show: (view: SessionView<Profile>) => void,
): () => void {
  let stopped = false;
  let newest = 0;
  // The role last read, and whose, so a failed read keeps it for that person only.
  let known: KnownAccess | null = null;
  // The last person signed in on this tab. A sign-out keeps it: the next
  // person to sign in here must not be shown what this tab read for them.
  let lastPerson: string | null = null;

  const signedOut = () => {
    newest += 1;
    known = null;
    show({ kind: "signed_out" });
  };

  async function readSession(user: User) {
    const call = ++newest;
    const [check, profile] = await Promise.all([source.readAccess(user.id), source.readProfile(user.id)]);
    if (stopped || call !== newest) return;

    const step = nextAccess(check, known, user.id);
    if (step.kind === "sign_out") {
      known = null;
      show({ kind: "no_access" });
      await source.signOutHere();
      if (!stopped) source.leaveNoAccess();
      return;
    }
    const role = step.kind === "unknown" ? null : step.role;
    known = role ? { userId: user.id, role } : null;
    show({ kind: "signed_in", user, role, profile, keepProfile: step.kind === "keep", checkFailed: step.kind === "unknown" });
  }

  const stopListening = source.onAuthStateChange((event, session) => {
    if (stopped) return;
    if (event === "TOKEN_REFRESHED") return;
    if (event === "SIGNED_OUT" || !session?.user) {
      signedOut();
      return;
    }
    if (lastPerson !== null && lastPerson !== session.user.id) source.forgetPerson();
    lastPerson = session.user.id;
    void readSession(session.user);
  });

  return () => {
    stopped = true;
    stopListening();
  };
}
