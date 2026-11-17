import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HourlyJobsAlert, hourlyJobsCount, jobLine } from "./hourly-jobs-alert";

/*
 * Round 13 (Reliability new 3): the bell's red row for the hourly jobs. It
 * says which job, what happened and when, and names the shops whose pause
 * did not lift, with who can lift it.
 */

const NOW = new Date("2026-11-17T14:40:00Z");

describe("the hourly jobs row", () => {
  it("says what happened to each job, and when, in Baghdad time", () => {
    expect(jobLine({ job: "refresh-lead-scores", problem: "failed", last_run: "2026-11-17T14:27:00Z", message: null }, NOW)).toBe(
      "The lead score refresh failed at Tue 17 Nov, 17:27.",
    );
    expect(jobLine({ job: "lift-ended-pauses", problem: "stopped", last_run: "2026-11-17T12:21:00Z", message: null }, NOW)).toBe(
      "The pause lift has not run since Tue 17 Nov, 15:21.",
    );
    expect(jobLine({ job: "lift-ended-pauses", problem: "stopped", last_run: null, message: null }, NOW)).toBe(
      "The pause lift has never run.",
    );
    expect(jobLine({ job: "refresh-lead-scores", problem: "not_scheduled", last_run: null, message: null }, NOW)).toBe(
      "The lead score refresh is not scheduled.",
    );
  });

  // Round 14 (Reliability new 4): the run's own words, which the route sends to super admins only.
  it("adds what a failed run said, when the login may read it", () => {
    const failed = { job: "refresh-lead-scores", problem: "failed", last_run: "2026-11-17T14:27:00Z" } as const;
    expect(jobLine({ ...failed, message: "ERROR: division by zero" }, NOW)).toBe(
      "The lead score refresh failed at Tue 17 Nov, 17:27. It said: ERROR: division by zero",
    );
  });

  it("names the shops whose pause did not lift, and who can lift it", () => {
    const check = {
      jobs: [],
      pausesNotLifted: [
        { tenant_id: "shop-1", business_name: "Kawkab", paused_until: "2026-11-17T10:00:00Z" },
        { tenant_id: "1234567890ab", business_name: null, paused_until: "2026-11-17T10:00:00Z" },
      ],
    };
    const html = renderToStaticMarkup(createElement(HourlyJobsAlert, { check }));
    expect(html).toContain("Pause ended, not lifted: Kawkab, 12345678. A super admin can lift it on the shop page.");
    expect(hourlyJobsCount(check)).toBe(2);
  });

  it("counts nothing while the jobs run", () => {
    expect(hourlyJobsCount({ jobs: [], pausesNotLifted: [] })).toBe(0);
    expect(hourlyJobsCount(undefined)).toBe(0);
  });
});
