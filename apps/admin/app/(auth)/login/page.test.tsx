// @vitest-environment jsdom
// The login page after the console ended a sign-in (staff console audit,
// round 13). It says why staff are there, and does not send a sign-in it was
// sent away for back into the console, where it would be sent here again.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ user: auth.user, signIn: vi.fn(), isLoading: false }),
}));
/** The props of the security check box, and how many times it was mounted. */
const captcha = vi.hoisted(() => ({
  mounts: 0,
  props: null as { onToken: (token: string | null) => void; onFailure?: () => void } | null,
}));
vi.mock("@scheniders/ui/turnstile", async () => {
  const { useEffect } = await import("react");
  return {
    TurnstileBox: (props: { onToken: (token: string | null) => void; onFailure?: () => void }) => {
      captcha.props = props;
      useEffect(() => {
        captcha.mounts += 1;
      }, []);
      return null;
    },
  };
});

import LoginPage from "./page";

function open(address: string, user: { id: string } | null) {
  window.history.replaceState(null, "", address);
  auth.user = user;
  return render(createElement(LoginPage));
}

afterEach(() => {
  cleanup();
  push.mockClear();
  captcha.mounts = 0;
});

describe("the login page", () => {
  it("says the sign-in ended, and does not send it back to the console", () => {
    open("/login?error=expired", { id: "u1" });
    expect(screen.getByRole("alert").textContent).toBe("Your sign-in ended after 16 hours. Sign in again.");
    expect(push).not.toHaveBeenCalled();
    // Round 14: the card is white in both themes; the dark theme's red on it was 1.76:1.
    expect(screen.getByRole("alert").className).not.toMatch(/var\(--/);
  });

  it("says when a login has no access to the console", () => {
    open("/login?error=forbidden", null);
    expect(screen.getByRole("alert").textContent).toBe("This login has no access to the staff console.");
  });

  it("sends someone already signed in on to the console, and says nothing", () => {
    open("/login", { id: "u1" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(push).toHaveBeenCalledWith("/");
  });

  it("ignores a reason it does not know", () => {
    open("/login?error=constructor", null);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Round 14 (Workflow new 3): a failed security check left Sign in grey
  // with no word.
  it("says when the security check fails, and runs it again on Try again", () => {
    open("/login", null);
    expect(captcha.mounts).toBe(1);
    act(() => captcha.props?.onFailure?.());
    expect(screen.getByRole("alert").textContent).toContain("The security check did not finish, so Sign in is off.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(captcha.mounts).toBe(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drops the security check line once a check passes", () => {
    open("/login", null);
    act(() => captcha.props?.onFailure?.());
    act(() => captcha.props?.onToken("token"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
