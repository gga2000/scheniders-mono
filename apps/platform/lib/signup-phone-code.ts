// =====================================================================
// Signup phone code and welcome message (Fermi B11 items 7 and 9)
// =====================================================================
// Before the account is made, the owner proves their mobile with a 6-digit
// code sent on WhatsApp from Fermi's own number. Checking it hands back a
// proof (the code's row id) that the signup spends once. After signup, that
// number gets a welcome with the store link and a short video.
//
// Both are off until staff switch them on in the console's Settings
// (admin_settings "signup_whatsapp"), after Interakt approves the templates.
// The code is never stored or logged, only its hash; signup_phone_codes is
// server-only.
// =====================================================================

import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { PLATFORM_WHATSAPP_TEMPLATES } from "@scheniders/shared/whatsapp-templates";
import {
    SIGNUP_WHATSAPP_SETTINGS_KEY,
    readSignupWhatsAppSettings,
    type SignupWhatsAppSettings,
} from "@scheniders/shared/signup-whatsapp";
import { sendPlatformTemplate } from "@/lib/interakt";
import { reportOrderError } from "@/lib/order-telemetry";
import type { createSupabaseServiceClient } from "@/lib/supabase-server";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/** How long a sent code can be typed. The template tells the owner the same. */
export const SIGNUP_CODE_TTL_SECONDS = 10 * 60;
/** How long after checking the code the signup may spend the proof. */
export const SIGNUP_PROOF_TTL_SECONDS = 30 * 60;
/** The least time between two codes to one number. */
export const SIGNUP_CODE_RESEND_SECONDS = 60;

export const SIGNUP_CODE_PATTERN = /^\d{6}$/;

/** The console's switches; throws when they cannot be read, like any other step of signup. */
export async function loadSignupWhatsApp(db: ServiceClient): Promise<SignupWhatsAppSettings> {
    const { data, error } = await db.from("admin_settings").select("value").eq("key", SIGNUP_WHATSAPP_SETTINGS_KEY).maybeSingle();
    if (error) throw new Error(`Signup WhatsApp settings read failed: ${error.message}`);
    return readSignupWhatsAppSettings(data?.value ?? null);
}

