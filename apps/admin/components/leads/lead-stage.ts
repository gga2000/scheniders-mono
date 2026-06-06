import { LEAD_STATUS_FLOW, type LeadStatus } from "@/types/leads";

/** Valid next pipeline stages for a lead in `status` (per LEAD_STATUS_FLOW). */
export function getNextStages(status: LeadStatus): LeadStatus[] {
  return LEAD_STATUS_FLOW[status] ?? [];
}
