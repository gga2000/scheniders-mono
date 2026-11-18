// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/*
 * Home's Seed Automation switch showed "off" when its state could not be
 * read. It now offers no switch it cannot back: the button is disabled and
 * says the state could not be read.
 */

// The console's API calls go through adminFetch, which adds the session's
// token; here it passes each call to the fetch the test answers.
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: (input: string, init?: RequestInit) => fetch(input, init) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));

const { SeedAutomationToggle } = await import("./seed-automation-toggle");

const answer = (status: number, body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SeedAutomationToggle", () => {
  it("is disabled and says so when the state could not be read", async () => {
    vi.stubGlobal("fetch", vi.fn(answer(500, { error: "Could not read whether Seed Automation is on." })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SeedAutomationToggle />);

    const button = await screen.findByRole("button", { name: "Seed Automation: Could not read whether Seed Automation is on." });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers the switch once the state is read", async () => {
    vi.stubGlobal("fetch", vi.fn(answer(200, { active: false, jobs: [] })));
    render(<SeedAutomationToggle />);

    const button = await screen.findByRole("button", { name: /Seed Automation/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("title")).toBeNull();
  });
});
