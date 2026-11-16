/**
 * A store allowlist read from an env var: "*" lets every store through, a
 * comma-separated list of tenant uuids lets only those, and unset or empty
 * lets nobody. Setting the var back to a list (or clearing it) is the switch
 * that turns a feature off again for everyone else. Pure, no I/O.
 */

export type TenantAllowlist =
    | { readonly all: true }
    | { readonly all: false; readonly ids: ReadonlySet<string> };

export const ALL_TENANTS = "*";

export function parseTenantAllowlist(raw: string | undefined): TenantAllowlist {
    const value = (raw ?? "").trim();
    if (value === ALL_TENANTS) return { all: true };
    return {
        all: false,
        ids: new Set(
            value
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean),
        ),
    };
}

export function allowlistIncludes(list: TenantAllowlist, tenantId: string | null | undefined): boolean {
    if (!tenantId) return false;
    return list.all || list.ids.has(tenantId.toLowerCase());
}
