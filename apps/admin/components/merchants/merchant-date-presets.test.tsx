// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DateRangePicker } from "@scheniders/ui/date-range-picker";

/*
 * Round 16 (Data new 1): the shared date picker's quick picks ("Today",
 * "Yesterday", "Last 7 days") read the browser's day. At 01:00 in Baghdad on
 * a laptop in another zone, "Today" picked yesterday, while the server counts
 * every day on the Baghdad calendar (readDayRange). The console names the
 * zone; the merchant app, which names none, keeps the browser's day.
 */
describe("the date picker's quick picks", () => {
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
    vi.useFakeTimers({ toFake: ["Date"] });
    // 05:00 on 18 Nov in Baghdad; still 21:00 on 17 Nov in New York.
    vi.setSystemTime(new Date("2026-11-18T02:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = zone;
  });
  afterEach(cleanup);

  const pick = (label: string, timeZone?: string) => {
    const onDateChange = vi.fn();
    render(createElement(DateRangePicker, { inline: true, onDateChange, timeZone }));
    fireEvent.click(screen.getAllByText(label)[0]);
    return onDateChange.mock.calls[0]?.slice(0, 2);
  };

  it("count Baghdad days when the console names the zone", () => {
    expect(pick("Today", "Asia/Baghdad")).toEqual(["2026-11-18", "2026-11-18"]);
    cleanup();
    expect(pick("Yesterday", "Asia/Baghdad")).toEqual(["2026-11-17", "2026-11-17"]);
    cleanup();
    expect(pick("Last 7 days", "Asia/Baghdad")).toEqual(["2026-11-12", "2026-11-18"]);
  });

  it("keep the browser's day when no zone is named", () => {
    expect(pick("Today")).toEqual(["2026-11-17", "2026-11-17"]);
  });
});

describe("every date picker in the console", () => {
  const ADMIN_DIR = path.resolve(__dirname, "../..");
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(full);
      return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [full] : [];
    });

  it("names the Baghdad zone", () => {
    const missing: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const file of sourceFiles(path.join(ADMIN_DIR, dir))) {
        for (const use of readFileSync(file, "utf8").match(/<DateRangePicker\b[\s\S]*?\/>/g) ?? []) {
          if (!use.includes('timeZone="Asia/Baghdad"')) missing.push(path.relative(ADMIN_DIR, file));
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
