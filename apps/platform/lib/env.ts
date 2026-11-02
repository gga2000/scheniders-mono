import { z } from "zod";
import { parseProviderBaseUrls, providerBaseUrlSchema, type RawEnv } from "@scheniders/shared/provider-base-url";

/**
 * Environment Variable Validation
 *
 * Fail-fast schema validation for all environment variables.
 * If any required variable is missing or malformed, the app
 * will throw immediately at import time — preventing silent
 * runtime failures.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
 */

// =============================================
// CLIENT ENV (exposed to browser via NEXT_PUBLIC_)
// =============================================

const clientSchema = z.object({
    NEXT_PUBLIC_SUPABASE_URL: z
        .string()
        .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z
        .string()
        .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
    NEXT_PUBLIC_SITE_URL: z
        .string()
        .url("NEXT_PUBLIC_SITE_URL must be a valid URL")
        .optional(),
    NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN: z
        .string()
        .min(1)
        .default("scheniders.com"),
});

// =============================================
// SERVER ENV (only available server-side)
// =============================================

// A comma-separated list of tenant uuids. Validated here so a typo fails the
// boot instead of silently enabling nobody, or the wrong tenant.
const tenantIdList = z
    .string()
    .refine(
        (v) =>
            v
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .every((s) => z.string().uuid().safeParse(s).success),
        "must be a comma-separated list of tenant uuids",
    );

const serverSchema = z.object({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    LIGHTFUNNELS_WEBHOOK_SECRET: z.string().min(1).optional(),
    LIGHTFUNNELS_TENANT_ID: z.string().uuid().optional(),
    // HMAC key for the `lightfunnels-hmac` header (the LightFunnels app's client
    // secret). Only API-registered webhooks are signed; see lib/webhook-auth.ts.
    LIGHTFUNNELS_APP_SECRET: z.string().min(1).optional(),
    // Staged webhook auth: "monitor" (default) processes unauthenticated
    // requests and logs them; "enforce" refuses them. Per-provider overrides
    // win over the global flag.
    WEBHOOK_AUTH_MODE: z.enum(["monitor", "enforce"]).optional(),
    LIGHTFUNNELS_WEBHOOK_AUTH_MODE: z.enum(["monitor", "enforce"]).optional(),
    INTERAKT_WEBHOOK_AUTH_MODE: z.enum(["monitor", "enforce"]).optional(),
    WEBHOOK_LOGGING_ENABLED: z.enum(["true", "false"]).optional(),
    CRON_SECRET: z.string().min(1).optional(),
    QSTASH_TOKEN: z.string().min(1).optional(),
    // Custom domains: the platform adds a merchant's verified domain to the
    // storefront's Vercel project so it is routed and gets an SSL certificate.
    VERCEL_API_TOKEN: z.string().min(1).optional(),
    VERCEL_STOREFRONT_PROJECT_ID: z.string().min(1).optional(),
    VERCEL_TEAM_ID: z.string().min(1).optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
    INTERAKT_API_KEY: z.string().min(1).optional(),
    INTERAKT_WEBHOOK_SECRET: z.string().min(1).optional(),
    WASEET_USERNAME: z.string().min(1).optional(),
    WASEET_PASSWORD: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
    // Tenants whose STOREFRONT orders get the instant WhatsApp confirmation
    // (app/api/webhooks/storefront-order). Interakt is one global sender, so
    // list only tenants whose customers expect messages from that number.
    STOREFRONT_WA_CONFIRM_TENANT_IDS: tenantIdList.optional(),
});

// =============================================
// VALIDATION
// =============================================