export function newSignupCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** What is stored and compared: the code tied to its number. */
export function hashSignupCode(phone: string, code: string): string {
    return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

/**
 * Sends a new code to a mobile (07XXXXXXXXX) and records it. On a failed send
 * the record goes, so the owner can ask again at once.
 */
export async function sendSignupCode(db: ServiceClient, phone: string, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const code = newSignupCode();
    const { data: row, error: insertError } = await db
        .from("signup_phone_codes")
        .insert({
            phone,
            code_hash: hashSignupCode(phone, code),
            ip,
            expires_at: new Date(Date.now() + SIGNUP_CODE_TTL_SECONDS * 1000).toISOString(),
        })
        .select("id")
        .single();
    if (insertError) throw new Error(`Signup code not recorded: ${insertError.message}`);

    const sent = await sendPlatformTemplate({
        phone,
        template: PLATFORM_WHATSAPP_TEMPLATES.signupCode,
        bodyValues: [code],
        buttonValues: { "0": [code] },
        label: "signup-code",
    });
    if (!sent.success) {
        const { error: deleteError } = await db.from("signup_phone_codes").delete().eq("id", row.id);
        if (deleteError) throw new Error(`Unsent signup code not removed: ${deleteError.message}`);
        return { ok: false, error: sent.error ?? "send failed" };
    }
    const { error: updateError } = await db.from("signup_phone_codes").update({ message_id: sent.messageId ?? null }).eq("id", row.id);
    if (updateError) reportOrderError(new Error(`Signup code message id not saved: ${updateError.message}`), { operation: "signup-code-message-id" });
    return { ok: true };
}

/** Seconds until this number may get another code, or 0. */
export async function signupCodeWait(db: ServiceClient, phone: string): Promise<number> {
    const { data, error } = await db
        .from("signup_phone_codes")
        .select("created_at")
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(`Signup code lookup failed: ${error.message}`);
    if (!data) return 0;
    const elapsed = (Date.now() - Date.parse(data.created_at)) / 1000;
    return Math.max(0, Math.ceil(SIGNUP_CODE_RESEND_SECONDS - elapsed));
}

export type SignupCodeCheck = { result: "ok"; proof: string } | { result: "wrong" | "locked" | "expired" };

const checkAnswerSchema = z.discriminatedUnion("result", [
    z.object({ result: z.literal("ok"), proof: z.uuid() }),
    z.object({ result: z.enum(["wrong", "locked", "expired"]), proof: z.null() }),
]);

export async function checkSignupCode(db: ServiceClient, phone: string, code: string): Promise<SignupCodeCheck> {
    const { data, error } = await db.rpc("signup_phone_code_check", { p_phone: phone, p_code_hash: hashSignupCode(phone, code) }).single();
    if (error) throw new Error(`Signup code check failed: ${error.message}`);
    const answer = checkAnswerSchema.parse(data);
    return answer.result === "ok" ? { result: "ok", proof: answer.proof } : { result: answer.result };
}

/**
 * Spends a proof for this number: true once, for a code checked within the
 * last half hour. A signup that then fails gives it back (releaseSignupProof).
 */
export async function spendSignupProof(db: ServiceClient, proof: string, phone: string): Promise<boolean> {
    const { data, error } = await db
        .from("signup_phone_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", proof)
        .eq("phone", phone)
        .is("used_at", null)
        .gte("verified_at", new Date(Date.now() - SIGNUP_PROOF_TTL_SECONDS * 1000).toISOString())
        .select("id");
    if (error) throw new Error(`Signup proof not spent: ${error.message}`);
    return data.length === 1;
}

export async function releaseSignupProof(db: ServiceClient, proof: string): Promise<void> {
    const { error } = await db.from("signup_phone_codes").update({ used_at: null }).eq("id", proof);
    if (error) reportOrderError(new Error(`Signup proof not released: ${error.message}`), { operation: "signup-proof-release" });
}

/** Ties the spent proof to the shop it made; the welcome is recorded on the same row. */
export async function linkSignupProof(db: ServiceClient, proof: string, tenantId: string): Promise<void> {
    const { error } = await db.from("signup_phone_codes").update({ tenant_id: tenantId }).eq("id", proof);
    if (error) reportOrderError(new Error(`Signup proof not linked: ${error.message}`), { operation: "signup-proof-link", tenantId });
}

export interface SignupWelcome {
    proof: string;
    tenantId: string;
    phone: string;
    businessName: string;
    storeUrl: string;
    videoUrl: string;
}

/** The welcome to the proven number, recorded on its code's row whatever the outcome. */
export async function sendSignupWelcome(db: ServiceClient, welcome: SignupWelcome): Promise<void> {
    const sent = await sendPlatformTemplate({
        phone: welcome.phone,
        template: PLATFORM_WHATSAPP_TEMPLATES.welcome,
        bodyValues: [welcome.businessName, welcome.storeUrl, welcome.videoUrl],
        label: "signup-welcome",
    });
    if (!sent.success) {
        reportOrderError(new Error(`Signup welcome not sent: ${sent.error ?? "unknown"}`), { operation: "signup-welcome", tenantId: welcome.tenantId });
    }
    const { error } = await db
        .from("signup_phone_codes")
        .update(
            sent.success
                ? { welcome_sent_at: new Date().toISOString(), welcome_message_id: sent.messageId ?? null, welcome_error: null }
                : { welcome_error: (sent.error ?? "send failed").slice(0, 500) },
        )
        .eq("id", welcome.proof);
    if (error) reportOrderError(new Error(`Signup welcome not recorded: ${error.message}`), { operation: "signup-welcome-record", tenantId: welcome.tenantId });
}
