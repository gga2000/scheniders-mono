import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessCheck } from "./admin-access";
import { watchAdminSession, type SessionView } from "./admin-session-watch";

/*
 * #1285: the browser took a failed read of the person's staff row for "no
 * access" and signed them out of every device; a blip at the hourly token
 * refresh was enough. These tests drive the watch the console's sign-in
 * provider runs, with the auth events Supabase sends.
 */

type Listener = (event: AuthChangeEvent, session: Session | null) => void;

const user = (id: string) => ({ id }) as User;
const session = (id: string) => ({ user: user(id) }) as Session;

/** A read that answers when the test says so. */
function later<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (answer = resolve));
  return { promise, answer };
}

let listener: Listener;
let views: SessionView<string>[];
let reads: string[];
let access: (userId: string) => Promise<AccessCheck>;
let signOutHere: ReturnType<typeof vi.fn>;
let forgetPerson: ReturnType<typeof vi.fn>;
/** What the watch asked of the page, in order: "signed out here", "left". */
let steps: string[];
let unsubscribe: ReturnType<typeof vi.fn>;
let stop: () => void;

const start = () => {
  stop = watchAdminSession<string>(
    {
      onAuthStateChange: (l) => {
        listener = l;
        return unsubscribe;
      },
      signOutHere,
      readAccess: (userId) => {
        reads.push(userId);
        return access(userId);
      },
      readProfile: async (userId) => `profile of ${userId}`,
      forgetPerson: () => {
        forgetPerson(reads.length);
      },
      leaveNoAccess: () => {
        steps.push("left");
      },
    },
    (view) => views.push(view),
  );
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const last = () => views.at(-1);

beforeEach(() => {
  views = [];
  reads = [];
  access = async () => ({ kind: "role", role: "support_staff" });
  steps = [];
  signOutHere = vi.fn(async () => {
    steps.push("signed out here");
  });
  forgetPerson = vi.fn();
  unsubscribe = vi.fn();
  start();
});

describe("the console's sign-in watch", () => {
  it("reads the stored session once and shows the person with their role", async () => {
    listener("INITIAL_SESSION", session("u1"));
    await settle();

    expect(reads).toEqual(["u1"]);
    expect(last()).toMatchObject({ kind: "signed_in", role: "support_staff", profile: "profile of u1", checkFailed: false });
  });

  it("does not read the staff row again when the token is refreshed", async () => {
    listener("INITIAL_SESSION", session("u1"));
    await settle();
    listener("TOKEN_REFRESHED", session("u1"));
    await settle();

    expect(reads).toEqual(["u1"]);
    expect(views).toHaveLength(1);
  });

  it("keeps the known role and signs nobody out when a later read fails", async () => {
    listener("INITIAL_SESSION", session("u1"));
    await settle();
    access = async () => ({ kind: "failed" });
    listener("USER_UPDATED", session("u1"));
    await settle();

    expect(last()).toMatchObject({ kind: "signed_in", role: "support_staff", keepProfile: true, checkFailed: false });
    expect(signOutHere).not.toHaveBeenCalled();
  });

  it("shows the person with no role, and signs nobody out, when the first read fails", async () => {
    access = async () => ({ kind: "failed" });
    listener("INITIAL_SESSION", session("u1"));
    await settle();

    expect(last()).toMatchObject({ kind: "signed_in", role: null, checkFailed: true });
    expect(signOutHere).not.toHaveBeenCalled();
  });

  it("does not lend one person's role to another after a failed read", async () => {
    listener("INITIAL_SESSION", session("u1"));
    await settle();
    access = async () => ({ kind: "failed" });
    listener("SIGNED_IN", session("u2"));
    await settle();

    expect(last()).toMatchObject({ kind: "signed_in", role: null, checkFailed: true });
  });

  it("signs out this browser only when the staff row answers no", async () => {
    access = async () => ({ kind: "none" });
    listener("INITIAL_SESSION", session("u1"));
    await settle();

    expect(last()).toEqual({ kind: "no_access" });
    expect(signOutHere).toHaveBeenCalledTimes(1);
  });

  /*
   * Round 16 (ux new 4): a role removed while the tab was away. On its return,
   * the browser read "no row" and signed out, and a reload then reached the
   * login page signed out, with no reason.
   */
  it("leaves for the login page with the reason, after the sign-out here", async () => {
    access = async () => ({ kind: "none" });
    listener("SIGNED_IN", session("u1"));
    await settle();

    expect(steps).toEqual(["signed out here", "left"]);
  });

  it("does not leave when the page closed the watch during the sign-out", async () => {
    access = async () => ({ kind: "none" });
    const signingOut = later<undefined>();
    signOutHere = vi.fn(() => signingOut.promise);
    stop();
    start();
    listener("INITIAL_SESSION", session("u1"));
    await settle();
    stop();
    signingOut.answer(undefined);
    await settle();

    expect(steps).toEqual([]);
  });

  it("does not leave while the staff row only could not be read", async () => {
    access = async () => ({ kind: "failed" });
    listener("INITIAL_SESSION", session("u1"));
    await settle();

    expect(steps).toEqual([]);
  });

  it("lets only the newest answer count when answers come back out of order", async () => {
    const slow = later<AccessCheck>();
    access = () => slow.promise;
    listener("INITIAL_SESSION", session("u1"));
    access = async () => ({ kind: "role", role: "super_admin" });
    listener("SIGNED_IN", session("u1"));
    await settle();
    slow.answer({ kind: "none" });
    await settle();

    expect(last()).toMatchObject({ kind: "signed_in", role: "super_admin" });
    expect(signOutHere).not.toHaveBeenCalled();
  });

  it("drops an answer still on its way when the person signs out", async () => {
    const slow = later<AccessCheck>();
    access = () => slow.promise;
    listener("INITIAL_SESSION", session("u1"));
    listener("SIGNED_OUT", null);
    slow.answer({ kind: "role", role: "super_admin" });
    await settle();

    expect(last()).toEqual({ kind: "signed_out" });
  });

  it("shows nothing more and stops listening once stopped", async () => {
    const slow = later<AccessCheck>();
    access = () => slow.promise;
    listener("INITIAL_SESSION", session("u1"));
    stop();
    slow.answer({ kind: "role", role: "super_admin" });
    await settle();
    listener("SIGNED_OUT", null);

    expect(views).toEqual([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  /*
   * Signing out kept what the tab had read in memory. The next person to sign
   * in on it saw the last person's pages until each was read again, and the
   * last person's stars went to the next one's watch list with their first
   * star.
   */
  it("forgets the last person's data when someone else signs in, before reading theirs", async () => {
    listener("INITIAL_SESSION", session("u1"));
    await settle();
    listener("SIGNED_OUT", null);
    listener("SIGNED_IN", session("u2"));
    await settle();

    expect(forgetPerson).toHaveBeenCalledTimes(1);
    // Called with the reads made so far: u1's only, so before u2's first read.
    expect(forgetPerson).toHaveBeenCalledWith(1);
    expect(last()).toMatchObject({ kind: "signed_in", user: { id: "u2" } });
  });

  it("keeps it for the first session and when the same person signs in again", async () => {
    listener("INITIAL_SESSION", session("u1"));
    await settle();
    listener("SIGNED_OUT", null);
    listener("SIGNED_IN", session("u1"));
    await settle();

    expect(forgetPerson).not.toHaveBeenCalled();
  });
});
