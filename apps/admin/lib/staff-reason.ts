import { z } from "zod";
import { STAFF_REASON_MAX, STAFF_REASON_MIN, STAFF_REASON_TOO_SHORT, staffReasonLetters } from "./billing-lock-tools";

/**
 * The reason a staff member gives for a billing tool (extend a trial, more
 * lock orders, free unlock). It is written to the activity log; the SQL
 * functions refuse one outside these limits too (admin_billing_reason).
 */
export const staffReasonSchema = z
  .string({ error: "A reason is required" })
  .trim()
  .max(STAFF_REASON_MAX, `Keep the reason under ${STAFF_REASON_MAX} characters`)
  .refine((reason) => staffReasonLetters(reason) >= STAFF_REASON_MIN, STAFF_REASON_TOO_SHORT);

/**
 * The id the browser made for one staff ask (lib/request-ids.ts). A retry or
 * a double click sends the same id, and the database's *_once functions make
 * the change once per id. A second tab or a second person makes another id;
 * where that could give the same thing twice, the change also says what the
 * person saw (trial checks: `seen_decided_at`). A page loaded before ids
 * existed sends none and is asked to reload.
 */
export const staffRequestIdSchema = z
  .string({ error: "This page is out of date. Reload it and try again" })
  .uuid("This page is out of date. Reload it and try again");

