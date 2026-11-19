import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaffReasonInput } from "./staff-reason-input";

/*
 * Round 19 (UX new 3): "Write a reason with at least 3 letters." showed in 2
 * of 12 forms; the other 10 only greyed their button. "Qi 4471", a receipt
 * number, has 2 letters and nothing said why. The shared input now says it.
 */

const draw = (value: string) => renderToStaticMarkup(createElement(StaffReasonInput, { value, onChange: () => {} }));
const RULE = "Write a reason with at least 3 letters.";

describe("the staff reason box", () => {
  it.each(["ok", "...", "Qi 4471", "a.b"])("says the rule under itself for %j", (value) => {
    const html = draw(value);
    expect(html).toContain(RULE);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="([^"]+)"[\s\S]*id="\1"/);
  });

  it.each(["", "   "])("says nothing before anything is typed (%j)", (value) => {
    expect(draw(value)).not.toContain(RULE);
  });

  it.each(["Cash at the office", "نقد"])("says nothing once the reason is long enough (%j)", (value) => {
    const html = draw(value);
    expect(html).not.toContain(RULE);
    expect(html).not.toContain("aria-invalid");
  });
});
