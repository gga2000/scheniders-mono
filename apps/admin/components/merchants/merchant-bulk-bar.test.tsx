// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/*
 * /api/bulk takes at most 100 shops. Staff ticked 150, opened Extend Trial,
 * typed the reason and only learned of the limit at Confirm. The bar says it
 * as soon as more than 100 are ticked and keeps the /api/bulk steps off;
 * Export (up to 5,000) stays on.
 */

vi.mock("@/hooks/use-admin-auth", () => ({ useCan: () => () => true }));

const { MerchantBulkBar } = await import("./merchant-bulk-bar");
const bar = (selectedCount: number) =>
  render(<MerchantBulkBar selectedCount={selectedCount} onClearSelection={() => {}} onBulkAction={() => {}} />);
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

afterEach(cleanup);

describe("MerchantBulkBar over 100 shops", () => {
  it("says the limit and keeps the bulk steps off, Export on", () => {
    bar(150);

    expect(screen.getByRole("status").textContent).toBe("Pick at most 100 shops (150 ticked).");
    expect(button("Top Up").disabled).toBe(true);
    expect(button("Extend Trial").disabled).toBe(true);
    expect(button("Change Plan").disabled).toBe(true);
    expect(button("Export").disabled).toBe(false);
  });

  it("says nothing and keeps every step on at 100", () => {
    bar(100);

    expect(screen.queryByRole("status")).toBeNull();
    for (const name of ["Top Up", "Extend Trial", "Change Plan", "Export"]) expect(button(name).disabled).toBe(false);
  });
});
