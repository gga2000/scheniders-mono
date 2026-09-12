// =============================================
// BILLING-EXEMPT TENANTS
//
// The platform operator runs its own store on this platform. On a paid tier that
// store is billed like any customer, so an empty wallet suspended it and the
// "الحساب موقوف" overlay locked the operator out of their own dashboard.
//
// The `internal` tier is the house account: never charged, never suspended, no
// limits. Exactly one predicate decides that, and every biller and gate reads it
// — a second copy of this rule is how a tenant ends up half-exempt.
// =============================================

import type { PlanTier } from "@/lib/tenant";

/** Plans that are never billed and never suspended. */
const EXEMPT_PLANS: ReadonlySet<string> = new Set(["internal"]);

/**
 * Is this tenant's plan exempt from billing, limits and suspension?
 *
 * Accepts a loose string because plan values arrive from the database, request
 * bodies and old rows — a value this build has never heard of is simply not exempt.
 */
export function isBillingExempt(plan: PlanTier | string | null | undefined): boolean {
    return !!plan && EXEMPT_PLANS.has(plan);
}

/**
 * Postgres array literal of the exempt plans, for `.not("plan", "in", ...)` filters
 * in the billing crons. Built from the same set so the SQL cannot drift from the
 * TypeScript.
 */
export const EXEMPT_PLANS_SQL_LIST = `(${[...EXEMPT_PLANS].join(",")})`;
