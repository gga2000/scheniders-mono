import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "./admin-supabase";

/*
 * Round 25 (security item 18): no console route had a limit, so a looping page
 * or a stolen sign-in could spend the paid profile look-ups (three RapidAPI
 * calls each) for everyone, or pull every shop again and again. The costly and
 * bulk steps now each allow a set number per staff login in a window, counted
 * in Postgres (consume_rate_limit, 20260909150000_int4_api_rate_limit.sql) so
 * every server instance shares one count.
 */

/** Each limited step: how many one staff login may send in its window. Far above a person's pace. */
export const STAFF_LIMITS = {
  /** Three paid RapidAPI calls each. */
  "analyze-profile": { limit: 20, windowSeconds: 600 },
  /** A file of every shop or lead. */
  export: { limit: 20, windowSeconds: 600 },
  /** Up to 500 leads each. */
  "lead-import": { limit: 10, windowSeconds: 600 },
  /** A step on many shops at once. */
  bulk: { limit: 20, windowSeconds: 600 },
  /** Money into a wallet by hand. */
  "top-up": { limit: 30, windowSeconds: 600 },
} as const;

export type StaffLimitedStep = keyof typeof STAFF_LIMITS;

const answerSchema = z.object({ allowed: z.boolean(), reset_at: z.string() });

/** "Too many …" words with the wait, rounded up to whole minutes. */
export function tooManyWords(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many of these in a short time. Wait ${minutes === 1 ? "a minute" : `${minutes} minutes`}, then try again.`;
}

/**
 * Counts one more `step` for this staff login: null while it is within its
 * limit, else the 429 to answer. Keyed by the signed-in staff user's id, never
 * by anything the browser sends. When the counter cannot answer, the step goes
 * ahead and Sentry hears of it: a broken counter must not stop staff work.
 */
export async function staffRateLimit(userId: string, step: StaffLimitedStep): Promise<NextResponse | null> {
  const { limit, windowSeconds } = STAFF_LIMITS[step];
  const { data, error } = await createAdminClient()
    .rpc("consume_rate_limit", { _key: `console:${step}:${userId}`, _limit: limit, _window_seconds: windowSeconds })
    .single();
  const answer = answerSchema.safeParse(data);
  if (error || !answer.success) {
    Sentry.captureException(new Error(`Console rate limit for "${step}" did not answer: ${error?.message ?? "no row"}`));
    return null;
  }
  if (answer.data.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((Date.parse(answer.data.reset_at) - Date.now()) / 1000));
  return NextResponse.json(
    { error: tooManyWords(retryAfter) },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
