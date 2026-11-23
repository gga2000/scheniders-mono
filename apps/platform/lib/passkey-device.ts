/** A short name for the device a passkey was made on, from its user agent. Shown in Settings so the owner can tell their passkeys apart. */
export function passkeyDeviceLabel(userAgent: string | null): string {
    const ua = userAgent ?? "";
    if (/iPhone/.test(ua)) return "iPhone";
    if (/iPad/.test(ua)) return "iPad";
    if (/Android/.test(ua)) return "Android";
    if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
    if (/Windows/.test(ua)) return "Windows";
    if (/Linux/.test(ua)) return "Linux";
    return "";
}
