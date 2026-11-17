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

// Saves (PATCH) answer from `patch`; a read of the lead by id answers `stored`.
const patch = vi.hoisted(() => vi.fn());
const stored = vi.hoisted(() => ({ lead: null as unknown }));
const adminFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin-fetch", () => ({ adminFetch }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { LEAD_GONE, LEAD_GONE_TOAST } from "@/lib/lead-update";
import { shouldRetryLoad } from "@/lib/load-failure";
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
  // Reads retry as the console's client does: never after a 404.
  const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryLoad }, mutations: { retry: false } } });
  const invalidated: unknown[] = [];
  const invalidate = client.invalidateQueries.bind(client);
  vi.spyOn(client, "invalidateQueries").mockImplementation((filters) => {
    invalidated.push(filters?.queryKey);
    return invalidate(filters);
  });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const view = renderHook((props: { leads: Lead[] }) => useResumedDraft(props.leads), { wrapper, initialProps: { leads } });
  act(() => view.result.current.resume(leads[0]));
  return { ...view, invalidated };
}

/** The body of the n-th PATCH sent. */
const sent = (n = 0) => JSON.parse(patch.mock.calls[n][1].body as string);

const ok = () => new Response(JSON.stringify({ saved: true }), { status: 200 });
const clash = () =>
  new Response(JSON.stringify({ error: "A colleague changed this lead's phones ...", stale: ["phone_numbers"] }), { status: 409 });

beforeEach(() => {
  patch.mockReset();
  stored.lead = null;
  adminFetch.mockReset();
  adminFetch.mockImplementation(async (url: string, init?: RequestInit) =>
    init?.method === "PATCH"
      ? patch(url, init)
      : new Response(JSON.stringify({ lead: stored.lead ?? draft(), activities: [], follow_ups: [], social_links: [], competitors: [] })),
  );
  toast.error.mockReset();
});

describe("useResumedDraft: Save", () => {
  it("makes it a lead with only the changes, and the lists it changed as the draft opened", async () => {
    patch.mockResolvedValueOnce(ok());
    const { result } = setup();
    const opened = { ...leadToFormData(draft()) };
    const changes: Partial<LeadFormData> = { merchant_name: "Kawkab", phone_numbers: [MINE, THEIRS] };

    await act(async () => {
      await expect(result.current.form.onSubmit({ ...opened, ...changes }, changes, opened)).resolves.toBe(true);
    });

    expect(patch.mock.calls[0][0]).toBe(`/api/leads/${draft().id}`);
    expect(sent()).toEqual({ merchant_name: "Kawkab", phone_numbers: [MINE, THEIRS], is_draft: false, was: { phone_numbers: [MINE] } });
  });

  // Round 14: the form took the colleague's lists only from the list page, so a
  // draft that had left the page or filter kept its stale copy for good.
  it("is refused over a colleague's phones, and the form then takes the lead read again, wherever the list is", async () => {
    patch.mockResolvedValueOnce(clash());
    const { result, rerender, invalidated } = setup();
    await waitFor(() => expect(result.current.form.initialData?.phone_numbers).toEqual([MINE]));
    const opened = leadToFormData(draft());
    const changes: Partial<LeadFormData> = { phone_numbers: [] };
    stored.lead = draft({ phone_numbers: [MINE, THEIRS] });

    await act(async () => {
      await expect(result.current.form.onSubmit({ ...opened, ...changes }, changes, opened)).rejects.toThrow("A colleague changed");
    });
    await waitFor(() => expect(invalidated).toContainEqual(["lead", draft().id]));

    rerender({ leads: [] });
    await waitFor(() => expect(result.current.form.initialData?.phone_numbers).toEqual([MINE, THEIRS]));
  });
});

describe("useResumedDraft: opening", () => {
  it("opens at once with the copy at hand when nothing is being saved", () => {
    const { result } = setup();
    expect(result.current.form.open).toBe(true);
    expect(result.current.form.initialData?.phone_numbers).toEqual([MINE]);
  });

  // Round 14: reopened while its close save ran, the draft opened the copy from
  // before that save, and its next Save was refused over the person's own change.
  it("reopened while its own close save runs, waits for the save and the read after it", async () => {
    let answer: (response: Response) => void = () => {};
    patch.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const { result } = setup();
    const opened = leadToFormData(draft());
    const changes: Partial<LeadFormData> = { phone_numbers: [MINE, THEIRS] };

    act(() => result.current.form.onSaveDraft({ ...opened, ...changes }, changes, opened));
    act(() => result.current.form.onOpenChange(false));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    act(() => result.current.resume(draft()));
    expect(result.current.form.open).toBe(false);

    stored.lead = draft({ phone_numbers: [MINE, THEIRS] });
    await act(async () => answer(ok()));
    await waitFor(() => expect(result.current.form.open).toBe(true));
    expect(result.current.form.initialData?.phone_numbers).toEqual([MINE, THEIRS]);
  });
});

