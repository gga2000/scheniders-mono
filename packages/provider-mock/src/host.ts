const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Host the standalone mock binds to. The control endpoints (/__mock/*) read
 * and reset the call log and fire signed QStash callbacks, so the mock stays
 * on loopback unless a non-loopback host (e.g. 0.0.0.0 inside a drill's
 * internal Docker network) is opted into with PROVIDER_MOCK_ALLOW_NON_LOOPBACK=1.
 */
export function resolveHost(env: Readonly<Record<string, string | undefined>>): string {
    const host = env.PROVIDER_MOCK_HOST?.trim() || "127.0.0.1";
    if (!LOOPBACK_HOSTS.has(host) && env.PROVIDER_MOCK_ALLOW_NON_LOOPBACK !== "1") {
        throw new Error(
            `PROVIDER_MOCK_HOST=${host} is not a loopback address; set PROVIDER_MOCK_ALLOW_NON_LOOPBACK=1 to expose the mock and its control endpoints on it`,
        );
    }
    return host;
}
