// @vitest-environment jsdom
// Round 15 (Tests new 7): the sign-in itself had no test, so reverting the
// refusal words to the auth server's own message, or dropping the security
// token, failed nothing.
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthApiError } from "@supabase/supabase-js";

const supabase = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: supabase.signInWithPassword,
      signOut: async () => ({ error: null }),
    },
  }),
}));

import { AdminAuthProvider, useAdminAuth } from "./use-admin-auth";

type Auth = ReturnType<typeof useAdminAuth>;

function mount(): { current: Auth | null } {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  const seen: { current: Auth | null } = { current: null };
  function Probe() {
    seen.current = useAdminAuth();
    return null;
  }
  render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(AdminAuthProvider, null, createElement(Probe)),
    ),
  );
  return seen;
}

afterEach(() => {
  cleanup();
  supabase.signInWithPassword.mockReset();
  vi.unstubAllEnvs();
});

describe("signing in", () => {
  it("sends the security token, and gives a refusal in staff words", async () => {
    supabase.signInWithPassword.mockResolvedValue({
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    const auth = mount();
    let answer: { error: string | null } | undefined;
    await act(async () => {
      answer = await auth.current?.signIn("staff@example.com", "secret", "token-1");
    });
    expect(supabase.signInWithPassword).toHaveBeenCalledWith({
      email: "staff@example.com",
      password: "secret",
      options: { captchaToken: "token-1" },
    });
    expect(answer).toEqual({ error: "Wrong email or password." });
    expect(auth.current?.error).toBe("Wrong email or password.");
    expect(auth.current?.isLoading).toBe(false);
  });

  it("answers no error when the auth server takes the password", async () => {
    supabase.signInWithPassword.mockResolvedValue({ error: null });
    const auth = mount();
    let answer: { error: string | null } | undefined;
    await act(async () => {
      answer = await auth.current?.signIn("staff@example.com", "secret");
    });
    expect(answer).toEqual({ error: null });
    expect(auth.current?.error).toBeNull();
  });
});
