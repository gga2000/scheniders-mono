// The outline WhatsApp mark (ring + handset, no filled disc) for a light
// glyph on a dark surface — the express dock's WhatsApp segment. The
// filled WhatsAppIcon keeps every existing caller (primitives baseline).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WhatsAppIcon, WhatsAppOutlineIcon } from "./helpers/primitives";

describe("WhatsAppOutlineIcon", () => {
  const html = renderToStaticMarkup(<WhatsAppOutlineIcon className="h-5 w-5" />);

  it("is a decorative currentColor glyph with no colour of its own", () => {
    expect(html).toMatch(/^<svg viewBox="0 0 24 24"/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('class="h-5 w-5"');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(|drop-shadow/);
  });

  it("draws the outline mark, not the filled one", () => {
    expect(html).toContain('d="M17.472 14.382');
    const filled = renderToStaticMarkup(<WhatsAppIcon shadow={false} />);
    expect(filled).toContain('d="M12.031 6.172');
    expect(filled).not.toBe(html);
  });
});
