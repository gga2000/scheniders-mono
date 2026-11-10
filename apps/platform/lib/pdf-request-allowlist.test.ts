import { describe, expect, it } from "vitest";
import { isAllowedPdfRequest } from "./pdf-request-allowlist";

describe("isAllowedPdfRequest", () => {
    it("allows Google Fonts and inline data", () => {
        expect(isAllowedPdfRequest("https://fonts.googleapis.com/css2?family=Almarai")).toBe(true);
        expect(isAllowedPdfRequest("https://fonts.gstatic.com/s/almarai/v1/x.woff2")).toBe(true);
        expect(isAllowedPdfRequest("data:image/png;base64,AAAA")).toBe(true);
        expect(isAllowedPdfRequest("about:blank")).toBe(true);
    });

    it("refuses everything else", () => {
        expect(isAllowedPdfRequest("http://169.254.169.254/latest/meta-data/")).toBe(false);
        expect(isAllowedPdfRequest("http://fonts.googleapis.com/css")).toBe(false);
        expect(isAllowedPdfRequest("https://fonts.googleapis.com.evil.test/x")).toBe(false);
        expect(isAllowedPdfRequest("file:///etc/passwd")).toBe(false);
        expect(isAllowedPdfRequest("not a url")).toBe(false);
    });
});
