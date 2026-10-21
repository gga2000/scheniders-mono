/**
 * Run the provider mock as a standalone process (e2e webServer, restore drill,
 * load test): `pnpm --filter @scheniders/provider-mock start`.
 *
 * Env:
 *   PROVIDER_MOCK_PORT (default 4010), PROVIDER_MOCK_HOST (default 127.0.0.1;
 *     a non-loopback host needs PROVIDER_MOCK_ALLOW_NON_LOOPBACK=1)
 *   QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY — test keys; when both
 *     are set, QStash publishes are delivered back signed with them
 *   PROVIDER_MOCK_QSTASH_DELAY_SCALE — multiplier for Upstash-Delay (default 1)
 */

import { resolveHost } from "./host";
import { startProviderMock } from "./server";

function numberFromEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a non-negative number, got "${raw}"`);
    }
    return value;
}

async function main(): Promise<void> {
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
    const mock = await startProviderMock({
        port: numberFromEnv("PROVIDER_MOCK_PORT", 4010),
        host: resolveHost(process.env),
        qstash:
            currentSigningKey && nextSigningKey
                ? {
                      currentSigningKey,
                      nextSigningKey,
                      delayScale: numberFromEnv("PROVIDER_MOCK_QSTASH_DELAY_SCALE", 1),
                  }
                : undefined,
    });
    console.log(`[provider-mock] listening on ${mock.url}`);

    const shutdown = () => {
        mock.close().then(
            () => process.exit(0),
            (error: unknown) => {
                console.error("[provider-mock] close failed:", error);
                process.exit(1);
            },
        );
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
    console.error("[provider-mock] failed to start:", error);
    process.exit(1);
});
