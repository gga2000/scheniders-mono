// =====================================================================
// Section — html_embed
// =====================================================================
// Custom HTML escape hatch. Renders user-authored HTML inside a sandboxed
// iframe via `srcdoc`. The iframe sandbox carries `allow-scripts` AND
// `allow-same-origin` — the latter is required for many third-party
// embeds (YouTube, Twitter, TikTok) but means the iframe is not a strict
// cross-origin boundary; the merchant trades isolation for compatibility.
// =====================================================================

"use client";

import { z } from "zod";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const pillBg = z.enum(["mint", "butter", "sky", "lilac", "pink"]);

const schema = z.object({
  html: z.string(),
  height_px: z.number().min(40).max(2000).default(400),
  bg: pillBg.optional(),
});

type Props = z.infer<typeof schema>;

const PLACEHOLDER_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; height: 100%; }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #1a1a1a;
        background: #fafafa;
        text-align: center;
        padding: 24px;
      }
      .hint { max-width: 320px; }
      .hint .t { font-weight: 700; margin-bottom: 6px; }
      .hint .d { font-size: 13px; color: #555; }
    </style>
  </head>
  <body>
    <div class="hint">
      <div class="t">Edit this HTML in the section panel</div>
      <div class="d">Paste an embed snippet (YouTube, Twitter, custom HTML) and it'll render right here.</div>
    </div>
  </body>
</html>`;

const defaultProps: Props = {
  html: PLACEHOLDER_HTML,
  height_px: 400,
};

function HtmlEmbedRender({
  props,
}: {
  props: Props;
  ctx: SectionRenderContext;
}): React.ReactElement {
  // Static map: an interpolated class is never emitted by Tailwind, and the
  // candy palette is not the tenant's.
  const BG_CLASS: Record<string, string> = {
    mint: "bg-bk-mint",
    butter: "bg-bk-accent text-bk-on-accent",
    sky: "bg-bk-sky",
    lilac: "bg-bk-lilac",
    cream: "bg-bk-surface",
    pink: "bg-bk-primary text-bk-on-primary",
    ink: "bg-bk-ink text-bk-surface",
    white: "bg-bk-surface-alt",
  };
  const bgClass = props.bg ? BG_CLASS[props.bg] : undefined;
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

const definition: SectionDefinition<Props> = {
  type: "html_embed",
  category: "content",
  name: { en: "Custom HTML", ar: "HTML مخصّص" },
  description: {
    en: "Embed any HTML snippet (YouTube, Twitter, custom widgets) inside a sandboxed iframe.",
    ar: "أضف أي مقطع HTML (يوتيوب، تويتر، أدوات مخصّصة) داخل إطار آمن.",
  },
  thumbnail: "/sections/html_embed.svg",
  // EC6: deliberately NOT allowed on cart/checkout/checkout_success — a
  // merchant-authored embed must never run on the COD conversion path where
  // it could skim form input or read cart state.
  valid_on: [
    "home",
    "category",
    "product",
    "search",
    "track",
    "about",
    "faq",
    "contact",
    "policy_shipping",
    "policy_returns",
    "policy_privacy",
    "policy_terms",
    "not_found",
  ],
  schema,
  defaultProps,
  render: HtmlEmbedRender,
};

registerSection(definition);
export default definition;
