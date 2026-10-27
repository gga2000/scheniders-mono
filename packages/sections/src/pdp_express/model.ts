// The state and handlers the express layout renders from. Built once by
// PdpDirectOrderRender so classic and express share one submit path, one
// validation, one price/discount computation and one pixel/stash flow —
// express only changes the markup around them.

import type { RefObject } from "react";
import type {
  GovernorateShippingConfig,
  LocaleCode,
  StoreContactConfig,
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
  SubmitStatus,
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
  /** Friend-code and points discounts already taken off `total` (0 = none). */
  referralAmount: number;
  pointsDiscount: number;
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
  status: SubmitStatus;
  errorMsg: string | null;
  submitting: boolean;
  submitErrorId: string;
  oos: boolean;
  /** Units left for the chosen variant (or the product), or null while a
   *  product sold by variant still awaits a choice — there is no stock to
   *  count yet, so callers must not treat a placeholder as real. */
  stockLeft: number | null;
  urgency: string | null;
  waHref: string | null;
  /** The same order, prefilled, to the store's WhatsApp — offered when a
   *  submit ends `unconfirmed`, even where the WhatsApp tile is off. */
  waFallbackHref: string | null;
  galleryImages: string[];
  priceRowRef: RefObject<HTMLDivElement | null>;
  priceFlashAt: number | null;
  chosen: SelectedVariant;
  variantError: boolean;
  setVariantError: (v: boolean) => void;
  variantPillsRef: RefObject<HTMLDivElement | null>;
  reassurance: string;
  /** The store's `commerce.contact` when the section opted into the
   *  "who contacts you" line; undefined = no line. */
  contactConfig: StoreContactConfig | undefined;
  deliverySla: string;
  featureCards: { image_url?: string; title: string; body: string }[];
  featureCardsTitle: string;
  trustChips: NonNullable<Props["trust_chips"]>;
  /** The consent line under the phone field, or null when the merchant has
   *  not opted in to half-filled phone capture. */
  captureConsent: string | null;
}
