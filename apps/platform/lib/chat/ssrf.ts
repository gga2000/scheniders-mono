// apps/platform/lib/chat/ssrf.ts
//
// Pure SSRF-guard helpers for the link-unfurl route. Kept dependency-free
// (only node:net) so they are independently unit-testable without dragging in
// the Next/Supabase route-handler import chain.

import net from "node:net";

/** Parse a dotted-quad IPv4 string into its four octets, or null. */
function parseIpv4(ip: string): [number, number, number, number] | null {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    const octets: number[] = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const n = Number(part);
        if (n > 255) return null;
        octets.push(n);
    }
    return octets as [number, number, number, number];
}

/** True if the dotted-quad is loopback / private / link-local / reserved. */
function isPrivateIpv4(ip: string): boolean {
    const o = parseIpv4(ip);
    if (!o) return false;
    const [a, b] = o;
    // 0.0.0.0/8       — "this network" / unspecified
    if (a === 0) return true;
    // 127.0.0.0/8     — loopback
    if (a === 127) return true;
    // 10.0.0.0/8      — private
    if (a === 10) return true;
    // 172.16.0.0/12   — private
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16  — private
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16  — link-local
    if (a === 169 && b === 254) return true;
    // 100.64.0.0/10   — carrier-grade NAT (treat as private)
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
}

/**
 * True if the given IP literal (v4 or v6, as returned by dns.lookup or parsed
 * from the host) is in a loopback / private / link-local / unique-local range.
 * IPv4-mapped IPv6 addresses are unwrapped and checked as IPv4.
 *
 * Non-IP-literal input returns false (the caller is responsible for resolving
 * named hosts via DNS first and re-checking each resolved address).
 */
export function isPrivateAddress(ip: string): boolean {
    const family = net.isIP(ip);
    if (family === 4) return isPrivateIpv4(ip);
    if (family !== 6) return false;

    const lower = ip.toLowerCase();

    // Unspecified ::
    if (lower === "::" || lower === "::0") return true;
    // Loopback ::1
    if (lower === "::1") return true;

    // IPv4-mapped / IPv4-compatible IPv6: ::ffff:a.b.c.d  or  ::a.b.c.d
    const mapped = lower.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    // IPv4-mapped written in hex form ::ffff:7f00:1 etc.
    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
        const hi = parseInt(mappedHex[1], 16);
        const lo = parseInt(mappedHex[2], 16);
        const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateIpv4(v4);
    }

    // fc00::/7 — unique-local (fc00:: – fdff::)
    if (/^f[cd][0-9a-f]{0,2}:/.test(lower)) return true;
    // fe80::/10 — link-local (fe80 – febf)
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;

    return false;
}
