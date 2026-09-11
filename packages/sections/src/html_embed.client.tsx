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

export function HtmlEmbedRender({
  props,
}: {
  props: Props;
  ctx: SectionRenderContext;
}): React.ReactElement {
  const bgClass = props.bg ? `bg-candy-${props.bg}` : undefined;
  return (
    <section className={bgClass ? `${bgClass} py-6` : "py-6"}>
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
