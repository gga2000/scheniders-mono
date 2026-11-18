"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Shield, Loader2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { TurnstileBox, type TurnstileHandle } from "@scheniders/ui/turnstile";
import { NO_CONSOLE_ACCESS, SIGN_IN_ENDED } from "@/lib/staff-sign-in";
import { NEXT_PAGE, pageAfterSignIn } from "@/lib/page-after-sign-in";
import { holdsLiveSignIn } from "@/lib/admin-fetch";

// Public Cloudflare Turnstile key. Unset = no box (only while Supabase CAPTCHA is off).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

/** The reason in the address the console sent staff here with, if any. */
function sentHereFor(): string {
  return new URLSearchParams(window.location.search).get("error") ?? "";
}

/** The console page staff asked for before the console sent them here, or Home. */
function pageAsked(): string {
  return pageAfterSignIn(new URLSearchParams(window.location.search).get(NEXT_PAGE));
}

/** The address does not change while the login page is open. */
const unwatched = () => () => {};

/** Why the console sent staff here (middleware.ts), in words they can act on. */
const SENT_HERE = new Map([
  ["expired", SIGN_IN_ENDED],
  ["forbidden", NO_CONSOLE_ACCESS],
]);

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, isLoading: authLoading } = useAdminAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const captchaRef = useRef<TurnstileHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaReady = TURNSTILE_SITE_KEY === "" || captchaToken !== null;
  // The security check could not run (its script was blocked, or Cloudflare
  // refused it): Sign in stays off, so say why and offer to run it again.
  const [captchaFailed, setCaptchaFailed] = useState(false);
  const [captchaRun, setCaptchaRun] = useState(0);
  const onCaptchaToken = (token: string | null) => {
    setCaptchaToken(token);
    if (token) setCaptchaFailed(false);
  };

  // Read from the address itself, after the server's render (no Suspense needed).
  const sentHere = SENT_HERE.get(useSyncExternalStore(unwatched, sentHereFor, () => "")) ?? null;

  // A sign-in the console just ended is not sent back in: if ending it failed,
  // the console would send it here again, round and round. A sign-in made
  // since, in this tab or another, goes on (round 16: a second tab kept saying
  // "Your sign-in ended" after staff signed in on the first).
  useEffect(() => {
    if (!user) return;
    if (sentHereFor() !== "expired") {
      router.push(pageAsked());
      return;
    }
    let current = true;
    holdsLiveSignIn().then(
      (live) => {
        if (current && live) router.push(pageAsked());
      },
      // Could not check: the page stays, and its form still signs in.
      (error: unknown) => console.error("[login] Could not check the sign-in", error),
    );
    return () => {
      current = false;
    };
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn(email, password, captchaToken ?? undefined);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
        router.push(pageAsked());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? `Could not sign in: ${err.message}` : "Could not sign in. Try again.");
    } finally {
      setLoading(false);
      // A token works once. The box may not be on screen to drop it: the
      // spinner stands in for the card while a sign-in runs, so a new box
      // comes back and Sign in waits for its token.
      setCaptchaToken(null);
      captchaRef.current?.reset();
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-[var(--card-border)] p-8 space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#1E1E1E] text-white flex items-center justify-center shadow-lg">
            <Shield className="w-7 h-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#1E1E1E]">Scheniders Admin</h1>
            <p className="text-sm text-[#6B6B6B] mt-1">
              Sign in to the admin console
            </p>
          </div>
        </div>

        {/* Error. The card stays white in dark mode, so its red is the light one. */}
        {(error ?? sentHere) && (
          <div role="alert" className="p-3 rounded-xl bg-red-500/5 border border-red-200 text-sm text-[#991B1B]">
            {error ?? sentHere}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-[#1E1E1E]">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="admin@scheniders.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="flex h-11 w-full rounded-xl border border-[#E7E5E4] bg-white px-4 py-2 text-sm text-[#1E1E1E] placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 focus:ring-[#1E1E1E]/20 focus:border-[#1E1E1E] hover:border-[#D6D3D1] transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-[#1E1E1E]">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="flex h-11 w-full rounded-xl border border-[#E7E5E4] bg-white px-4 py-2 text-sm text-[#1E1E1E] placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 focus:ring-[#1E1E1E]/20 focus:border-[#1E1E1E] hover:border-[#D6D3D1] transition-all"
            />
          </div>

          <TurnstileBox
            key={captchaRun}
            ref={captchaRef}
            siteKey={TURNSTILE_SITE_KEY}
            onToken={onCaptchaToken}
            onFailure={() => setCaptchaFailed(true)}
            language="en"
            frameClassName="rounded-xl border border-[#E7E5E4] bg-white"
          />
          {captchaFailed && (
            <div role="alert" className="flex items-center justify-between gap-3 text-sm text-[#991B1B]">
              <span>The security check did not finish, so Sign in is off. If it fails again, refresh the page.</span>
              <button
                type="button"
                onClick={() => {
                  setCaptchaFailed(false);
                  setCaptchaRun((run) => run + 1);
                }}
                className="shrink-0 font-semibold text-[#1E1E1E] underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !captchaReady}
            className="w-full h-11 rounded-xl bg-[#1E1E1E] text-white font-semibold text-sm hover:bg-[#2D2D2D] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
