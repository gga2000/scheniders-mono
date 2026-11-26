/**
 * Test stand-in for `@/lib/supabase-server` when a test sends an Interakt
 * order template: `loadStoreContact` reads the store's name and WhatsApp
 * number from `tenants`, and this answers with one fixed store.
 * `loadCustomTemplate` reads `whatsapp_custom_templates`, which answers with
 * no custom message unless a test sets one with `setTestCustomTemplate`.
 *
 *   vi.mock("@/lib/supabase-server", async () =>
 *       (await import("@/lib/testing/store-contact-service-client")).storeContactSupabaseServer);
 */
export const TEST_STORE_NAME = "عطور الكرادة";
export const TEST_STORE_WHATSAPP = "07801234567";

export interface TestCustomTemplateRow {
    template_name: string;
    body: string;
    category: "utility" | "marketing";
}

let customTemplate: TestCustomTemplateRow | null = null;

/** The shop's approved, switched-on custom message for the next sends (null: none). */
export function setTestCustomTemplate(row: TestCustomTemplateRow | null): void {
    customTemplate = row;
}

/** A query that ignores its filters and answers `maybeSingle` with `data`. */
function answer(data: () => unknown) {
    const query = {
        eq: () => query,
        maybeSingle: async () => ({ data: data(), error: null }),
    };
    return query;
}

export const storeContactSupabaseServer = {
    createSupabaseServiceClient: () => ({
        from: (table: string) => ({
            select: () =>
                table === "whatsapp_custom_templates"
                    ? answer(() => customTemplate)
                    : answer(() => ({
                          business_name: TEST_STORE_NAME,
                          contact_phone: null,
                          store_config: { contact: { whatsapp_number: TEST_STORE_WHATSAPP } },
                      })),
        }),
    }),
};
