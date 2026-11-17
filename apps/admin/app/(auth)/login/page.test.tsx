// @vitest-environment jsdom
// The login page after the console ended a sign-in (staff console audit,
// round 13). It says why staff are there, and does not send a sign-in it was
// sent away for back into the console, where it would be sent here again.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const push = vi.fn();
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ user: auth.user, signIn: vi.fn(), isLoading: false }),
}));
vi.mock("@scheniders/ui/turnstile", () => ({ TurnstileBox: () => null }));

import LoginPage from "./page";

function open(address: string, user: { id: string } | null) {
  window.history.replaceState(null, "", address);
  auth.user = user;
  return render(createElement(LoginPage));
}

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("the login page", () => {
  it("says the sign-in ended, and does not send it back to the console", () => {
    open("/login?error=expired", { id: "u1" });
    expect(screen.getByRole("alert").textContent).toBe("Your sign-in ended after 16 hours. Sign in again.");
    expect(push).not.toHaveBeenCalled();
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
});
