/*
 * An industry's Edit row sends only what staff changed in it. It sent all
 * five fields, so a save named fields nobody touched: one that changed only
 * the name also wrote back the colour and average order the row opened with,
 * over a colleague's change made meanwhile (round 11, workflow finding 6).
 */

import { z } from "zod";
import type { Industry } from "@/types/leads";

/**
 * What PATCH /api/industries/[id] takes: the fields admin_edit_industry
 * edits, which refuses any other (edit-field-lists.test.ts holds the two
 * lists together).
 */
export const industryEditSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    name_ar: z.string().trim().max(100).nullable(),
    icon: z.string().trim().min(1).max(60),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    avg_order_value_iqd: z.number().int().min(0),
    is_active: z.boolean(),
  })
  // The place in the list changes only through /move, which renumbers the
  // whole list in one write. A sort_order set here could share a number.
  .partial()
  .strict();

export type IndustryEdit = z.infer<typeof industryEditSchema>;

/** The Edit row's fields, as typed. */
export interface IndustryForm {
  name: string;
  name_ar: string;
  icon: string;
  color: string;
  avg_order_value_iqd: number;
}

/** What the Edit row shows when it opens. */
export function industryForm(industry: Industry): IndustryForm {
  return {
    name: industry.name,
    name_ar: industry.name_ar ?? "",
    icon: industry.icon,
    color: industry.color,
    avg_order_value_iqd: industry.avg_order_value_iqd,
  };
}

/** A form as the server keeps it: names trimmed, no Arabic name as null. */
function saved(form: IndustryForm): Required<Omit<IndustryEdit, "is_active">> {
  return {
    name: form.name.trim(),
    name_ar: form.name_ar.trim() || null,
    icon: form.icon,
    color: form.color,
    avg_order_value_iqd: form.avg_order_value_iqd,
  };
}

/** The fields that differ from what the row opened with; empty when nothing did. */
export function industryChanges(opened: IndustryForm, edited: IndustryForm): IndustryEdit {
  const before = saved(opened);
  const after = saved(edited);
  const changes: IndustryEdit = {};
  if (after.name !== before.name) changes.name = after.name;
  if (after.name_ar !== before.name_ar) changes.name_ar = after.name_ar;
  if (after.icon !== before.icon) changes.icon = after.icon;
  if (after.color !== before.color) changes.color = after.color;
  if (after.avg_order_value_iqd !== before.avg_order_value_iqd) changes.avg_order_value_iqd = after.avg_order_value_iqd;
  return changes;
}
