import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadFailure } from "@/lib/load-failure";
import { LoadError } from "./load-error";

/*
 * A support login that opened Billing got a 403 and saw "0 IQD, No wallets
 * found". The screen now says which of three things happened, and offers
 * "Try again" only when asking again can give another answer.
 */

const render = (error?: unknown) =>
  renderToStaticMarkup(createElement(LoadError, { what: "the wallets", onRetry: () => {}, error }));

describe("LoadError", () => {
  it("says the page could not load and offers to try again", () => {
    for (const error of [undefined, new Error("fetch failed"), new LoadFailure(500, "the wallets")]) {
      const html = render(error);
      expect(html).toContain("Could not load the wallets");
      expect(html).toContain("Try again");
      expect(html).not.toContain("Sign in");
    }
  });

  it("tells a login that may not open the page so, with no button to press", () => {
    const html = render(new LoadFailure(403, "the wallets"));
    expect(html).toContain("Your login cannot open the wallets");
    expect(html).toContain("Ask a super admin");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Could not load");
  });

  it("sends an ended sign-in to the login page", () => {
    const html = render(new LoadFailure(401, "the wallets"));
    expect(html).toContain("Your sign-in has ended");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("Try again");
  });

  it("is announced as an alert in every case", () => {
    for (const status of [401, 403, 500]) {
      expect(render(new LoadFailure(status, "the wallets"))).toContain('role="alert"');
    }
  });
});
