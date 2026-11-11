import type { StoreConfigV2 } from "@scheniders/shared";

/**
 * Has this store been through onboarding? A store with no config, or only the
 * default one published at sign-up (template.source "signup") and no draft,
 * still goes to the wizard.
 *
 * Kept apart from starter-store so the /store page can ask without bundling
 * every template.
 */
export function needsStoreOnboarding(
    published: Pick<StoreConfigV2, "template"> | null,
    draft: unknown,
): boolean {
    if (draft) return false;
    return !published || published.template?.source === "signup";
}
