import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * Round 12: the "Needs us" and "Today" tabs counted a failed read as 0 and
 * showed no count, which reads as nothing waiting. They now show "?" and say
 * the read failed, as the menu's counts do.
 */

type Read = { data: unknown; isError: boolean };
let needsUs: Read;
let tasks: Read;
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/use-support-cases", () => ({
  useSupportCases: () => ({ data: { cases: [], waitingOnUs: 0 }, isError: false }),
  useSupportCase: () => ({ data: undefined, isError: false }),
  useSupportNeedsUs: () => needsUs,
  useSupportTasks: () => tasks,
}));
for (const [path, name] of [
  ["@/components/support/support-case-list", "SupportCaseList"],
  ["@/components/support/support-conversation", "SupportConversation"],
  ["@/components/support/support-shop-card", "SupportShopCard"],
  ["@/components/support/support-alerts-toggle", "SupportAlertsToggle"],
  ["@/components/support/support-scoreboard", "SupportScoreboardView"],
  ["@/components/support/support-needs-us", "SupportNeedsUs"],
  ["@/components/support/support-today", "SupportToday"],
  ["@/components/support/support-notice-bar", "SupportNoticeBar"],
] as const) {
  vi.doMock(path, () => ({ [name]: () => null }));
}

const { default: SupportPage } = await import("./page");
const render = () => renderToStaticMarkup(createElement(SupportPage));

describe("the Support tabs' counts", () => {
  it("count what waits", () => {
    needsUs = { data: [{}, {}, {}], isError: false };
    tasks = { data: { me: "me", tasks: [{ owner_id: "me" }, { owner_id: "other" }] }, isError: false };
    const html = render();
    expect(html).toContain('aria-label="3 to look at"');
    expect(html).toContain('aria-label="1 to call today"');
  });

  it("say a read failed instead of showing nothing", () => {
    needsUs = { data: undefined, isError: true };
    tasks = { data: undefined, isError: true };
    const html = render();
    expect(html).toContain('aria-label="Could not check the shops that need us"');
    expect(html).toContain('aria-label="Could not check today&#x27;s calls"');
    expect(html.match(/>\?</g)).toHaveLength(2);
  });

  it("show no count while nothing waits", () => {
    needsUs = { data: [], isError: false };
    tasks = { data: { me: "me", tasks: [] }, isError: false };
    expect(render()).not.toMatch(/aria-label="(Could not|\d)/);
  });
});
