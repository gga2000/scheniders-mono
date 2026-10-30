"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { hasMcpAccess } from "@/lib/mcp/caller";

const decisionSchema = z.object({
    authorization_id: z.string().min(1).max(200),
    decision: z.enum(["approve", "deny"]),
});

/**
 * Approve or deny a Claude (OAuth) connection request for the signed-in user.
 * Supabase Auth ties the authorization id to the user who opened it, so one
 * user cannot approve another's request; the access list is re-checked here
 * because a server action is reachable without the page.
 */
export async function decideAuthorization(formData: FormData): Promise<void> {
    const parsed = decisionSchema.safeParse({
        authorization_id: formData.get("authorization_id"),
        decision: formData.get("decision"),
    });
    if (!parsed.success) redirect("/oauth/consent?error=invalid");
    const { authorization_id: authorizationId, decision } = parsed.data;

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);

    const approve = decision === "approve" && (await hasMcpAccess(user.id));
    const { data, error } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data) {
        redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&error=decision`);
    }
    redirect(data.redirect_url);
}
