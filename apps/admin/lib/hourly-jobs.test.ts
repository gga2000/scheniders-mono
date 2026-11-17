import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HOURLY_RUN_MS, hourlyJobSchema, jobProblems, type JobRun } from "./hourly-jobs";
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
 * Round 15 (Reliability new 4): the bell sent failed runs to Sentry only while
 * someone had a console open, and a stopped or unscheduled job never. Vercel's
 * scheduler now runs the check each hour (/api/cron/hourly-jobs), after both
 * jobs, so it reads this hour's runs.
 */
describe("the scheduled check", () => {
  const cron = z.object({ crons: z.array(z.object({ path: z.string(), schedule: z.string() })) });
  const crons = cron.parse(JSON.parse(readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8"))).crons;
  const check = crons.find((entry) => entry.path === "/api/cron/hourly-jobs");

  it("runs once an hour", () => {
    expect(check?.schedule).toMatch(/^[0-5]?\d \* \* \* \*$/);
  });

  it.each(hourlyJobSchema.options)("runs after %s has had at least 5 minutes, within the same hour", (job) => {
    const jobMinute = Number(schedule(job)?.split(" ")[0]);
    const checkMinute = Number(check?.schedule.split(" ")[0]);
    expect(checkMinute - jobMinute).toBeGreaterThanOrEqual(5);
  });
});
