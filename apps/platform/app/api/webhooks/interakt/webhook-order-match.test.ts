import { describe, it, expect } from "vitest";

/**
 * The legacy Interakt webhook carries no tenant in its URL and runs under the
 * service role, so its "most recent contacted order for this phone" fallback
 * spans every tenant. That is only a safe answer while exactly one merchant is
 * waiting on that number.
 *
 * 160 phone numbers already exist under more than one tenant. None currently has
 * a `contacted` order in more than one, so this is latent — but the rule it now
 * follows is the point: ambiguity resolves to "no match", leaving the order for a
 * human, rather than confirming whichever merchant happened to message last.
 *
 * This pins the decision itself, which is the part worth protecting. It mirrors
 * the route's logic rather than importing it, because the lookup is welded to a
 * Supabase query builder; the rule is three lines and stating it explicitly is
 * what makes a future change to it deliberate.
 */
type Candidate = { id: string; order_id: string; status: string; tenant_id: string };

function pickOrder(candidates: Candidate[]): Candidate | null {
    if (candidates.length === 0) return null;
    const tenants = new Set(candidates.map(o => o.tenant_id));
    if (tenants.size > 1) return null;
    return candidates[0];
}

const order = (id: string, tenant: string): Candidate => ({
    id, order_id: `#${id}`, status: "contacted", tenant_id: tenant,
});

describe("legacy webhook order matching", () => {
    it("matches when only one merchant is waiting on that phone", () => {
        const picked = pickOrder([order("a", "tenant-1"), order("b", "tenant-1")]);
        // Most recent first, so the newest contacted order for that merchant.
        expect(picked?.id).toBe("a");
    });

    it("refuses rather than confirming the wrong merchant's order", () => {
        expect(pickOrder([order("a", "tenant-1"), order("b", "tenant-2")])).toBeNull();
    });

    it("returns null when nothing is contacted", () => {
        expect(pickOrder([])).toBeNull();
    });

    it("is not fooled by ambiguity appearing after the first row", () => {
        // The old code took .limit(1), so a second tenant further down the list
        // was invisible — the exact shape of the bug.
        const picked = pickOrder([
            order("a", "tenant-1"),
            order("b", "tenant-1"),
            order("c", "tenant-9"),
        ]);
        expect(picked).toBeNull();
    });
});
