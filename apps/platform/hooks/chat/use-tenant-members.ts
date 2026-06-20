import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export interface TenantMember {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    role: string;
}

/**
 * All active members of the current tenant with their profile.
 * Authoritative source for resolving chat sender names/avatars (covers
 * offline users, unlike presence) and for @mention pickers.
 *
 * Tenant scoping is enforced by the `tenant_members` RLS SELECT policy
 * (caller only sees rows of their own tenant); the query keys on tenantId
 * so the cache stays per-tenant.
 */
export function useTenantMembers() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["chat", "tenant-members", tenantId],
        enabled: !!tenantId,
        staleTime: 60_000,
        queryFn: async (): Promise<TenantMember[]> => {
            const { data, error } = await supabase
                .from("tenant_members")
                .select("user_id, status, user_profiles!inner(display_name, avatar_url, role)")
                .eq("status", "active");
            if (error) throw error;
            // The browser client is untyped here, so the embedded relation comes
            // back as `unknown`; cast to a narrow row shape and normalize.
            type Profile = { display_name: string | null; avatar_url: string | null; role: string | null };
            type Row = { user_id: string; user_profiles: Profile | Profile[] };
            return ((data ?? []) as unknown as Row[]).map((r) => {
                const p = Array.isArray(r.user_profiles) ? r.user_profiles[0] : r.user_profiles;
                return {
                    user_id: r.user_id,
                    display_name: p?.display_name ?? "Teammate",
                    avatar_url: p?.avatar_url ?? null,
                    role: p?.role ?? "member",
                };
            });
        },
    });
}
