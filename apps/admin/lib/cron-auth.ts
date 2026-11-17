import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "./admin-env";

/** Whether this server instance has said that CRON_SECRET is missing. */
let missingSecretSaid = false;

/**
 * The guard of a scheduled check (/api/cron/*, which the middleware lets
 * through with no staff session). Vercel's scheduler sends the
 * project's CRON_SECRET as a bearer token. It fails closed: with no secret
 * set the check is misconfigured, not public, and says so in the logs (and so
 * in Sentry) once per server instance. Anyone can call the address, so saying
 * it on every call would let a stranger fill Sentry.
 *
 * Returns the answer to send at once, or null when the caller is the scheduler.
 */
export function requireCronAuth(request: Request): NextResponse | null {
  const secret = env.CRON_SECRET;
  if (!secret) {
    if (!missingSecretSaid) {
      missingSecretSaid = true;
      console.error("[cron-auth] CRON_SECRET is not set: refusing to run the scheduled check.");
    }
    return NextResponse.json({ error: "Endpoint is not configured." }, { status: 503 });
  }
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Constant-time compare: hashed first, so neither the length nor the first differing byte shows in the time taken. */
function sameSecret(given: string, expected: string): boolean {
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
}
