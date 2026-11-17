import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StaffAction } from "@/types/leads";
import { TeamPerformanceChart } from "./team-performance-chart";

/*
 * Round 15 (data lane 3, same cause): the chart put each action on the
 * browser's calendar day. An action at 01:30 Baghdad time (22:30 UTC the day
 * before) counted on the wrong day for a browser on UTC. Days are Baghdad's.
 */
const action = (created_at: string) => ({ created_at }) as StaffAction;

afterEach(() => vi.useRealTimers());

describe("TeamPerformanceChart", () => {
  it("counts each action on its Baghdad day", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
    const html = renderToStaticMarkup(
      createElement(TeamPerformanceChart, {
        actions: [action("2026-11-16T22:30:00Z"), action("2026-11-16T23:10:00Z"), action("2026-11-16T12:00:00Z")],
      }),
    );
    // Two on Tue 17 Nov (01:30 and 02:10 Baghdad), one on Mon 16 Nov.
    expect(html).toContain("Nov 17 (2)");
  });
});
