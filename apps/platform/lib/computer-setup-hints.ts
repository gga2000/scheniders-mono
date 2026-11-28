import { diag } from "@/lib/diag";

// Hints this phone keeps for itself about moving setup to a computer. The
// truth is on the server (the guide row and the shop itself); these only
// spare an opened phone a waiting screen on every visit, and let the phone
// say the computer is open right after the person pressed yes.

const OPEN_KEY = "fermi.phoneOpen";
const COMPUTER_KEY = "fermi.computerOpenedAt";

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch (err) {
        diag.warn("[ComputerSetup] localStorage unreadable — asking the server instead", err);
        return null;
    }
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        diag.warn("[ComputerSetup] localStorage unwritable — the server keeps the answer", err);
    }
}

/** This phone already opened the app for this shop. */
export function phoneOpenHint(tenantId: string): boolean {
    return read(`${OPEN_KEY}.${tenantId}`) === "1";
}

export function rememberPhoneOpen(tenantId: string): void {
    write(`${OPEN_KEY}.${tenantId}`, "1");
}

/** The person said yes to a computer from this phone, in the last day. */
export function computerOpenedHint(now: number = Date.now()): boolean {
    const at = Number(read(COMPUTER_KEY));
    return Number.isFinite(at) && at > 0 && now - at < 24 * 60 * 60 * 1000;
}

export function rememberComputerOpened(now: number = Date.now()): void {
    write(COMPUTER_KEY, String(now));
}
