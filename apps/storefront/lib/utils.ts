import { formatIQD as _formatIQD } from "@scheniders/shared";

// Re-export shared utilities
export { cn, slugify } from "@scheniders/shared";

// Storefront uses Arabic locale by default
export function formatIQD(amount: number): string {
  return _formatIQD(amount, "ar-IQ");
}
