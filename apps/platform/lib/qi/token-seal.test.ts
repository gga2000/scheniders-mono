import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ QI_TOKEN_KEY: undefined as string | undefined }));
vi.mock("@/lib/env", () => ({ env }));

const { QiTokenSealError, openQiToken, qiTokenKeyFromEnv, sealQiToken } = await import("./token-seal");

const TENANT = "44444444-4444-4444-8444-444444444444";
const OTHER = "99999999-9999-4999-8999-999999999999";
const TOKEN = "dde6893c-5f1b-4d7d-af78-9916f2a30e7d";
const key = randomBytes(32);

afterEach(() => {
    env.QI_TOKEN_KEY = undefined;
    vi.restoreAllMocks();
});

describe("Qi card token sealing", () => {
    it("opens what it sealed, for the same store and key", () => {
        expect(openQiToken(sealQiToken(TOKEN, TENANT, key), TENANT, key)).toBe(TOKEN);
    });

    it("never stores the token itself, and seals it differently every time", () => {
        const a = sealQiToken(TOKEN, TENANT, key);
        const b = sealQiToken(TOKEN, TENANT, key);
        expect(a).not.toContain(TOKEN);
        expect(a).not.toBe(b);
    });

    it("fits the database's check on saved tokens", () => {
        expect(sealQiToken(TOKEN, TENANT, key)).toMatch(/^v1\.[A-Za-z0-9_-]{60,255}$/);
    });

    it("refuses another store's sealed token, another key, and changed bytes", () => {
        const sealed = sealQiToken(TOKEN, TENANT, key);
        expect(() => openQiToken(sealed, OTHER, key)).toThrow(QiTokenSealError);
        expect(() => openQiToken(sealed, TENANT, randomBytes(32))).toThrow(QiTokenSealError);
        const body = Buffer.from(sealed.slice(3), "base64url");
        body[body.length - 1] ^= 1;
        expect(() => openQiToken(`v1.${body.toString("base64url")}`, TENANT, key)).toThrow(QiTokenSealError);
    });

    it("refuses a token that was never sealed", () => {
        expect(() => openQiToken(TOKEN, TENANT, key)).toThrow(QiTokenSealError);
        expect(() => openQiToken("v1.", TENANT, key)).toThrow(QiTokenSealError);
        expect(() => openQiToken("v1.AAAA", TENANT, key)).toThrow(QiTokenSealError);
        expect(() => openQiToken("v2.AAAA", TENANT, key)).toThrow(QiTokenSealError);
    });
});

describe("qiTokenKeyFromEnv", () => {
    it("reads a 32-byte base64 key", () => {
        env.QI_TOKEN_KEY = key.toString("base64");
        expect(qiTokenKeyFromEnv()?.equals(key)).toBe(true);
    });

    it("is off when the key is missing", () => {
        expect(qiTokenKeyFromEnv()).toBeNull();
    });

    it.each([
        ["too short", randomBytes(16).toString("base64")],
        ["too long", randomBytes(48).toString("base64")],
        ["not base64", "x".repeat(44)],
        ["hex", randomBytes(32).toString("hex")],
    ])("switches card saving off for a malformed key (%s) instead of crashing", (_name, raw) => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        env.QI_TOKEN_KEY = raw;
        expect(qiTokenKeyFromEnv()).toBeNull();
    });
});
