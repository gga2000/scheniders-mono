import { z } from "zod";
import { STAFF_REASON_MAX, STAFF_REASON_MIN } from "./billing-lock-tools";

/**
 * The reason a staff member gives for a billing tool (extend a trial, more
 * lock orders, free unlock). It is written to the activity log; the SQL
 * functions refuse one outside these limits too.
 */
export const staffReasonSchema = z
  .string({ error: "A reason is required" })
  .trim()
  .min(STAFF_REASON_MIN, `Write a reason (at least ${STAFF_REASON_MIN} characters)`)
  .max(STAFF_REASON_MAX, `Keep the reason under ${STAFF_REASON_MAX} characters`);

/**
 * The id the browser made for one staff ask (lib/request-ids.ts). A retry, a
 * second tab or a double click sends the same id, and the database's *_once
 * functions make the change once per id. A page loaded before ids existed
 * sends none and is asked to reload.
 */
export const staffRequestIdSchema = z
  .string({ error: "This page is out of date. Reload it and try again" })
  .uuid("This page is out of date. Reload it and try again");

