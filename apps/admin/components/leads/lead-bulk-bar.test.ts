import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * The bar's buttons say what they do: "Mark contacted" (it always sets
 * contacted), "Assign to me", and Delete only for a login that may delete.
 */

vi.mock("@/hooks/use-lead-mutations", () => ({
  useBulkLeadAction: () => ({ mutate: () => {}, isPending: false }),
}));

const { LeadBulkBar } = await import("./lead-bulk-bar");
const render = (role: "super_admin" | "support_staff") =>
  renderToStaticMarkup(createElement(LeadBulkBar, { selectedIds: ["a", "b"], role, onClear: () => {} }));

describe("the leads bulk bar", () => {
  it("names what each button does", () => {
    const html = render("super_admin");
    expect(html).toContain("2 selected");
    expect(html).toContain("Mark contacted");
    expect(html).toContain("Assign to me");
    expect(html).toContain("Delete");
  });

  it("shows Delete only to a login that may delete leads", () => {
    expect(render("support_staff")).not.toContain("Delete");
  });
});
