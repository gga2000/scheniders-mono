import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { StoreConfigV2 } from "@scheniders/shared";
import { env } from "@/lib/env";
import { OnboardingWizard } from "@/components/store-onboarding/onboarding-wizard";
import { FALLBACK_INDUSTRIES, type WizardIndustry } from "@/lib/starter-store";

/**
 * Post-signup onboarding. Only a genuinely fresh store reaches the wizard:
 * a tenant that already has a published config OR a draft is bounced
 * straight to the editor (the seed RPC would no-op anyway).
 */
interface TenantMemberRow {
    tenant_id: string;
    tenants: {
        id: string;
        business_name: string;
        contact_phone: string | null;
        store_config_v2: StoreConfigV2 | null;
        store_config_v2_draft: StoreConfigV2 | null;
    } | null;
}

async function getServerSupabase() {
    const cookieStore = await cookies();
    return createServerClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll() {
                    // No-op in a Server Component.
                },
            },
        },
    );
}

export default async function StoreOnboardingPage() {
    const supabase = await getServerSupabase();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: member } = await supabase
        .from("tenant_members")
        .select(
            "tenant_id, tenants(id, business_name, contact_phone, store_config_v2, store_config_v2_draft)",
        )
        .eq("user_id", user.id)
        .single<TenantMemberRow>();

    if (!member?.tenants) redirect("/store");

    const t = member.tenants;

    // Already has a store (published or draft) → onboarding is done.
    if (t.store_config_v2 || t.store_config_v2_draft) {
        redirect("/store/edit");
    }

    const { data: industriesData } = await supabase
        .from("industries")
        .select("id, name, name_ar, icon, recommended_template_id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

    const industries: WizardIndustry[] =
        industriesData && industriesData.length > 0
            ? (industriesData as WizardIndustry[])
            : FALLBACK_INDUSTRIES;

    return (
        <OnboardingWizard
            tenantId={t.id}
            defaultBusinessName={t.business_name}
            defaultWhatsapp={t.contact_phone ?? undefined}
            industries={industries}
        />
    );
}
