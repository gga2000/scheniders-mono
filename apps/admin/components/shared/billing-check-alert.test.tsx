// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BillingCheckAlert, type BillingCheck } from "./billing-check-alert";

/*
 * Round 21 (UX new 6): the bell said "Month ended, not renewed: <names>",
 * while the shop page's "Not renewed" means renewal is off, a month left
 * unrenewed on purpose. And staff had to search for each name.
 */

const row = (n: number, name: string | null = `Shop ${n}`) => ({
  tenant_id: `0000000${n}-7f3e-4c1a-9d2e-1a2b3c4d5e6f`,
  business_name: name,
  due: "2026-11-17T03:21:00Z",
});

afterEach(cleanup);

describe("the bell's renewal job row", () => {
  it("names the job, not a stopped renewal, and links each shop to its page", () => {
    const onOpen = vi.fn();
    const check: BillingCheck = { trialsNotBilled: [row(1)], renewalsMissed: [row(2), row(3, null)] };
    render(createElement(BillingCheckAlert, { check, onOpen }));

    const box = screen.getByTestId("billing-check-alert");
    expect(box.textContent).toBe(
      "The daily renewal job missed shopsTrials it did not reach: Shop 1Months it did not reach: Shop 2, 00000003",
    );
    expect(box.textContent).not.toMatch(/not renewed/i);
    expect(screen.getByRole("link", { name: "Shop 2" }).getAttribute("href")).toBe(`/merchants/${row(2).tenant_id}`);
    expect(screen.getByRole("link", { name: "00000003" }).getAttribute("href")).toBe(`/merchants/${row(3).tenant_id}`);

    fireEvent.click(screen.getByRole("link", { name: "Shop 1" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("links three shops and counts the rest", () => {
    const check: BillingCheck = { trialsNotBilled: [], renewalsMissed: [row(1), row(2), row(3), row(4), row(5)] };
    render(createElement(BillingCheckAlert, { check }));

    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByText(/Months it did not reach:/).textContent).toBe("Months it did not reach: Shop 1, Shop 2, Shop 3 +2");
  });
});
