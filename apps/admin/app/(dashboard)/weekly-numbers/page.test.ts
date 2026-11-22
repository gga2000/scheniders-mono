import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { weekSummary, type WeekRow } from "@/lib/weekly-dashboard";

/*
 * Weekly numbers (Fermi B12 item 5, for Mohammed; Ali's pick A, 22 Nov): the
 * running week on top in eight numbers, then one row a week, newest first.
 */

const { default: WeeklyNumbersPage } = await import("./page");

const row = (week_start: string, extra: Partial<WeekRow> = {}): WeekRow => ({
  week_start,
  running: false,
  new_shops: 11,
  trials_started: 11,
  first_order_due: 11,
  first_order_72h: 4,
  became_paying: 3,
  became_paying_assisted: 3,
  paying_at_end: 7,
  churned: 0,
  trial_whatsapp_utility: 100,
  trial_whatsapp_marketing: 0,
  ...extra,
});

function render(rows: WeekRow[]): string {
  const client = new QueryClient();
  client.setQueryData(["admin", "weekly-dashboard"], { weeks: rows.map(weekSummary) });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(WeeklyNumbersPage)));
}

describe("Weekly numbers", () => {
  const weeks = [
    row("2026-11-07"),
    row("2026-11-14", {
      running: true,
      new_shops: 17,
      trials_started: 14,
      first_order_due: 7,
      first_order_72h: 3,
      became_paying: 3,
      became_paying_assisted: 2,
      paying_at_end: 9,
      churned: 1,
    }),
  ];

  it("fills the numbers from the running week, with stopped paying in red when any stopped", () => {
    const html = render(weeks);
    expect(html).toContain("Trials started");
    expect(html).toContain(">14<");
    expect(html).toContain(">43%<");
    expect(html).toContain("3 of 7 shops");
    expect(html).toContain("2 helped · 1 alone");
    expect(html).toContain("Paying shops");
    expect(html).toContain(">9<");
    expect(html).toContain("14 to 20 Nov");
    expect(html).toContain("Still running");
    expect(html).toMatch(/text-\[var\(--ink-red\)\][^>]*>1</);
  });

  it("lists the weeks newest first, the running week marked", () => {
    const html = render(weeks);
    const table = html.slice(html.indexOf('data-testid="weekly-numbers"'));
    expect(table.indexOf("14 Nov, running")).toBeGreaterThan(-1);
    expect(table.indexOf("14 Nov, running")).toBeLessThan(table.indexOf("7 Nov"));
    expect(table).toContain("2 / 1");
    expect(table).toContain("3 / 0");
    expect(html).toContain("2 weeks shown.");
  });

  it("says when no new shop's first 72 hours are over yet, never 0%, in the same words above and below", () => {
    const html = render([row("2026-11-21", { running: true, first_order_due: 0, first_order_72h: 0 })]);
    const table = html.slice(html.indexOf('data-testid="weekly-numbers"'));
    expect(html.slice(0, html.indexOf('data-testid="weekly-numbers"'))).toContain("None due yet");
    expect(table).toContain("None due yet");
    expect(html).not.toContain("none due");
    expect(html).not.toContain(">0%<");
  });

  it("names each number the same in the strip and the table, New shops included", () => {
    const html = render(weeks);
    const at = html.indexOf('data-testid="weekly-numbers"');
    const strip = html.slice(0, at);
    const head = html.slice(at, html.indexOf("</thead>"));
    for (const name of ["Trials started", "First order in 72 hours", "Became paying", "Paying shops", "New shops", "Stopped paying", "Trial WhatsApp cost"]) {
      expect(strip).toContain(name);
      expect(head).toContain(name);
    }
    const body = html.slice(html.indexOf("<tbody>"));
    expect(body).toContain(">17<");
    expect(body).toContain(">1,600 IQD<");
  });

  it("says 1 week, not 1 weeks", () => {
    const html = render([row("2026-11-21", { running: true })]);
    expect(html).toContain("1 week shown.");
  });
});
