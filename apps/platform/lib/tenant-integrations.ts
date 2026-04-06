import { supabase } from "@/lib/supabase";

export type IntegrationProvider = "lightfunnels" | "interakt" | "waseet";

export interface TenantIntegration {
    id: string;
    tenant_id: string;
    provider: IntegrationProvider;
    credentials: Record<string, string>;
    is_active: boolean;
    connected_at: string | null;
}

/**
 * Fetch integration credentials for a tenant.
 * Returns null if not configured or inactive.
 */
export async function getIntegrationCredentials(
    tenantId: string,
    provider: IntegrationProvider
): Promise<Record<string, string> | null> {
    const { data, error } = await supabase
        .from("tenant_integrations")
        .select("credentials, is_active")
        .eq("tenant_id", tenantId)
        .eq("provider", provider)
        .single();

    if (error || !data || !data.is_active) return null;
    return data.credentials;
}

/**
 * Save or update integration credentials for a tenant.
 */
export async function saveIntegrationCredentials(
    tenantId: string,
    provider: IntegrationProvider,
    credentials: Record<string, string>,
    isActive: boolean = true
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from("tenant_integrations")
        .upsert({
            tenant_id: tenantId,
            provider,
            credentials,
            is_active: isActive,
            connected_at: isActive ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
        }, { onConflict: "tenant_id,provider" });

    if (error) return { success: false, error: error.message };
    return { success: true };
}

/**
 * List all integrations for a tenant.
 */
export async function listTenantIntegrations(
    tenantId: string
): Promise<TenantIntegration[]> {
    const { data, error } = await supabase
        .from("tenant_integrations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("provider");

    if (error) return [];
    return data as TenantIntegration[];
}
