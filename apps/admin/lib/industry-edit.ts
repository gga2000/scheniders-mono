/*
 * An industry's Edit row sends only what staff changed in it. It sent all
 * five fields, so a save named fields nobody touched: one that changed only
 * the name also wrote back the colour and average order the row opened with,
 * over a colleague's change made meanwhile (round 11, workflow finding 6).
 */

import type { Industry } from "@/types/leads";

/** What PATCH /api/industries/[id] takes. */
export type IndustryEdit = Partial<Pick<Industry, "name" | "name_ar" | "icon" | "color" | "avg_order_value_iqd" | "is_active">>;

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
