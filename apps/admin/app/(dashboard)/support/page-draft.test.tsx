// @vitest-environment jsdom
import { createElement, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/*
 * Round 24 (structure new 6): round 23 kept the open conversation, the reply
 * being typed and its send's id across a failed 5 s or 10 s re-read, but no
 * test held it. The conversation below keeps its draft in its own state, as
 * the real one does: if the page swapped it for the error, the draft would be
 * gone when the read came back.
 */

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const LANDED = Date.parse("2026-11-22T20:00:00Z");

type Read = {
  data: unknown;
  error: Error | null;
  isError: boolean;
  isRefetchError: boolean;
  isLoading: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => Promise<unknown>;
};

function read(data: unknown, failed = false): Read {
  return {
    data,
    error: failed ? new Error("Failed to fetch") : null,
    isError: failed,
    isRefetchError: failed && data !== undefined,
    isLoading: false,
    isFetching: false,
    dataUpdatedAt: LANDED,
    refetch: () => Promise.resolve(undefined),
  };
}

const CASES = { cases: [{ id: CASE_ID }], waitingOnUs: 1 };
const DETAIL = { case: { id: CASE_ID }, messages: [], notes: [], shop: {} };
let list: Read;
let detail: Read;
let needsUs: Read = read([]);
let tasks: Read = read({ tasks: [], me: "me" });

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/use-support-cases", () => ({
  useSupportCases: () => list,
  useSupportCase: () => detail,
  useSupportNeedsUs: () => needsUs,
  useSupportTasks: () => tasks,
}));
vi.mock("@/components/support/support-conversation", () => ({
  SupportConversation: () => {
    const [draft, setDraft] = useState("");
    return createElement("textarea", {
      "aria-label": "Reply",
      value: draft,
      onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    });
  },
}));
vi.mock("@/components/support/support-case-list", () => ({ SupportCaseList: () => createElement("ul") }));
vi.mock("@/components/support/support-shop-card", () => ({ SupportShopCard: () => null }));
vi.mock("@/components/support/support-alerts-toggle", () => ({ SupportAlertsToggle: () => null }));
vi.mock("@/components/support/support-notice-bar", () => ({ SupportNoticeBar: () => null }));
vi.mock("@/components/support/support-tab-count", () => ({
  SupportTabCount: ({ badge }: { badge: { label: string } }) => createElement("span", null, badge.label),
}));

import SupportPage from "./page";

afterEach(() => {
  cleanup();
  needsUs = read([]);
  tasks = read({ tasks: [], me: "me" });
});

describe("the support inbox across a failed re-read", () => {
  it("keeps the reply being typed, and says the list and the conversation are old", () => {
    list = read(CASES);
    detail = read(DETAIL);
    const page = render(createElement(SupportPage));
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "on it, one minute" } });

    list = read(CASES, true);
    detail = read(DETAIL, true);
    act(() => page.rerender(createElement(SupportPage)));
    expect((screen.getByLabelText("Reply") as HTMLTextAreaElement).value).toBe("on it, one minute");
    expect(screen.getByText(/Could not refresh the conversations\. This list is from/)).toBeTruthy();
    expect(screen.getByText(/Could not refresh this conversation\. This page is from/)).toBeTruthy();

    list = read(CASES);
    detail = read(DETAIL);
    act(() => page.rerender(createElement(SupportPage)));
    expect((screen.getByLabelText("Reply") as HTMLTextAreaElement).value).toBe("on it, one minute");
    expect(screen.queryByText(/Could not refresh/)).toBeNull();
  });

  it("shows the one load error, with Try again, when nothing was ever read", () => {
    list = read(undefined, true);
    detail = read(undefined);
    render(createElement(SupportPage));
    expect(screen.getByText("Could not load the conversations")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });
});

/*
 * Round 25 (structure new 2): the tab counts and the waiting line said "?" or
 * "Could not check" after one failed refresh, while the lists under them kept
 * their rows with a stale line. They keep the last count now, and say they
 * could not check only when nothing was ever read.
 */
describe("the counts across a failed re-read", () => {
  it("keeps the last counts while the lists keep their rows", () => {
    list = read(CASES, true);
    detail = read(DETAIL);
    needsUs = read([{ tenant_id: "a" }, { tenant_id: "b" }], true);
    tasks = read({ tasks: [{ owner_id: "me" }], me: "me" }, true);
    render(createElement(SupportPage));
    expect(screen.getByText("1 merchant waiting on us")).toBeTruthy();
    expect(screen.getByText("2 to look at")).toBeTruthy();
    expect(screen.getByText("1 to call today")).toBeTruthy();
    expect(screen.queryByText(/Could not check/)).toBeNull();
  });

  it("says it could not check when nothing was ever read", () => {
    list = read(undefined, true);
    detail = read(undefined);
    needsUs = read(undefined, true);
    tasks = read(undefined, true);
    render(createElement(SupportPage));
    expect(screen.getByText("Could not check who is waiting on us")).toBeTruthy();
    expect(screen.getByText("Could not check the shops that need us")).toBeTruthy();
    expect(screen.getByText("Could not check today's calls")).toBeTruthy();
  });
});
