// The state and handlers the express layout renders from. Built once by
// PdpDirectOrderRender so classic and express share one submit path, one
// validation, one price/discount computation and one pixel/stash flow —
// express only changes the markup around them.

import type { RefObject } from "react";
import type {
  GovernorateShippingConfig,
  LocaleCode,
} from "@scheniders/shared";
import type { SectionRenderContext } from "../_types";
import type { Product } from "../types";
import type { SelectedVariant } from "../helpers/variant-store";
import type { Props } from "../pdp_direct_order";
import type {
  FieldElement,
  FieldErrors,
  FieldKey,
  FormState,
  STRINGS,
  SubmitOptions,
} from "../pdp_direct_order.client";

/** The express form's visual field order — phone first, the backup number
 *  last — which is also the order submit walks to focus the first invalid
 *  field (passed to onSubmit as SubmitOptions.focusOrder). */
export const EXPRESS_FIELD_ORDER: readonly FieldKey[] = [
  "phone",
  "customer_name",
  "governorate_code",
  "address_details",
  "alt_phone",
];

export interface FieldA11yCore {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
  ref: (el: FieldElement | null) => void;
}

export interface ExpressModel {
  props: Props;
  ctx: SectionRenderContext;
  product: Product;
  locale: LocaleCode;
  s: (key: keyof typeof STRINGS) => string;
  price: number;
  compareAt: number | null;
  onSale: boolean;
  discountPct: number | null;
  qty: number;
  setQty: (update: (q: number) => number) => void;
  maxQty: number;
  atMinQty: boolean;
  atMaxQty: boolean;
  subtotal: number;
  delivery: number | null;
  total: number;
  shipping: GovernorateShippingConfig | null | undefined;
  returnsDays: number | undefined;
  reviewCount: number;
  avgRating: number;
  form: FormState;
  set: (k: FieldKey, v: string) => void;
  fieldErrors: FieldErrors;
  fieldError: (k: FieldKey, raw: string) => string | null;
  validateOnBlur: (k: FieldKey) => void;
  fieldA11yCore: (k: FieldKey) => FieldA11yCore;
  errorId: (k: FieldKey) => string;
  /** Already carries `focusOrder: EXPRESS_FIELD_ORDER`; callers add only
   *  their own options. */
  onSubmit: (
    e: React.FormEvent<HTMLFormElement>,
    opts?: SubmitOptions,
  ) => Promise<void>;
  onFormFocus: (e: React.FocusEvent<HTMLFormElement>) => void;
  status: "idle" | "submitting" | "ok" | "error";
  errorMsg: string | null;
  submitting: boolean;
  submitErrorId: string;
  oos: boolean;
  stockLeft: number;
  urgency: string | null;
  waHref: string | null;
  galleryImages: string[];
  priceRowRef: RefObject<HTMLDivElement | null>;
  priceFlashAt: number | null;
  chosen: SelectedVariant;
  variantError: boolean;
  setVariantError: (v: boolean) => void;
  variantPillsRef: RefObject<HTMLDivElement | null>;
  reassurance: string;
  deliverySla: string;
  featureCards: { image_url?: string; title: string; body: string }[];
  featureCardsTitle: string;
  trustChips: NonNullable<Props["trust_chips"]>;
}
