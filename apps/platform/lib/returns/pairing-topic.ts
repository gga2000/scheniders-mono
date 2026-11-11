/**
 * The realtime topic that pairs the returns cockpit with a phone scanner.
 *
 * It names the store, and the channel is private: the database lets only a
 * signed-in, active member of that store who may edit orders read or send on
 * it (realtime.messages policy returns_pairing_*). A bare `returns:<token>`
 * public topic let anyone holding an old pairing link, signed in or not,
 * send scans and read back customer names.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-z0-9]{8,64}$/i;

export function returnsPairingTopic(tenantId: string, token: string): string | null {
    if (!UUID.test(tenantId) || !TOKEN.test(token)) return null;
    return `returns:${tenantId.toLowerCase()}:${token}`;
}
