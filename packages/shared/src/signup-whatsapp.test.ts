import { describe, expect, it } from "vitest";
import { SIGNUP_WHATSAPP_OFF, readSignupWhatsAppSettings, signupWhatsAppSettingsSchema } from "./signup-whatsapp";

describe("signup WhatsApp switches (Fermi B11)", () => {
    it("reads as all off when nothing is saved or the row is malformed", () => {
        expect(readSignupWhatsAppSettings(null)).toEqual(SIGNUP_WHATSAPP_OFF);
        expect(readSignupWhatsAppSettings({ phone_code: "yes" })).toEqual(SIGNUP_WHATSAPP_OFF);
    });

    it("keeps a saved code switch and video", () => {
        const saved = { phone_code: true, welcome: true, welcome_video_url: "https://youtu.be/abc" };
        expect(readSignupWhatsAppSettings(saved)).toEqual(saved);
    });

    it("refuses a welcome without the code, or without a video", () => {
        expect(signupWhatsAppSettingsSchema.safeParse({ phone_code: false, welcome: true, welcome_video_url: "https://youtu.be/abc" }).success).toBe(false);
        expect(signupWhatsAppSettingsSchema.safeParse({ phone_code: true, welcome: true, welcome_video_url: null }).success).toBe(false);
    });

    it("takes only an https video link", () => {
        expect(signupWhatsAppSettingsSchema.safeParse({ phone_code: true, welcome: false, welcome_video_url: "http://youtu.be/abc" }).success).toBe(false);
        expect(signupWhatsAppSettingsSchema.safeParse({ phone_code: true, welcome: false, welcome_video_url: "javascript:alert(1)" }).success).toBe(false);
    });
});
