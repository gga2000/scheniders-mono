// @vitest-environment jsdom
// A draft reopened from the leads list (staff console audit, round 13). Its
// Save sent the changes with no lists-as-opened check, and closing it with
// changes sent the whole form back as a draft, owner included, saying nothing
// when that failed: a colleague's owner, phones or finished save on the draft
// could be written over with no clash. Both now follow the lead page's rules.
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Lead, LeadFormData } from "@/types/leads";

const adminFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { leadToFormData } from "./lead-form-data";
import { useResumedDraft } from "./use-resumed-draft";

const MINE = { title: "Owner", number: "07701234567" };
const THEIRS = { title: "Colleague", number: "07809876543" };

const draft = (over: Partial<Lead> = {}): Lead =>
  ({
    id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f",
    merchant_name: "Untitled draft",
    industry_id: null,
    industry_detail: null,
    platform: "instagram",
    platform_url: null,
    handle: null,
    follower_count: 0,
    post_count: 0,
    management_name: null,
    management_info: null,
    page_phone: null,
    phone_numbers: [MINE],
    contact_via_dm: false,
    website_url: null,
    email: null,
    avg_view_count: 0,
    avg_like_count: 0,
    avg_comments_count: 0,
    avg_order_count: 0,
    address: null,
    city: null,
    governorate_code: null,
    is_online_only: false,
    branches: [],
    is_draft: true,
    priority: "medium",
    assigned_to: null,
    tags: [],
    source_campaign: null,
    source_medium: null,
    ...over,
  }) as Lead;

function setup(leads: Lead[] = [draft()]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidated: unknown[] = [];
  vi.spyOn(client, "invalidateQueries").mockImplementation(async (filters) => {
    invalidated.push(filters?.queryKey);
  });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const view = renderHook((props: { leads: Lead[] }) => useResumedDraft(props.leads), { wrapper, initialProps: { leads } });
  act(() => view.result.current.resume(leads[0]));
  return { ...view, invalidated };
}

/** The body of the n-th PATCH sent. */
const sent = (n = 0) => JSON.parse(adminFetch.mock.calls[n][1].body as string);

const ok = () => new Response(JSON.stringify({ saved: true }), { status: 200 });
const clash = () =>
  new Response(JSON.stringify({ error: "A colleague changed this lead's phones ...", stale: ["phone_numbers"] }), { status: 409 });

beforeEach(() => {
  adminFetch.mockReset();
  toast.error.mockReset();
});

describe("useResumedDraft: Save", () => {
  it("makes it a lead with only the changes, and the lists it changed as the draft opened", async () => {
    adminFetch.mockResolvedValueOnce(ok());
    const { result } = setup();
    const opened = { ...leadToFormData(draft()) };
    const changes: Partial<LeadFormData> = { merchant_name: "Kawkab", phone_numbers: [MINE, THEIRS] };

    await act(async () => {
      await expect(result.current.form.onSubmit({ ...opened, ...changes }, changes, opened)).resolves.toBe(true);
    });

    expect(adminFetch.mock.calls[0][0]).toBe(`/api/leads/${draft().id}`);
    expect(sent()).toEqual({ merchant_name: "Kawkab", phone_numbers: [MINE, THEIRS], is_draft: false, was: { phone_numbers: [MINE] } });
  });

  it("is refused over a colleague's phones, and the form then takes the list's fresh copy", async () => {
    adminFetch.mockResolvedValueOnce(clash());
    const { result, rerender, invalidated } = setup();
    const opened = leadToFormData(draft());
    const changes: Partial<LeadFormData> = { phone_numbers: [] };

    await act(async () => {
      await expect(result.current.form.onSubmit({ ...opened, ...changes }, changes, opened)).rejects.toThrow("A colleague changed");
    });
    await waitFor(() => expect(invalidated).toContainEqual(["leads"]));

    rerender({ leads: [draft({ phone_numbers: [MINE, THEIRS] })] });
    expect(result.current.form.initialData?.phone_numbers).toEqual([MINE, THEIRS]);
  });
});

describe("useResumedDraft: closing with changes", () => {
  it("sends only the changes with their lists as opened, and leaves the draft mark and the owner alone", async () => {
    adminFetch.mockResolvedValueOnce(ok());
    const { result } = setup();
    const opened = leadToFormData(draft());
    const changes: Partial<LeadFormData> = { management_name: "Typed", phone_numbers: [MINE, THEIRS] };

    act(() => result.current.form.onSaveDraft({ ...opened, ...changes }, changes, opened));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ management_name: "Typed", phone_numbers: [MINE, THEIRS], was: { phone_numbers: [MINE] } });
  });

  it("keeps the placeholder name when the name was cleared", async () => {
    adminFetch.mockResolvedValueOnce(ok());
    const { result } = setup();
    const opened = leadToFormData(draft());

    act(() => result.current.form.onSaveDraft({ ...opened, merchant_name: "" }, { merchant_name: "" }, opened));

    await waitFor(() => expect(adminFetch).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ merchant_name: "Untitled draft" });
  });

  it("sends nothing when nothing changed", () => {
    const { result } = setup();
    const opened = leadToFormData(draft());

    act(() => result.current.form.onSaveDraft(opened, {}, opened));

    expect(adminFetch).not.toHaveBeenCalled();
  });

  it("says so when the save fails", async () => {
    adminFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Failed to update lead" }), { status: 500 }));
    const { result } = setup();
    const opened = leadToFormData(draft());

    act(() => result.current.form.onSaveDraft({ ...opened, management_name: "Typed" }, { management_name: "Typed" }, opened));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the draft: Failed to update lead"));
  });

  it("says to open the draft again when a colleague changed its lists", async () => {
    adminFetch.mockResolvedValueOnce(clash());
    const { result } = setup();
    const opened = leadToFormData(draft());

    act(() => result.current.form.onSaveDraft({ ...opened, phone_numbers: [] }, { phone_numbers: [] }, opened));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Your changes to the draft were not saved: a colleague changed its phones meanwhile. Open the draft again to make them.",
      ),
    );
  });
});
