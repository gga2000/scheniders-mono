// @vitest-environment jsdom
// The login page after the console ended a sign-in (staff console audit,
// round 13). It says why staff are there, and does not send a sign-in it was
// sent away for back into the console, where it would be sent here again.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
type SignIn = (email: string, password: string, captchaToken?: string) => Promise<{ error: string | null }>;
const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  signIn: vi.fn<SignIn>(async () => ({ error: null })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
// Like the real hook, a sign-in shows the hook as loading while it runs, and
// the page shows its spinner in place of the card meanwhile.
vi.mock("@/hooks/use-admin-auth", async () => {
  const { useState } = await import("react");
  return {
    useAdminAuth: () => {
      const [isLoading, setIsLoading] = useState(false);
      const signIn: SignIn = async (...attempt) => {
        setIsLoading(true);
        const answer = await auth.signIn(...attempt);
        setIsLoading(false);
        return answer;
      };
      return { user: auth.user, signIn, isLoading };
    },
  };
});
/** The props of the security check box, and how many times it was mounted. */
const captcha = vi.hoisted(() => ({
  mounts: 0,
  props: null as { onToken: (token: string | null) => void; onFailure?: () => void } | null,
}));
vi.mock("@scheniders/ui/turnstile", async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import("react");
  type Props = { onToken: (token: string | null) => void; onFailure?: () => void };
  return {
    // Like the real box, reset() drops the token it gave.
    TurnstileBox: forwardRef<{ reset: () => void }, Props>(function TurnstileBox(props, ref) {
      captcha.props = props;
      useImperativeHandle(ref, () => ({ reset: () => props.onToken(null) }));
      useEffect(() => {
        captcha.mounts += 1;
      }, []);
      return null;
    }),
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
  auth.signIn.mockReset();
  captcha.mounts = 0;
  vi.unstubAllEnvs();
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

/**
 * Round 15 (Tests new 7): the tests ran with no site key, so the security
 * check never held Sign in, and no test sent the form.
 */
describe("the login page with the security check on", () => {
  async function openWithCheck() {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    const { default: Page } = await import("./page");
    window.history.replaceState(null, "", "/login");
    auth.user = null;
    render(createElement(Page));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "staff@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
  }
  const signInButton = () => screen.getByRole("button", { name: "Sign in" });
  async function press() {
    await act(async () => {
      fireEvent.click(signInButton());
    });
  }

  it("keeps Sign in off until the check passes, and while it has failed", async () => {
    await openWithCheck();
    expect(signInButton()).toHaveProperty("disabled", true);
    act(() => captcha.props?.onToken("token-1"));
    expect(signInButton()).toHaveProperty("disabled", false);
    act(() => captcha.props?.onToken(null));
    act(() => captcha.props?.onFailure?.());
    expect(signInButton()).toHaveProperty("disabled", true);
  });

  it("says why a sign-in was refused, and never sends its spent token again", async () => {
    await openWithCheck();
    act(() => captcha.props?.onToken("token-1"));
    auth.signIn.mockResolvedValueOnce({ error: "Wrong email or password." });
    await press();
    expect(auth.signIn).toHaveBeenLastCalledWith("staff@example.com", "secret", "token-1");
    expect(screen.getByRole("alert").textContent).toBe("Wrong email or password.");
    // A token works once: Sign in waits for the next one.
    expect(signInButton()).toHaveProperty("disabled", true);
    act(() => captcha.props?.onToken("token-2"));
    auth.signIn.mockResolvedValueOnce({ error: null });
    await press();
    expect(auth.signIn).toHaveBeenLastCalledWith("staff@example.com", "secret", "token-2");
    expect(push).toHaveBeenCalledWith("/");
  });
});
