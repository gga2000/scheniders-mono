import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isValidEmail } from "./email";

const CASES = [
  "a@b.co", "user@example.com", "first.last@example.com", "a+tag@example.co.uk", "ali@scheniders.com",
  "user@localhost", "user@@example.com", "@example.com", "user@", "user@example", "user@example.c",
  ".user@example.com", "us..er@example.com", "user.@example.com", "user@-example.com", "user@exa mple.com",
  "", "   ", "  ali@scheniders.com  ", "يوزر@example.com", "user@مثال.com", "user'name@example.com",
  "user_name@example-site.com", "u@e.x1", "user@sub.example.org",
];

describe("isValidEmail", () => {
  it.each(CASES)("agrees with zod's z.email() on %j", (value) => {
    expect(isValidEmail(value)).toBe(z.email().safeParse(value.trim()).success);
  });

  it("trims before checking", () => {
    expect(isValidEmail("  ali@scheniders.com ")).toBe(true);
  });
});