describe("useResumedDraft: closing with changes", () => {
  it("sends only the changes with their lists as opened, and leaves the draft mark and the owner alone", async () => {
    patch.mockResolvedValueOnce(ok());
    const { result } = setup();
    const opened = leadToFormData(draft());
    const changes: Partial<LeadFormData> = { management_name: "Typed", phone_numbers: [MINE, THEIRS] };

    act(() => result.current.form.onSaveDraft({ ...opened, ...changes }, changes, opened));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ management_name: "Typed", phone_numbers: [MINE, THEIRS], was: { phone_numbers: [MINE] } });
  });

  it("keeps the placeholder name when the name was cleared", async () => {
    patch.mockResolvedValueOnce(ok());
    const { result } = setup();
    const opened = leadToFormData(draft());

    act(() => result.current.form.onSaveDraft({ ...opened, merchant_name: "" }, { merchant_name: "" }, opened));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ merchant_name: "Untitled draft" });
  });

  it("sends nothing when nothing changed", () => {
    const { result } = setup();
    const opened = leadToFormData(draft());

    act(() => result.current.form.onSaveDraft(opened, {}, opened));

    expect(patch).not.toHaveBeenCalled();
  });

  it("says so when the save fails", async () => {
    patch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Failed to update lead" }), { status: 500 }));
    const { result } = setup();
    const opened = leadToFormData(draft());

    act(() => result.current.form.onSaveDraft({ ...opened, management_name: "Typed" }, { management_name: "Typed" }, opened));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't save the draft: Failed to update lead"));
  });

  it("says to open the draft again when a colleague changed its lists", async () => {
    patch.mockResolvedValueOnce(clash());
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

// Round 15: a draft a colleague deleted opened as if it were there; Save said
// only "Lead not found", closing said "Couldn't save the draft: Lead not found",
// and the row stayed on the list.
describe("useResumedDraft: a draft a colleague deleted", () => {
  const gone = () => new Response(JSON.stringify({ error: LEAD_GONE }), { status: 404 });

  it("closes once its read finds it gone, says so once, and the list reads again", async () => {
    adminFetch.mockImplementation(async (url: string, init?: RequestInit) => (init?.method === "PATCH" ? patch(url, init) : gone()));
    const { result, invalidated } = setup();

    await waitFor(() => expect(result.current.form.open).toBe(false));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(LEAD_GONE, { id: LEAD_GONE_TOAST });
    expect(invalidated).toContainEqual(["leads"]);
  });

  it("a Save refused as deleted says so in the same words, and the form closes", async () => {
    patch.mockResolvedValueOnce(gone());
    const { result, invalidated } = setup();
    await waitFor(() => expect(result.current.form.initialData).toBeDefined());
    adminFetch.mockImplementation(async (url: string, init?: RequestInit) => (init?.method === "PATCH" ? patch(url, init) : gone()));
    const opened = leadToFormData(draft());
    const changes: Partial<LeadFormData> = { merchant_name: "Kawkab" };

    await act(async () => {
      await expect(result.current.form.onSubmit({ ...opened, ...changes }, changes, opened)).rejects.toThrow(LEAD_GONE);
    });

    await waitFor(() => expect(result.current.form.open).toBe(false));
    expect(invalidated).toContainEqual(["leads"]);
  });

  it("a close save refused as deleted says the lead page's words once", async () => {
    patch.mockResolvedValueOnce(gone());
    const { result } = setup();
    const opened = leadToFormData(draft());

    act(() => result.current.form.onSaveDraft({ ...opened, management_name: "Typed" }, { management_name: "Typed" }, opened));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(LEAD_GONE, { id: LEAD_GONE_TOAST }));
  });
});

// Round 15: a second save while a close save ran replaced the first one's
// callbacks. Draft A's refusal said nothing, so its change was lost silently,
// and A reopened at once with its old copy because "saving" followed draft B.
describe("useResumedDraft: two saves at once", () => {
  it("a Save on another draft keeps the first close save's failure toast and its wait", async () => {
    const A = draft();
    const B = draft({ id: "9d8c7b6a-5f4e-4d3c-8b2a-0f1e2d3c4b5a", merchant_name: "Draft B" });
    let answerA: (response: Response) => void = () => {};
    patch.mockImplementation((url: string) =>
      url.endsWith(A.id) ? new Promise<Response>((resolve) => (answerA = resolve)) : Promise.resolve(ok()),
    );
    // Each draft reads as itself.
    adminFetch.mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === "PATCH"
        ? patch(url, init)
        : new Response(JSON.stringify({ lead: url.endsWith(A.id) ? A : B, activities: [], follow_ups: [], social_links: [], competitors: [] })),
    );
    const { result } = setup([A, B]);
    const openedA = leadToFormData(A);

    act(() => result.current.form.onSaveDraft({ ...openedA, phone_numbers: [] }, { phone_numbers: [] }, openedA));
    act(() => result.current.form.onOpenChange(false));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));

    act(() => result.current.resume(B));
    expect(result.current.form.open).toBe(true);
    const openedB = leadToFormData(B);
    await act(async () => {
      await expect(result.current.form.onSubmit({ ...openedB, merchant_name: "Kawkab" }, { merchant_name: "Kawkab" }, openedB)).resolves.toBe(true);
    });
    expect(patch.mock.calls[1][0]).toBe(`/api/leads/${B.id}`);
    act(() => result.current.form.onOpenChange(false));

    act(() => result.current.resume(A));
    expect(result.current.form.open).toBe(false);

    await act(async () => answerA(clash()));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Your changes to the draft were not saved: a colleague changed its phones meanwhile. Open the draft again to make them.",
      ),
    );
    await waitFor(() => expect(result.current.form.open).toBe(true));
  });
});
