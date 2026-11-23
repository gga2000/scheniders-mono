// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { NeedsUsShop, SupportTask } from "@/lib/support";

/*
 * Round 24 (UX new 1, structure new 1): Needs us and Today swapped their rows
 * for the load error when the 60 s re-read failed. Each row holds the first
 * message or the call note being typed, and the hook that keeps its send's
 * id, so both were gone when the read came back. They now keep the rows and
 * say the list is old.
 */

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

const SHOP: NeedsUsShop = {
  tenant_id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f",
  business_name: "Kawkab",
  display_id: 100095,
  status: "active",
  problems: [{ code: "wallet_empty", since: null, detail: null }],
  owner_name: "Ali",
  open_case: null,
  last_contact_at: null,
};

const TASK: SupportTask = {
  id: "7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a",
  kind: "welcome_call",
  topic: null,
  due_at: "2026-11-22T21:00:00Z",
  attempts: 0,
  phone: null,
  requested_by: null,
  tenant_id: SHOP.tenant_id,
  business_name: "Kawkab",
  display_id: 100095,
  trial_ends_at: null,
  shop_status: "trial",
  orders: 0,
  owner_id: "me",
  owner_name: "Noor",
  calls: [],
};

let shops: Read;
let tasks: Read;
const idle = { mutate: vi.fn(), isPending: false };

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-live-tick", () => ({ useLiveTick: () => LANDED }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/hooks/use-support-cases", () => ({
  useSupportNeedsUs: () => shops,
  useSupportStartConversation: () => idle,
  useSupportTasks: () => tasks,
  useSupportLogTask: () => idle,
  useSupportTakeShop: () => idle,
}));

import { SupportNeedsUs } from "./support-needs-us";
import { SupportToday } from "./support-today";

afterEach(cleanup);

describe("Needs us across a failed re-read", () => {
  it("keeps the first message being typed, and says the list is old", () => {
    shops = read([SHOP]);
    const view = render(createElement(SupportNeedsUs, { onOpenCase: () => {} }));
    fireEvent.click(screen.getByText("Write first"));
    fireEvent.change(screen.getByLabelText("First message to Kawkab"), { target: { value: "محفظتك فارغة" } });

    shops = read([SHOP], true);
    act(() => view.rerender(createElement(SupportNeedsUs, { onOpenCase: () => {} })));
    expect((screen.getByLabelText("First message to Kawkab") as HTMLTextAreaElement).value).toBe("محفظتك فارغة");
    expect(screen.getByText(/Could not refresh the shops that need us\. This list is from/)).toBeTruthy();
  });

  it("shows the load error only when nothing was ever read", () => {
    shops = read(undefined, true);
    render(createElement(SupportNeedsUs, { onOpenCase: () => {} }));
    expect(screen.getByText("Could not load the shops that need us")).toBeTruthy();
  });
});

describe("Today across a failed re-read", () => {
  it("keeps the call note being typed, and says the list is old", () => {
    tasks = read({ tasks: [TASK], me: "me" });
    const view = render(createElement(SupportToday));
    const note = () => screen.getByPlaceholderText(/What did they say\?/) as HTMLInputElement;
    fireEvent.change(note(), { target: { value: "will add products tonight" } });

    tasks = read({ tasks: [TASK], me: "me" }, true);
    act(() => view.rerender(createElement(SupportToday)));
    expect(note().value).toBe("will add products tonight");
    expect(screen.getByText(/Could not refresh today's calls\. This list is from/)).toBeTruthy();
  });

  it("shows the load error only when nothing was ever read", () => {
    tasks = read(undefined, true);
    render(createElement(SupportToday));
    expect(screen.getByText("Could not load today's calls")).toBeTruthy();
  });
});
