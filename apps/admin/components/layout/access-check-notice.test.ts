import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * When the browser cannot read the person's own staff row, the console keeps
 * them signed in and hides the buttons that need a role. Without a word, the
 * page would just look as if its tools had gone.
 */

let failed = false;
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ accessCheckFailed: failed, recheckAccess: () => {} }),
}));

const { AccessCheckNotice } = await import("./access-check-notice");

describe("the notice for a failed access check", () => {
  beforeEach(() => {
    failed = false;
  });

  it("is not drawn when the check worked", () => {
    expect(renderToStaticMarkup(createElement(AccessCheckNotice))).toBe("");
  });

  it("says why buttons are hidden, that the person is still signed in, and offers to try again", () => {
    failed = true;
    const html = renderToStaticMarkup(createElement(AccessCheckNotice));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not check your access, so buttons that need it are hidden.");
    expect(html).toContain("You are still signed in.");
    expect(html).toContain("Try again");
  });
});
