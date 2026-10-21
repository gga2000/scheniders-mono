import { z } from "zod";

/**
 * Base URLs of outbound providers (Interakt, QStash, Meta CAPI, …), read from
 * env so e2e runs, restore drills and load tests can point every client at
 * the provider mock (`packages/provider-mock`) instead of a real host.
 *
 * Rules (PKG-00 approach 6a):
 *  - unset or blank → the provider's real host (the default);
 *  - otherwise an `https` URL, or `http://localhost` / `http://127.0.0.1`
 *    outside Production;
 *  - in Production any value other than the default is refused, so a mock
 *    URL can never ship by mistake.
 *
 * "Production" is `VERCEL_ENV === "production"` and nothing else. It must not
 * key on `NODE_ENV`: `next start` runs with `NODE_ENV=production`, so the e2e
 * and drill apps would refuse their mock URLs and fail to boot.
 */

export type ProviderBaseUrlSpec = Readonly<Record<string, string>>;

export type RawEnv = Readonly<Record<string, string | undefined>>;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isProductionDeployment(env: RawEnv): boolean {
    return env.VERCEL_ENV === "production";
}

/** Canonical form used for comparison and for building request URLs: no trailing slash. */
function normalize(url: URL): string {
    return url.toString().replace(/\/+$/, "");
}

export function providerBaseUrlSchema(defaultUrl: string, production: boolean) {
    const normalizedDefault = normalize(new URL(defaultUrl));
    return z
        .string()
        .optional()
        .transform((value, ctx) => {
            const trimmed = value?.trim();
            if (!trimmed) return normalizedDefault;

            let url: URL;
            try {
                url = new URL(trimmed);
            } catch {
                ctx.addIssue({ code: "custom", message: "must be an absolute URL" });
                return z.NEVER;
            }

            const normalized = normalize(url);
            if (production) {
                if (normalized !== normalizedDefault) {
                    ctx.addIssue({
                        code: "custom",
                        message: `must be the real provider host (${normalizedDefault}) when VERCEL_ENV=production`,
                    });
                    return z.NEVER;
                }
                return normalized;
            }

            const isHttps = url.protocol === "https:";
            const isLocalHttp = url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname);
            if (!isHttps && !isLocalHttp) {
                ctx.addIssue({
                    code: "custom",
                    message: "must be an https URL, or http://localhost outside production",
                });
                return z.NEVER;
            }
            return normalized;
        });
}

/**
 * Validate every provider base URL in `spec` (env var name → real host) and
 * return them by env var name. Throws one error listing every bad variable.
 */
export function parseProviderBaseUrls<S extends ProviderBaseUrlSpec>(
    spec: S,
    env: RawEnv,
): { readonly [K in keyof S]: string } {
    const production = isProductionDeployment(env);
    const shape: Record<string, ReturnType<typeof providerBaseUrlSchema>> = {};
    const input: Record<string, string | undefined> = {};
    for (const [name, defaultUrl] of Object.entries(spec)) {
        shape[name] = providerBaseUrlSchema(defaultUrl, production);
        input[name] = env[name];
    }

    const result = z.object(shape).safeParse(input);
    if (!result.success) {
        const messages = result.error.issues
            .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
            .join("\n");
        throw new Error(`Invalid provider base URL environment variables:\n${messages}`);
    }
    return result.data as { readonly [K in keyof S]: string };
}
