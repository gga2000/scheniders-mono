// =====================================================================
// Sign in on a computer by scanning a code with the phone
// =====================================================================
// The computer's sign-in page asks for a request and shows its id as a QR
// code. A signed-in phone scans it and says yes; the computer, which kept a
// secret the server only knows the hash of, then receives a session for the
// person on the phone, once. Table: public.computer_sign_ins (service role
// only). Routes: app/api/auth/computer-sign-in/*.
// =====================================================================

/** How long a code may be scanned. The page asks for a fresh one after. */
export const SIGN_IN_CODE_LIFE_MS = 3 * 60 * 1000;

/**
 * The phone may answer a code until this long before it runs out. The page
 * swaps its code just before the end, so any yes the server takes reaches a
 * page still asking about that code.
 */
export const SIGN_IN_ANSWER_MARGIN_MS = 15 * 1000;

/** How long after the phone's yes the computer may still collect its session. */
export const SIGN_IN_COLLECT_MS = 2 * 60 * 1000;

export type ComputerSignInState = "waiting" | "approved" | "declined" | "expired" | "used";

export interface ComputerSignInTimes {
    expires_at: string;
    approved_at: string | null;
    declined_at: string | null;
    used_at: string | null;
}

export function computerSignInState(row: ComputerSignInTimes, now: number = Date.now()): ComputerSignInState {
    if (row.used_at) return "used";
    if (row.declined_at) return "declined";
    if (row.approved_at) return now - Date.parse(row.approved_at) <= SIGN_IN_COLLECT_MS ? "approved" : "expired";
    return now < Date.parse(row.expires_at) ? "waiting" : "expired";
}

/** The page the code opens on the phone. */
export function computerSignInPath(id: string): string {
    return `/pair/${id}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PAIR_PATH = new RegExp(`^/pair/(${UUID})/?$`, "i");

/**
 * The request id in a scanned code, or null for any other code. Only the id
 * is taken: the phone opens its own /pair page, wherever the code came from,
 * and asks the person before anything happens.
 */
export function computerSignInIdFromScan(text: string): string | null {
    let url: URL;
    try {
        url = new URL(text.trim());
    } catch {
        return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const match = PAIR_PATH.exec(url.pathname);
    return match ? match[1].toLowerCase() : null;
}

export interface DeviceDescription {
    browser: string;
    os: string;
}

/**
 * "Chrome" and "Windows" from a user agent, for the phone to show which
 * computer it is about to open. Unknown parts are empty. An iPad in desktop
 * mode says Macintosh; `touch` (the page's own maxTouchPoints) tells it apart.
 */
export function describeDevice(userAgent: string, touch = false): DeviceDescription {
    const ua = userAgent;
    let browser = "";
    if (/Edg(e|A|iOS)?\//.test(ua)) browser = "Edge";
    else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
    else if (/SamsungBrowser\//.test(ua)) browser = "Samsung Internet";
    else if (/Firefox\/|FxiOS\//.test(ua)) browser = "Firefox";
    else if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) browser = "Chrome";
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";

    let os = "";
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) os = "iPad";
    else if (/iPhone|iPod/.test(ua)) os = "iPhone";
    else if (/Android/.test(ua)) os = "Android";
    else if (/CrOS/.test(ua)) os = "ChromeOS";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Macintosh|Mac OS X/.test(ua)) os = "Mac";
    else if (/Linux/.test(ua)) os = "Linux";

    return { browser, os };
}

/** A phone, as opposed to a tablet or computer: its shorter screen side is under 600 CSS px. */
export const PHONE_SHORT_SIDE_PX = 600;

export function isPhoneScreen(width: number, height: number): boolean {
    return Math.min(width, height) < PHONE_SHORT_SIDE_PX;
}
