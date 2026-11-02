import { z } from "zod";
import { env } from "@/lib/env";

/**
 * Where a merchant's custom domain stands on the storefront's Vercel project.
 * - active: routed and DNS is right; Vercel issues the SSL certificate itself.
 * - pending: added, but Vercel still needs to verify it.
 * - misconfigured: the domain's DNS does not point at Vercel.
 * - not_configured: no Vercel API token set, so nothing was provisioned.
 */
export type DomainSsl = "active" | "pending" | "misconfigured" | "not_configured";

/** The domain cannot be added: another Vercel project already owns it. */
export class DomainConflictError extends Error {
    constructor(readonly domain: string) {
        super(`${domain} is already attached to another Vercel project`);
    }
}

const API = "https://api.vercel.com";

const errorBody = z.object({ error: z.object({ code: z.string().optional(), message: z.string().optional() }) });
const projectDomain = z.object({ verified: z.boolean() });
const domainConfig = z.object({ misconfigured: z.boolean() });

interface VercelConfig {
    token: string;
    projectId: string;
    teamId: string | undefined;
}

function readConfig(): VercelConfig | null {
    const { VERCEL_API_TOKEN, VERCEL_STOREFRONT_PROJECT_ID, VERCEL_TEAM_ID } = env;
    if (!VERCEL_API_TOKEN || !VERCEL_STOREFRONT_PROJECT_ID) return null;
    return { token: VERCEL_API_TOKEN, projectId: VERCEL_STOREFRONT_PROJECT_ID, teamId: VERCEL_TEAM_ID };
}

async function call(cfg: VercelConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
    const url = new URL(`${API}${path}`);
    if (cfg.teamId) url.searchParams.set("teamId", cfg.teamId);
    return fetch(url, {
        method,
        headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
    });
}

async function failure(res: Response, what: string): Promise<Error> {
    const parsed = errorBody.safeParse(await res.json().catch(() => null));
    const detail = parsed.success ? (parsed.data.error.message ?? parsed.data.error.code ?? "") : "";
    return new Error(`Vercel ${what} failed (${res.status}) ${detail}`.trim());
}

/**
 * Adds `domain` to the storefront project (idempotent) and reports where it
 * stands. Throws DomainConflictError when another project owns the domain and
 * a plain Error when Vercel is unreachable or rejects the call.
 */
export async function provisionCustomDomain(domain: string): Promise<DomainSsl> {
    const cfg = readConfig();
    if (!cfg) return "not_configured";

    const added = await call(cfg, "POST", `/v10/projects/${cfg.projectId}/domains`, { name: domain });
    if (!added.ok) {
        const parsed = errorBody.safeParse(await added.clone().json().catch(() => null));
        const code = parsed.success ? parsed.data.error.code : undefined;
        if (code === "domain_already_in_use") throw new DomainConflictError(domain);
        // Already on this project: carry on and read its status.
        if (code !== "domain_already_exists") throw await failure(added, "add domain");
    }

    const status = await call(cfg, "GET", `/v9/projects/${cfg.projectId}/domains/${encodeURIComponent(domain)}`);
    if (!status.ok) throw await failure(status, "domain status");
    const project = projectDomain.parse(await status.json());

    const dns = await call(cfg, "GET", `/v6/domains/${encodeURIComponent(domain)}/config`);
    if (!dns.ok) throw await failure(dns, "domain config");
    const { misconfigured } = domainConfig.parse(await dns.json());

    if (misconfigured) return "misconfigured";
    return project.verified ? "active" : "pending";
}
