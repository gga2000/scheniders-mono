import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";

/**
 * Team invite links and seats (Fermi A2). An invite carries a random link
 * token; only its sha-256 is stored (team_invites.token_hash), so a database
 * read never yields a working link. The link is /join/<token>: whoever opens
 * it signs in or makes an account, and accept_team_invite adds them to the
 * store. Seats are enforced in the database (team_seat_guard); a refusal has
 * hint TEAM_LIMIT and becomes HTTP 402 here.
 */

export const INVITE_TTL_DAYS = 7;

export function hashInviteToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function newInviteToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: hashInviteToken(token) };
}

/** A link token as /join/<token> carries it: 43 base64url characters. */
export function isInviteToken(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function inviteLink(origin: string, token: string): string {
    return `${origin}/join/${token}`;
}

export function inviteExpiry(now = Date.now()): string {
    return new Date(now + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * A WhatsApp chat with the invited number (07XXXXXXXXX), with the join link
 * already typed in, so the owner only presses send.
 */
export function whatsappInviteUrl(phone07: string, storeName: string, link: string): string {
    const store = storeName.trim() ? `صاحب متجر ${storeName.trim()}` : "صاحب المتجر";
    const text = `هلا، ${store} دعاك لفريقه. افتح هذا الرابط حتى تنضم: ${link}`;
    return `https://wa.me/964${phone07.slice(1)}?text=${encodeURIComponent(text)}`;
}

export const TEAM_LIMIT_CODE = "team_limit";
export const TEAM_LIMIT_MESSAGE =
    "وصل فريقك للحد المسموح بباقتك. احذف عضواً أو دعوة معلّقة، أو رقِّ الباقة حتى تضيف شخصاً جديداً.";

/** A write the seat guard refused (PT402, hint TEAM_LIMIT). */
export function isTeamLimitError(error: { code?: string; hint?: string } | null | undefined): boolean {
    return error?.hint === "TEAM_LIMIT";
}

export function teamLimitResponse(): NextResponse {
    return NextResponse.json(
        { success: false, code: TEAM_LIMIT_CODE, error: TEAM_LIMIT_MESSAGE },
        { status: 402 },
    );
}

/** What accept_team_invite answers when it does not add the person. */
export type InviteRefusal = "not_found" | "used" | "revoked" | "expired";

export const INVITE_REFUSAL_MESSAGE: Record<InviteRefusal, string> = {
    not_found: "رابط الدعوة غير صحيح. اطلب رابطاً جديداً من صاحب المتجر.",
    used: "هذا الرابط مستخدم من قبل. اطلب رابطاً جديداً من صاحب المتجر.",
    revoked: "صاحب المتجر ألغى هذه الدعوة.",
    expired: "انتهت صلاحية الرابط (7 أيام). اطلب رابطاً جديداً من صاحب المتجر.",
};

export function isInviteRefusal(value: unknown): value is InviteRefusal {
    return typeof value === "string" && value in INVITE_REFUSAL_MESSAGE;
}
