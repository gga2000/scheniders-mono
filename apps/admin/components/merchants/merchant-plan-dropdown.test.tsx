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
const { toast } = await import("sonner");

const SHOP = "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f";
const OTHER = "6c1d0b63-8a4f-4d2b-8e3f-2b3c4d5e6f70";

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

/** Two cards on one page; the first card's move is pressed and left running. */
async function twoCardsOneMoving() {
  let answer: (res: Response) => void = () => {};
  send.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
  render(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(MerchantPlanDropdown, { merchantId: SHOP, plan: "starter", shopName: "Kut Perfumes" }),
      createElement(MerchantPlanDropdown, { merchantId: OTHER, plan: "starter", shopName: "Basra Shoes" }),
    ),
  );
  fireEvent.click(screen.getAllByRole("button", { name: /^Start/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Internal \(no billing\)/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Our own test shop" } });
  fireEvent.click(screen.getByRole("button", { name: "Move to Internal (no billing)" }));
  await screen.findByRole("button", { name: "Moving..." });
  return (res: Response) => answer(res);
}

afterEach(() => {
  cleanup();
  send.mockReset();
  vi.mocked(toast.error).mockReset();
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

  it("says a refusal that comes back after the card is gone, naming the shop", async () => {
    // Round 18: staff left the page during "Moving...", and a refusal was
    // said nowhere, while a success still showed its toast.
    let answer: (res: Response) => void = () => {};
    send.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const { unmount } = open();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Our own test shop" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to Internal (no billing)" }));
    await screen.findByRole("button", { name: "Moving..." });
    unmount();
    answer(new Response(JSON.stringify({ error: "Only a super admin can change the plan." }), { status: 403 }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Kut Perfumes was not moved to Internal (no billing). Only a super admin can change the plan.",
      ),
    );
  });

  it("does not toast a refusal the open menu already says", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ error: "Only a super admin can change the plan." }), { status: 403 }));
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Our own test shop" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to Internal (no billing)" }));
    await screen.findByRole("alert");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps another card's chip shut while a move runs, so two menus are never open at once", async () => {
    // Round 18: the running menu stays open, so a second card's chip opened a
    // second menu beside it.
    const answer = await twoCardsOneMoving();
    const other = screen.getAllByRole("button", { name: /^Start/ })[1] as HTMLButtonElement;
    expect(other.disabled).toBe(true);
    expect(other.title).toBe("Another shop's plan move is running");

    answer(new Response(JSON.stringify({ error: "Only a super admin can change the plan." }), { status: 403 }));
    await screen.findByRole("alert");
    await waitFor(() => expect((screen.getAllByRole("button", { name: /^Start/ })[1] as HTMLButtonElement).disabled).toBe(false));
  });

  it("knows its own move when the card is drawn again while the move runs", async () => {
    // Round 19 (UX new 7): staff left Merchants during "Moving..." and came
    // back. The card was drawn anew, and its own chip said "Another shop's
    // plan move is running".
    let answer: (res: Response) => void = () => {};
    send.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const client = new QueryClient();
    const card = (merchantId: string, shopName: string) =>
      createElement(MerchantPlanDropdown, { key: merchantId, merchantId, plan: "starter", shopName });
    const { unmount } = render(createElement(QueryClientProvider, { client }, card(SHOP, "Kut Perfumes")));
    fireEvent.click(screen.getByRole("button", { name: /^Start/ }));
    fireEvent.click(screen.getByRole("button", { name: /Internal \(no billing\)/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), { target: { value: "Our own test shop" } });
    fireEvent.click(screen.getByRole("button", { name: "Move to Internal (no billing)" }));
    await screen.findByRole("button", { name: "Moving..." });
    unmount();

    render(createElement(QueryClientProvider, { client }, card(SHOP, "Kut Perfumes"), card(OTHER, "Basra Shoes")));
    const [own, other] = screen.getAllByRole("button", { name: /^Start/ }) as HTMLButtonElement[];
    expect(own.disabled).toBe(true);
    expect(own.title).toBe("This shop's plan move is running");
    expect(other.disabled).toBe(true);
    expect(other.title).toBe("Another shop's plan move is running");

    answer(new Response(JSON.stringify({ success: true }), { status: 200 }));
    await waitFor(() => expect((screen.getAllByRole("button", { name: /^Start|^Internal/ })[0] as HTMLButtonElement).disabled).toBe(false));
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
