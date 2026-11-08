import { describe, it, expect } from "vitest";
import { isPushServiceEndpoint } from "./push-endpoint";

describe("isPushServiceEndpoint", () => {
    it("accepts the push services browsers hand out", () => {
        expect(isPushServiceEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
        expect(isPushServiceEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
        expect(isPushServiceEndpoint("https://web.push.apple.com/QGx")).toBe(true);
        expect(isPushServiceEndpoint("https://wns2-db5p.notify.windows.com/w/?token=x")).toBe(true);
    });
    it("refuses anything that would make the server call another address", () => {
        expect(isPushServiceEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
        expect(isPushServiceEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
        expect(isPushServiceEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
        expect(isPushServiceEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
        expect(isPushServiceEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
        expect(isPushServiceEndpoint("https://u:p@fcm.googleapis.com/x")).toBe(false);
        expect(isPushServiceEndpoint("not a url")).toBe(false);
    });
});
