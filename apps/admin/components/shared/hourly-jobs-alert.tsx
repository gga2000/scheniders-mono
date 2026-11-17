"use client";

import { TimerOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";
import { formatDayTime } from "@/lib/format";
import { HOURLY_JOBS, jobProblemSchema, type JobProblem } from "@/lib/hourly-jobs";

const checkSchema = z.object({
  pausesNotLifted: z.array(z.object({ tenant_id: z.string(), business_name: z.string().nullable(), paused_until: z.string() })),
  jobs: z.array(jobProblemSchema),
});
export type HourlyJobsCheck = z.infer<typeof checkSchema>;

/** What the hourly jobs left undone (/api/hourly-jobs); checked every 10 minutes. */
export function useHourlyJobs() {
  return useQuery({
    queryKey: ["admin", "hourly-jobs"],
    queryFn: async () => {
      const res = await adminFetch("/api/hourly-jobs");
      if (!res.ok) throw new Error(`Hourly jobs check failed: ${res.status}`);
      return checkSchema.parse(await res.json());
    },
    refetchInterval: 10 * 60_000,
  });
}

export function hourlyJobsCount(check: HourlyJobsCheck | undefined): number {
  return check ? check.pausesNotLifted.length + check.jobs.length : 0;
}

/** One line per job in trouble: what happened, and when it last ran. */
export function jobLine({ job, problem, last_run }: JobProblem, now: Date = new Date()): string {
  const name = HOURLY_JOBS[job];
  if (problem === "not_scheduled") return `${name} is not scheduled.`;
  if (!last_run) return `${name} has never run.`;
  const when = formatDayTime(last_run, now);
  return problem === "failed" ? `${name} failed at ${when}.` : `${name} has not run since ${when}.`;
}

function names(rows: HourlyJobsCheck["pausesNotLifted"]): string {
  const shown = rows.slice(0, 3).map((r) => r.business_name ?? r.tenant_id.slice(0, 8));
  return rows.length > 3 ? `${shown.join(", ")} +${rows.length - 3}` : shown.join(", ");
}

/** The bell's red row when an hourly job failed, stopped, or left a pause on. */
export function HourlyJobsAlert({ check }: { check: HourlyJobsCheck }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--card-border)] bg-red-500/5 px-4 py-3 dark:bg-red-950/30" data-testid="hourly-jobs-alert">
      <span className="mt-0.5 text-[var(--ink-red)]"><TimerOff className="w-3.5 h-3.5" /></span>
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold text-[var(--ink-red)]">An hourly job needs a look</p>
        {check.jobs.map((problem) => (
          <p key={problem.job} className="text-xs text-[var(--ink-red)]">
            {jobLine(problem)}
          </p>
        ))}
        {check.pausesNotLifted.length > 0 && (
          <p className="text-xs text-[var(--ink-red)]">
            Pause ended, not lifted: {names(check.pausesNotLifted)}. A super admin can lift it on the shop page.
          </p>
        )}
      </div>
    </div>
  );
}
