import { z } from "zod";

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
});

// =============================================
// SERVER ENV (only available server-side)
// =============================================

const serverSchema = z.object({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    LIGHTFUNNELS_WEBHOOK_SECRET: z.string().min(1).optional(),
    WEBHOOK_LOGGING_ENABLED: z.enum(["true", "false"]).optional(),
    CRON_SECRET: z.string().min(1).optional(),
    QSTASH_TOKEN: z.string().min(1).optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),
});

// =============================================
// VALIDATION
// =============================================

function validateEnv() {
    const clientResult = clientSchema.safeParse({
        NEXT_PUBLIC_SUPABASE_URL: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim(),
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL?.trim() || undefined,
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
        const serverResult = serverSchema.safeParse({
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
            LIGHTFUNNELS_WEBHOOK_SECRET: process.env.LIGHTFUNNELS_WEBHOOK_SECRET,
            WEBHOOK_LOGGING_ENABLED: process.env.WEBHOOK_LOGGING_ENABLED,
            CRON_SECRET: process.env.CRON_SECRET,
            QSTASH_TOKEN: process.env.QSTASH_TOKEN,
            QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
            QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
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

export type Env = ReturnType<typeof validateEnv>;
