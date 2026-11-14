/**
 * Test stand-in for `@/lib/supabase-server` when a test sends an Interakt
 * order template: `loadStoreContact` reads the store's name and WhatsApp
 * number from `tenants`, and this answers with one fixed store.
 *
 *   vi.mock("@/lib/supabase-server", async () =>
 *       (await import("@/lib/testing/store-contact-service-client")).storeContactSupabaseServer);
 */
export const TEST_STORE_NAME = "عطور الكرادة";
export const TEST_STORE_WHATSAPP = "07801234567";

export const storeContactSupabaseServer = {
    createSupabaseServiceClient: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({
                        data: {
                            business_name: TEST_STORE_NAME,
                            contact_phone: null,
                            store_config: { contact: { whatsapp_number: TEST_STORE_WHATSAPP } },
                        },
                        error: null,
                    }),
                }),
            }),
        }),
    }),
};
