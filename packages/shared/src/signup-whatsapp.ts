import { z } from "zod";

/**
 * The console's switches for the WhatsApp messages a new owner gets at signup
 * (Fermi B11), in admin_settings under SIGNUP_WHATSAPP_SETTINGS_KEY:
 *   phone_code         — signup asks for a code sent on WhatsApp (items 7).
 *   welcome            — after signup, the proven number gets the store link
 *                        and the how-to video (item 9).
 *   welcome_video_url  — that video.
 * The welcome only goes to a number proven with a code, so it needs the code
 * switch on, and it needs a video to send.
 */
export const SIGNUP_WHATSAPP_SETTINGS_KEY = "signup_whatsapp";

export const signupWhatsAppSettingsSchema = z
    .object({
        phone_code: z.boolean(),
        welcome: z.boolean(),
        welcome_video_url: z.url({ protocol: /^https$/ }).max(500).nullable(),
    })
    .refine((s) => !s.welcome || s.phone_code, { message: "The welcome goes only to a number proven with a code: turn the code on first.", path: ["welcome"] })
    .refine((s) => !s.welcome || s.welcome_video_url !== null, { message: "Add the video link before turning the welcome on.", path: ["welcome_video_url"] });

export type SignupWhatsAppSettings = z.infer<typeof signupWhatsAppSettingsSchema>;

/** Until staff switch them on, signup sends nothing. */
export const SIGNUP_WHATSAPP_OFF: SignupWhatsAppSettings = { phone_code: false, welcome: false, welcome_video_url: null };

/** The stored row's value, or everything off when there is none or it does not read. */
export function readSignupWhatsAppSettings(value: unknown): SignupWhatsAppSettings {
    const parsed = signupWhatsAppSettingsSchema.safeParse(value);
    return parsed.success ? parsed.data : SIGNUP_WHATSAPP_OFF;
}
