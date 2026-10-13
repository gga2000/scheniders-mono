// =====================================================================
// Section — html_embed
// =====================================================================
// Custom HTML escape hatch. Renders user-authored HTML inside a sandboxed
// iframe via `srcdoc`. The iframe sandbox carries `allow-scripts` AND
// `allow-same-origin` — the latter is required for many third-party
// embeds (YouTube, Twitter, TikTok) but means the iframe is not a strict
// cross-origin boundary; the merchant trades isolation for compatibility.
// =====================================================================
// Client half of `html_embed` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./html_embed.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import type { SectionRenderContext } from "./_types";
import type { Props } from "./html_embed";

/**
 * Legacy Candy background → brand token. `mint`/`butter`/`pink` have exact
 * brand-kit equivalents; `sky`/`lilac` have no brand slot and take the
 * decorative surfaces. Enum values are stored config and must not change.
 */
const EMBED_BG: Record<NonNullable<Props["bg"]>, string> = {
  mint: "var(--bk-secondary, #7cf0bd)",
  butter: "var(--bk-accent, #ffd84a)",
  sky: "var(--bk-decor-c, #9ad8ff)",
  lilac: "var(--bk-decor-b, #c5b6ff)",
  pink: "var(--bk-primary, #ff5a8a)",
};

export function HtmlEmbedRender({
  props,
}: {
  props: Props;
  ctx: SectionRenderContext;
}): React.ReactElement {
  // Interpolating the class name (`bg-candy-${props.bg}`) meant Tailwind
  // never saw it: the utilities only existed because other sections happened
  // to spell them out literally. Resolve to a brand token instead, so the
  // background follows the tenant's kit and cannot be purged.
  return (
    <section className="py-6" style={props.bg ? { backgroundColor: EMBED_BG[props.bg] } : undefined}>
      {/*
        SECURITY (EC6): NO allow-same-origin. With `srcdoc`, allow-same-origin
        would put the embed in the PARENT origin — embedded JS could read the
        storefront's cookies / localStorage (cart, auth) and skim checkout
        input. Legit embeds (YouTube/Twitter) load their own cross-origin
        `src` inside the snippet, so they work fine in an opaque-origin
        sandbox. This section is also excluded from cart/checkout via valid_on.
      */}
      <iframe
        title="Custom HTML embed"
        srcDoc={props.html}
        sandbox="allow-scripts allow-popups allow-forms"
        style={{
          border: 0,
          width: "100%",
          height: `${props.height_px}px`,
          display: "block",
        }}
      />
    </section>
  );
}
