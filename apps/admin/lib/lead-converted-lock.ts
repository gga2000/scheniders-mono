import { NextResponse } from "next/server";

/**
 * The database locks a converted lead's owner, creator and status, because
 * commission is paid to whoever owned the lead when it became a store
 * (trigger leads_freeze_conversion_attribution). This turns that refusal into
 * a clear 409 instead of a generic 500.
 */
export function leadConvertedLockResponse(error: unknown): NextResponse | null {
    if (typeof error !== "object" || error === null) return null;
    if ((error as { hint?: unknown }).hint !== "LEAD_CONVERTED_LOCKED") return null;
    return NextResponse.json(
        { error: "This lead is already a store. Its owner and status can't change, so the commission stays with who closed it." },
        { status: 409 },
    );
}
