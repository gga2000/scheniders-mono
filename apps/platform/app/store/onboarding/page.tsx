import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { StoreConfigV2 } from "@scheniders/shared";
import { needsStoreOnboarding } from "@/lib/store-onboarding-state";
import { OnboardingWizard } from "@/components/store-onboarding/onboarding-wizard";
import { FALLBACK_INDUSTRIES, type WizardIndustry } from "@/lib/wizard-industry-types";

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


export default async function StoreOnboardingPage() {
    const supabase = await createSupabaseServerClient();

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

    // Already built (a draft, or anything beyond the sign-up default) → onboarding is done.
    if (!needsStoreOnboarding(t.store_config_v2, t.store_config_v2_draft)) {
        redirect("/store/edit");
    }

    const { data: industriesData } = await supabase
        .from("industries")
        .select("id, name, name_ar, icon, color, recommended_template_id")
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
