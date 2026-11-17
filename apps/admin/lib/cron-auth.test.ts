import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Round 15 (Reliability new 4): the hourly check runs on Vercel's schedule with
 * no staff session, so its only lock is the scheduler's secret. With no secret
 * set it must refuse, not open.
 */
async function guardWith(secret: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("CRON_SECRET", secret ?? "");
  return (await import("./cron-auth")).requireCronAuth;
}
const asked = (authorization?: string) =>
  new Request("https://console.test/api/cron/hourly-jobs", { headers: authorization ? { authorization } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("requireCronAuth", () => {
  it("lets the scheduler in with its secret", async () => {
    const guard = await guardWith("s3cret-for-the-scheduler");
    expect(guard(asked("Bearer s3cret-for-the-scheduler"))).toBeNull();
  });

  it("answers 401 to a wrong secret, a missing one, and one with a different shape", async () => {
    const guard = await guardWith("s3cret-for-the-scheduler");
    for (const header of [undefined, "Bearer wrong", "s3cret-for-the-scheduler", "Bearer s3cret-for-the-scheduler-and-more"]) {
      expect(guard(asked(header))?.status).toBe(401);
    }
  });

  it("refuses everyone, and says so, when no secret is set", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const guard = await guardWith(undefined);
    const answer = guard(asked("Bearer "));
    expect(answer?.status).toBe(503);
    expect(await answer?.json()).toEqual({ error: "Endpoint is not configured." });
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("CRON_SECRET is not set"));
  });
});
