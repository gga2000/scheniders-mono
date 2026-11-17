import { z } from "zod";

/**
 * The console's hourly pg_cron jobs, by the name pg_cron runs them under.
 * Each runs once an hour (hourly-jobs.test.ts ties this to the schedules in
 * packages/supabase/migrations).
 */
export const hourlyJobSchema = z.enum(["lift-ended-pauses", "refresh-lead-scores"]);
export type HourlyJob = z.infer<typeof hourlyJobSchema>;

/** Each job as staff read it. */
export const HOURLY_JOBS: Record<HourlyJob, string> = {
  "lift-ended-pauses": "The pause lift",
  "refresh-lead-scores": "The lead score refresh",
};

/** An hour between runs, and five minutes of slack for the run itself. */
export const HOURLY_RUN_MS = 65 * 60 * 1000;

/** One row of staff_job_runs: a job's newest run. */
export const jobRunSchema = z.object({
  jobname: z.string(),
  last_start: z.string().nullable(),
  last_status: z.string().nullable(),
  last_message: z.string().nullable(),
});
export type JobRun = z.infer<typeof jobRunSchema>;

export const jobProblemSchema = z.object({
  job: hourlyJobSchema,
  /** failed: its newest run failed. stopped: no run within the hour. not_scheduled: pg_cron has no such job. */
  problem: z.enum(["failed", "stopped", "not_scheduled"]),
  /** When its newest run started; null when it never ran. */
  last_run: z.string().nullable(),
  /** What a failed run said (its first 300 characters); null otherwise. */
  message: z.string().nullable(),
});
export type JobProblem = z.infer<typeof jobProblemSchema>;

/**
 * What is wrong with each hourly job, from its newest run. A failed run
 * undoes all its work (the lead score refresh) or is tried again next hour;
 * either way staff hear of it here instead of only in the database log, with
 * what the run said.
 */
export function jobProblems(runs: readonly JobRun[], nowMs: number): JobProblem[] {
  return hourlyJobSchema.options.flatMap((job): JobProblem[] => {
    const run = runs.find((r) => r.jobname === job);
    if (!run) return [{ job, problem: "not_scheduled", last_run: null, message: null }];
    if (run.last_status === "failed") return [{ job, problem: "failed", last_run: run.last_start, message: run.last_message }];
    if (!run.last_start || nowMs - Date.parse(run.last_start) > HOURLY_RUN_MS) {
      return [{ job, problem: "stopped", last_run: run.last_start, message: null }];
    }
    return [];
  });
}
