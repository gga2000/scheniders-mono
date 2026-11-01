import { z } from "zod";

/** Members an admin hid from the payroll grid. A per-browser view preference, not shared data. */
const KEY = "salary_hidden_employees";
const idsSchema = z.array(z.string());

function parseJson(raw: string): unknown {
    try {
        return JSON.parse(raw) as unknown;
    } catch (error) {
        // Only a malformed saved value is expected here; it is treated as "nothing saved".
        if (error instanceof SyntaxError) return null;
        throw error;
    }
}

/** Hidden ids saved in this browser; empty when none are saved or the saved value is not a list of ids. */
export function readHiddenMembers(storage: Pick<Storage, "getItem">): Set<string> {
    const raw = storage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = idsSchema.safeParse(parseJson(raw));
    return parsed.success ? new Set(parsed.data) : new Set();
}

/**
 * Saves the hidden ids. Returns false when the browser refuses to store them (storage full
 * or blocked); the choice then lasts for this visit only.
 */
export function writeHiddenMembers(storage: Pick<Storage, "setItem">, ids: Set<string>): boolean {
    try {
        storage.setItem(KEY, JSON.stringify([...ids]));
        return true;
    } catch (error) {
        if (error instanceof DOMException) return false;
        throw error;
    }
}
