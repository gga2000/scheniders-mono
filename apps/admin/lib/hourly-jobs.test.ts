import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { freshFailures, HOURLY_RUN_MS, hourlyJobSchema, jobProblems, type JobProblem, type JobRun } from "./hourly-jobs";
import { pauseLiftOverdue } from "./tenant-pause";

/*
 * Round 13 (Reliability new 3): the lift of ended pauses and the lead score
 * refresh run in the database each hour, and a failure reached only the
 * database log. The staff bell now reads their newest runs; these are the
 * rules it reads them by, and the schedules they assume.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../packages/supabase/migrations");

/** The schedule pg_cron last got for `job`, as the migrations leave it; null once unscheduled. */
function schedule(job: string): string | null {
  const scheduled = new RegExp(`cron\\.schedule\\(\\s*'${job}'\\s*,\\s*'([^']+)'`, "g");
  const unscheduled = new RegExp(`cron\\.unschedule\\(\\s*'${job}'`);
  let found: string | null = null;
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    if (unscheduled.test(sql)) found = null;
    for (const match of sql.matchAll(scheduled)) found = match[1];
  }
  return found;
}

const NOW = Date.parse("2026-11-17T14:40:00Z");
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const run = (jobname: string, minutes: number | null, status = "succeeded"): JobRun => ({
  jobname,
  last_start: minutes === null ? null : minutesAgo(minutes),
  last_status: minutes === null ? null : status,
  last_message: minutes === null ? null : status === "failed" ? "ERROR: division by zero" : "1 row",
});

describe("the hourly jobs' schedules", () => {
  it.each(hourlyJobSchema.options)("%s runs once an hour, so a run older than the window means it stopped", (job) => {
    expect(schedule(job)).toMatch(/^[0-5]?\d \* \* \* \*$/);
  });

  it("allows an hour and a few minutes for the run itself", () => {
    expect(HOURLY_RUN_MS).toBeGreaterThan(60 * 60_000);
    expect(HOURLY_RUN_MS).toBeLessThanOrEqual(70 * 60_000);
  });

  it("gives an ended pause the same window before it counts as not lifted", () => {
    expect(pauseLiftOverdue(minutesAgo(60), NOW)).toBe(false);
    expect(pauseLiftOverdue(new Date(NOW - HOURLY_RUN_MS - 1).toISOString(), NOW)).toBe(true);
  });
});

describe("jobProblems", () => {
  it("is empty while each job ran within the hour", () => {
    expect(jobProblems([run("lift-ended-pauses", 19), run("refresh-lead-scores", 13)], NOW)).toEqual([]);
  });

  it("names a job whose newest run failed, with when it ran", () => {
    expect(jobProblems([run("lift-ended-pauses", 19), run("refresh-lead-scores", 13, "failed")], NOW)).toEqual([
      { job: "refresh-lead-scores", problem: "failed", last_run: minutesAgo(13), message: "ERROR: division by zero" },
    ]);
  });

  it("names a job with no run within the hour, or none at all", () => {
    expect(jobProblems([run("lift-ended-pauses", 79), run("refresh-lead-scores", null)], NOW)).toEqual([
      { job: "lift-ended-pauses", problem: "stopped", last_run: minutesAgo(79), message: null },
      { job: "refresh-lead-scores", problem: "stopped", last_run: null, message: null },
    ]);
  });

  it("names a job pg_cron does not have", () => {
    expect(jobProblems([run("lift-ended-pauses", 19)], NOW)).toEqual([
      { job: "refresh-lead-scores", problem: "not_scheduled", last_run: null, message: null },
    ]);
  });
});

/*
 * Round 14 (Reliability new 4): a failed run's reason was read and dropped,
 * and no failure reached Sentry. The bell checks every 10 minutes in every
 * open console, so a failed run is sent once per server instance, and only
 * while it is fresh.
 */
describe("freshFailures", () => {
  const failed = (job: JobProblem["job"], minutes: number): JobProblem => ({
    job,
    problem: "failed",
    last_run: minutesAgo(minutes),
    message: "ERROR: division by zero",
  });

  it("sends a fresh failed run once, however often the bell checks", () => {
    const seen = new Map<string, number>();
    const problems = [failed("refresh-lead-scores", 2)];
    expect(freshFailures(problems, seen, NOW)).toEqual(problems);
    expect(freshFailures(problems, seen, NOW + 10 * 60_000)).toEqual([]);
  });

  it("sends the next failed run of the same job as a new one", () => {
    const seen = new Map<string, number>();
    freshFailures([failed("refresh-lead-scores", 2)], seen, NOW);
    const nextHour = [failed("refresh-lead-scores", 2)];
    expect(freshFailures(nextHour, seen, NOW + 60 * 60_000)).toEqual([]); // the same run, already sent
    expect(freshFailures([{ ...nextHour[0], last_run: new Date(NOW + 58 * 60_000).toISOString() }], seen, NOW + 60 * 60_000)).toHaveLength(1);
  });

  it("sends a failure the first check finds late in its hour, as when nobody had the console open", () => {
    const seen = new Map<string, number>();
    expect(freshFailures([failed("lift-ended-pauses", 50)], seen, NOW)).toHaveLength(1);
  });

  it("does not send a failed run older than the hour, a stopped job or one never run", () => {
    const seen = new Map<string, number>();
    expect(freshFailures([failed("lift-ended-pauses", HOURLY_RUN_MS / 60_000 + 1)], seen, NOW)).toEqual([]);
    expect(
      freshFailures(
        [
          { job: "lift-ended-pauses", problem: "stopped", last_run: minutesAgo(80), message: null },
          { job: "refresh-lead-scores", problem: "failed", last_run: null, message: null },
        ],
        seen,
        NOW,
      ),
    ).toEqual([]);
  });

  it("forgets runs past the hour, so it does not grow", () => {
    const seen = new Map<string, number>();
    freshFailures([failed("refresh-lead-scores", 2)], seen, NOW);
    expect(seen.size).toBe(1);
    freshFailures([], seen, NOW + HOURLY_RUN_MS);
    expect(seen.size).toBe(0);
  });
});
