// @vitest-environment jsdom
// useContactLine / ContactLineText: the "who contacts you" sentence as a
// hook and its number-in-<bdi> text, so the PDP promise band (slice 1b)
// renders the same sentence, ticking the same way, as <ContactLine>.

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode, StoreContactConfig } from "@scheniders/shared";
import { CONTACT_LINE_TICK_MS, ContactLineText, useContactLine } from "./contact-line";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Monday 2026-10-19 09:00 UTC = 12:00 Baghdad, inside the window.
const NOW = new Date("2026-10-19T09:00:00Z");
const HOURS: StoreContactConfig = {
  call_number: "07779703832",
  call_hours: { days: ["sat", "sun", "mon", "tue", "wed", "thu"], from: "10:00", to: "21:00" },
};

function Probe({ contact, locale }: { contact: StoreContactConfig | undefined; locale: LocaleCode }) {
  const line = useContactLine(contact, locale, NOW);
  return <p data-testid="probe">{line ? <ContactLineText line={line} /> : "none"}</p>;
}

describe("useContactLine", () => {
  it("returns the shared sentence with the number in a <bdi>", () => {
    const html = renderToStaticMarkup(
      <Probe contact={{ call_number: "07779703832", whatsapp_confirm: false }} locale="ar" />,
    );
    expect(html).toBe(
      '<p data-testid="probe">راح يوصلك اتصال من <bdi class="whitespace-nowrap">0777 970 3832</bdi> لتأكيد طلبك — رد علينا ويطلع طلبك</p>',
    );
  });

  it("returns null without a usable contact", () => {
    expect(renderToStaticMarkup(<Probe contact={undefined} locale="ar" />)).toBe(
      '<p data-testid="probe">none</p>',
    );
  });

  it("a timed line re-reads the clock every minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T17:59:30Z")); // 20:59:30 Baghdad
    const { getByTestId } = render(<Probe contact={HOURS} locale="ar" />);
    expect(getByTestId("probe").textContent).toContain("اليوم قبل الساعة 9 م");
    act(() => {
      vi.setSystemTime(new Date("2026-10-19T18:00:30Z")); // 21:00:30, closed
      vi.advanceTimersByTime(CONTACT_LINE_TICK_MS);
    });
    expect(getByTestId("probe").textContent).toContain("باچر من الساعة 10 ص");
  });
});
