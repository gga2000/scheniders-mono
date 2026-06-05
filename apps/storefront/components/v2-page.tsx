import { RenderPage } from "@scheniders/sections";
import { StorefrontGlobals } from "./storefront-globals";
import type { StoreConfigV2, PageConfig, RuntimeContext } from "@scheniders/shared";
import type { SectionRenderContext } from "@scheniders/sections";

/** Renders a v2 page body wrapped by the global promo/header (top) and footer
 *  (bottom). Caller resolves the page via pickV2Page and builds runtime + renderCtx. */
export function V2Page({
  v2,
  page,
  runtime,
  renderCtx,
}: {
  v2: StoreConfigV2;
  page: PageConfig;
  runtime: RuntimeContext;
  renderCtx: Omit<SectionRenderContext, "runtime">;
}) {
  return (
    <>
      <StorefrontGlobals
        globals={v2.globals}
        runtime={runtime}
        renderCtx={renderCtx}
        slots={["promo_bar", "header"]}
      />
      <RenderPage page={page} runtime={runtime} renderCtx={renderCtx} />
      <StorefrontGlobals
        globals={v2.globals}
        runtime={runtime}
        renderCtx={renderCtx}
        slots={["footer"]}
      />
    </>
  );
}
