import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { consentVersion } from "./consent-version";

const LINE = "ممكن نراسلك واتساب بخصوص طلبك";

describe("consentVersion", () => {
  it("is sha256: plus the first 16 hex of the line's SHA-256", () => {
    const hex = createHash("sha256").update(LINE).digest("hex");
    expect(consentVersion(LINE)).toBe(`sha256:${hex.slice(0, 16)}`);
    expect(consentVersion(LINE)).toMatch(/^sha256:[0-9a-f]{16}$/);
  });

  it("ignores surrounding whitespace, so a padded config line matches what the endpoint stored", () => {
    expect(consentVersion(`  ${LINE}\n`)).toBe(consentVersion(LINE));
  });

  it("hashes canonically equivalent Unicode the same (NFC)", () => {
    const composed = "café";
    const decomposed = "café";
    expect(composed).not.toBe(decomposed);
    expect(consentVersion(decomposed)).toBe(consentVersion(composed));
  });

  it("tells different lines apart", () => {
    expect(consentVersion(LINE)).not.toBe(consentVersion(`${LINE}؟`));
  });
});