function validateEnv() {
    const clientResult = clientSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim(),
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL?.trim() || undefined,
        NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN: process.env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN?.trim() || undefined,
    });

    if (!clientResult.success) {
        const formatted = clientResult.error.flatten().fieldErrors;
        const messages = Object.entries(formatted)
            .map(([key, errors]) => `  ${key}: ${errors?.join(", ")}`)
            .join("\n");
        throw new Error(
            `❌ Invalid environment variables:\n${messages}\n\nPlease check your .env.local file.`
        );
    }

    // Server vars are only validated on the server side
    let serverVars: z.infer<typeof serverSchema> = {};
    if (typeof window === "undefined") {
        // Convert empty strings to undefined so .optional() works correctly
        const orUndef = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
        const serverResult = serverSchema.safeParse({
            SUPABASE_SERVICE_ROLE_KEY: orUndef(process.env.SUPABASE_SERVICE_ROLE_KEY),
            LIGHTFUNNELS_WEBHOOK_SECRET: orUndef(process.env.LIGHTFUNNELS_WEBHOOK_SECRET),
            LIGHTFUNNELS_TENANT_ID: orUndef(process.env.LIGHTFUNNELS_TENANT_ID),
            LIGHTFUNNELS_APP_SECRET: orUndef(process.env.LIGHTFUNNELS_APP_SECRET),
            WEBHOOK_AUTH_MODE: orUndef(process.env.WEBHOOK_AUTH_MODE),
            LIGHTFUNNELS_WEBHOOK_AUTH_MODE: orUndef(process.env.LIGHTFUNNELS_WEBHOOK_AUTH_MODE),
            INTERAKT_WEBHOOK_AUTH_MODE: orUndef(process.env.INTERAKT_WEBHOOK_AUTH_MODE),
            WEBHOOK_LOGGING_ENABLED: orUndef(process.env.WEBHOOK_LOGGING_ENABLED),
            CRON_SECRET: orUndef(process.env.CRON_SECRET),
            QSTASH_TOKEN: orUndef(process.env.QSTASH_TOKEN),
            VERCEL_API_TOKEN: orUndef(process.env.VERCEL_API_TOKEN),
            VERCEL_STOREFRONT_PROJECT_ID: orUndef(process.env.VERCEL_STOREFRONT_PROJECT_ID),
            VERCEL_TEAM_ID: orUndef(process.env.VERCEL_TEAM_ID),
            QSTASH_CURRENT_SIGNING_KEY: orUndef(process.env.QSTASH_CURRENT_SIGNING_KEY),
            QSTASH_NEXT_SIGNING_KEY: orUndef(process.env.QSTASH_NEXT_SIGNING_KEY),
            INTERAKT_API_KEY: orUndef(process.env.INTERAKT_API_KEY),
            INTERAKT_WEBHOOK_SECRET: orUndef(process.env.INTERAKT_WEBHOOK_SECRET),
            WASEET_USERNAME: orUndef(process.env.WASEET_USERNAME),
            WASEET_PASSWORD: orUndef(process.env.WASEET_PASSWORD),
            GEMINI_API_KEY: orUndef(process.env.GEMINI_API_KEY),
            TELEGRAM_BOT_TOKEN: orUndef(process.env.TELEGRAM_BOT_TOKEN),
            TELEGRAM_WEBHOOK_SECRET: orUndef(process.env.TELEGRAM_WEBHOOK_SECRET),
            STOREFRONT_WA_CONFIRM_TENANT_IDS: orUndef(process.env.STOREFRONT_WA_CONFIRM_TENANT_IDS),
        });

        if (!serverResult.success) {
            const formatted = serverResult.error.flatten().fieldErrors;
            const messages = Object.entries(formatted)
                .map(([key, errors]) => `  ${key}: ${errors?.join(", ")}`)
                .join("\n");
            throw new Error(
                `❌ Invalid server environment variables:\n${messages}\n\nPlease check your .env.local file.`
            );
        }

        serverVars = serverResult.data;
    }

    return {
        ...clientResult.data,
        ...serverVars,
    };
}

export const env = validateEnv();

// =============================================
// PROVIDER BASE URLS (PKG-00 approach 6a)
// =============================================

/**
 * Every outbound provider client takes its host from here, so e2e, restore
 * drills and load tests can point it at the provider mock. Env var name → the
 * real host used when the variable is unset. Values are validated by
 * `parseProviderBaseUrls`: https (or http://localhost outside Production), and
 * only the real host when `VERCEL_ENV=production`.
 */
export const PLATFORM_PROVIDER_DEFAULTS = {
    INTERAKT_API_BASE_URL: "https://api.interakt.ai",
    QSTASH_URL: "https://qstash-us-east-1.upstash.io",
    LIGHTFUNNELS_API_BASE_URL: "https://services.lightfunnels.com",
    TELEGRAM_API_BASE_URL: "https://api.telegram.org",
    WASEET_API_BASE_URL: "https://api.alwaseet-iq.net",
    GEMINI_API_BASE_URL: "https://generativelanguage.googleapis.com",
    ANTHROPIC_API_BASE_URL: "https://api.anthropic.com",
} as const;

export function parsePlatformProviderBaseUrls(raw: RawEnv) {
    const d = PLATFORM_PROVIDER_DEFAULTS;
    return parseProviderBaseUrls(raw, (production) =>
        z.object({
            INTERAKT_API_BASE_URL: providerBaseUrlSchema(d.INTERAKT_API_BASE_URL, production),
            QSTASH_URL: providerBaseUrlSchema(d.QSTASH_URL, production),
            LIGHTFUNNELS_API_BASE_URL: providerBaseUrlSchema(d.LIGHTFUNNELS_API_BASE_URL, production),
            TELEGRAM_API_BASE_URL: providerBaseUrlSchema(d.TELEGRAM_API_BASE_URL, production),
            WASEET_API_BASE_URL: providerBaseUrlSchema(d.WASEET_API_BASE_URL, production),
            GEMINI_API_BASE_URL: providerBaseUrlSchema(d.GEMINI_API_BASE_URL, production),
            ANTHROPIC_API_BASE_URL: providerBaseUrlSchema(d.ANTHROPIC_API_BASE_URL, production),
        }),
    );
}

/**
 * Validated at import, like `env`, so a bad or refused value fails the boot
 * instead of the first outbound call. Provider clients run on the server only;
 * a browser bundle that pulls this module in gets the real hosts, never a
 * value read from the browser's `process` polyfill.
 */
export const providerBaseUrls = parsePlatformProviderBaseUrls(
    typeof window === "undefined" ? process.env : {},
);

export type Env = ReturnType<typeof validateEnv>;
