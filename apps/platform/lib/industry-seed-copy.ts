// =====================================================================
// Industry seed copy — now a thin door onto the content packs
// =====================================================================
// The wizard's "what do you sell?" answer resolves to a content pack
// (`store-templates/content-packs`), which is overlaid onto whichever
// direction the merchant picked. The earlier hand-written packs carried
// invented customer reviews into every new store; the packs do not.
// =====================================================================

import type { StoreConfigV2 } from "@scheniders/shared";
import { applyContentPack, resolveContentPack } from "./store-templates/content-packs";

/** Pack id for an industry id or name; the general pack when unknown. */
export function resolveIndustryPackId(idOrName: string | undefined): string {
    return resolveContentPack(idOrName).id;
}

/** Overlay the industry's content pack onto every seeded page IN PLACE. */
export function applyIndustrySeedCopy(cfg: StoreConfigV2, industryId: string | undefined): void {
    applyContentPack(cfg, resolveContentPack(industryId));
}
