// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/*
 * Staff console audit W-04: a pick on a card's plan chip moved the shop at
 * once, and the card showed the new plan before the server answered. A pick
 * now opens a confirm that names the shop and the move and asks why; nothing
 * is sent before "Move to ...", and the card keeps its plan when refused.
 */

const send = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));
vi.mock("@/lib/admin-fetch", () => ({ adminFetch: send }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { MerchantPlanDropdown } = await import("./merchant-plan-dropdown");

const SHOP = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";

function open() {
  const view = render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(MerchantPlanDropdown, { merchantId: SHOP, plan: "starter", shopName: "Kut Perfumes" }),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /Start/ }));
  fireEvent.click(screen.getByRole("button", { name: /Internal \(no billing\)/ }));
  return view;
}

afterEach(() => {
  cleanup();
  send.mockReset();
});

describe("the Merchants plan chip", () => {
  it("names the shop and the move, and sends nothing on the pick", () => {
    open();
    expect(screen.getByRole("dialog").textContent).toContain(
      "Kut Perfumes moves from Start to Internal (no billing) now. Nothing is charged and nothing is refunded.",
    );
    const move = screen.getByRole("button", { name: "Move to Internal (no billing)" }) as HTMLButtonElement;
    expect(move.disabled).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the plan with the reason once the move is pressed", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Our own test shop" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to Internal (no billing)" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const [url, init] = send.mock.calls[0];
    expect(url).toBe(`/api/merchants/${SHOP}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ plan: "internal", reason: "Our own test shop" });
  });

  it("says the server's refusal in the menu and keeps the chip on the old plan", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ error: "Only a super admin can change the plan." }), { status: 403 }));
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Our own test shop" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to Internal (no billing)" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Only a super admin can change the plan.");
    expect(screen.getByRole("button", { name: /Start/ })).toBeTruthy();
  });

  it("stays open while the move runs, so a slow refusal is still said", async () => {
    // Round 17 (Workflow new 3): Escape, a click outside or Cancel closed the
    // menu during "Moving...", and a refusal that came back then was never shown.
    let answer: (res: Response) => void = () => {};
    send.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Our own test shop" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to Internal (no billing)" }));
    await screen.findByRole("button", { name: "Moving..." });
    const cancel = screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole("dialog")).toBeTruthy();
    answer(new Response(JSON.stringify({ error: "Only a super admin can change the plan." }), { status: 403 }));
    expect((await screen.findByRole("alert")).textContent).toBe("Only a super admin can change the plan.");
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("draws the confirm over the page, so the card cannot cut it off", () => {
    // Seen live after #1482: the card clips what sticks out of it, and the
    // confirm is wider than the card, so its left side was cut away.
    const { container } = open();
    const dialog = screen.getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("Cancel closes the confirm without sending", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
