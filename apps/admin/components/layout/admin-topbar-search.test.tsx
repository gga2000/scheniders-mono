// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/*
 * The Merchants search in the top bar read a server error or a lost
 * connection as "No results", so staff took a shop that exists for one that
 * does not. It now says the search did not load, and an older answer that
 * arrives after a newer one is dropped.
 */

// The console's API calls go through adminFetch, which adds the session's
// token; here it passes each call to the fetch the test answers.
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: (input: string, init?: RequestInit) => fetch(input, init) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/merchants", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/shared/notification-bell", () => ({ NotificationBell: () => null }));

const { AdminTopbar } = await import("./admin-topbar");

const shop = (id: string, business_name: string) => ({ id, business_name, plan: "starter", status: "active", city: null });
const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const search = (text: string) => fireEvent.change(screen.getByPlaceholderText("Search merchants..."), { target: { value: text } });

describe("AdminTopbar merchant search", () => {
  it("says the search did not load when the server answers an error, never 'No results'", async () => {
    fetchMock.mockImplementation(() => answer(500, { error: "Failed to fetch merchants" }));
    render(<AdminTopbar user={null} />);

    search("Kawkab");

    expect((await screen.findByRole("alert")).textContent).toBe("The search did not load. Try again.");
    expect(screen.queryByText("No results")).toBeNull();
  });

  it("says the search did not load when the connection drops", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    render(<AdminTopbar user={null} />);

    search("Kawkab");

    expect(await screen.findByText("The search did not load. Try again.")).toBeTruthy();
  });

  it("says 'No results' only when the search answered with none", async () => {
    fetchMock.mockImplementation(() => answer(200, { merchants: [] }));
    render(<AdminTopbar user={null} />);

    search("Nobody");

    expect(await screen.findByText("No results")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drops an older answer that arrives after the newer one", async () => {
    let answerOld: (r: Response) => void = () => {};
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answerOld = resolve)))
      .mockReturnValueOnce(answer(200, { merchants: [shop("b", "Kawkab Baghdad")] }));
    render(<AdminTopbar user={null} />);

    search("Kaw");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    search("Kawkab B");
    expect(await screen.findByText("Kawkab Baghdad")).toBeTruthy();

    answerOld(new Response(JSON.stringify({ merchants: [shop("a", "Kawthar")] }), { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByText("Kawthar")).toBeNull();
    expect(screen.getByText("Kawkab Baghdad")).toBeTruthy();
  });
});
