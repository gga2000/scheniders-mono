// Email check for the signup fields in the footer and the inline newsletter
// section. Both are client components that ship on every storefront page, so
// this is a plain regex: pulling in zod for `z.email()` put the whole library
// (about 54 KB gzipped) into every shopper's download. The pattern is the one
// zod 4 uses for `z.email()` (see email.test.ts, which compares the two).

const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}
