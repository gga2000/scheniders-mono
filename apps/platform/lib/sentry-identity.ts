/**
 * The Sentry scope identity for the signed-in session: who, which tenant, and
 * which role. A signed-out session clears all three, so a shared machine does
 * not attribute the next session's errors to the previous user.
 */
export interface SentryIdentity {
    user: { id: string; email?: string } | null;
    tags: { tenant_id: string | undefined; user_role: string | undefined };
}

export function sentryIdentityFor(
    userId: string | null,
    email: string | null,
    tenantId: string | null,
    role: string | null,
): SentryIdentity {
    if (!userId) {
        return { user: null, tags: { tenant_id: undefined, user_role: undefined } };
    }
    return {
        user: { id: userId, email: email ?? undefined },
        tags: { tenant_id: tenantId ?? "none", user_role: role ?? "unknown" },
    };
}
