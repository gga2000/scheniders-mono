// Types for the duplicate-comparison sub-components.
// Kept in lib so pure presentational components can import them
// without pulling in any React hooks or i18n providers.

export type SignalKey =
  | "phone"
  | "name"
  | "city"
  | "address"
  | "items"
  | "timing"
  | "cancelRate";

export interface DuplicateSignal {
  key: SignalKey;
  /** When true, the chip renders in danger/rose colours. */
  danger: boolean;
}

export interface CustomerStats {
  totalOrders: number;
  totalSpent: number;
  deliveredCount: number;
  completedCount: number;
  cancelledCount: number;
  /** Fraction 0–1, e.g. 0.14 → 14 % */
  cancelRate: number;
}
