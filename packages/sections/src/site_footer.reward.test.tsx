// =====================================================================
// The newsletter reward must not cross the client boundary
// =====================================================================
// `SiteFooterRender` is a client component, so every prop it receives is
// serialized into the RSC payload of every page the footer appears on.
// Merchants put the signup reward in the success line ("your code is
// WELCOME15"), which made the coupon readable in page source without ever
// subscribing — confirmed live: 5 occurrences on the home page. It now
// travels back with the /api/newsletter response instead.
//
// This tests the stripping directly. A markup assertion would pass either
// way: renderToStaticMarkup produces no RSC payload, and the success line
// only renders after a successful submit, so the leak is invisible to it.
// The end-to-end behaviour was verified in a browser (5 occurrences -> 1,
// the survivor being commerce.discounts, which cart and checkout read).
// =====================================================================

import { describe, expect, it } from "vitest";
import site_footer, { withoutNewsletterReward } from "./site_footer";

const reward = { ar: "تم الاشتراك! كود الخصم: WELCOME15", en: "Code: WELCOME15" };

const propsWith = (success?: typeof reward) => ({
  ...site_footer.defaultProps,
  newsletter: {
    enabled: true,
    copy_i18n: { ar: "اشترك", en: "Subscribe" },
    ...(success ? { success_i18n: success } : {}),
  },
});

describe("withoutNewsletterReward", () => {
  it("withholds the success line from the client component", () => {
    const safe = withoutNewsletterReward(propsWith(reward) as never);
    expect(safe.newsletter?.success_i18n).toBeUndefined();
    expect(JSON.stringify(safe)).not.toContain("WELCOME15");
  });

  it("keeps the rest of the newsletter block intact", () => {
    // Withhold the reward, not the capture.
    const safe = withoutNewsletterReward(propsWith(reward) as never);
    expect(safe.newsletter?.enabled).toBe(true);
    expect(safe.newsletter?.copy_i18n).toEqual({ ar: "اشترك", en: "Subscribe" });
  });

  it("returns the very same object when there is no reward to withhold", () => {
    // Back-compat: a footer without a success line must be untouched, not
    // rebuilt into an equal-but-different object.
    const props = propsWith() as never;
    expect(withoutNewsletterReward(props)).toBe(props);
  });
});
