import { z } from "zod";
import { LEAD_PRIORITY_CONFIG, PLATFORM_CONFIG, type LeadPriority, type LeadSourcePlatform } from "@/types/leads";

/** The most rows one import request may carry. */
export const LEAD_IMPORT_MAX_ROWS = 500;

/**
 * What an import did, row by row:
 * - created: saved as a new lead
 * - skipped: left out because the row has no merchant name
 * - failed: the row could not be read, or the database refused it
 *
 * The route answers with this shape and the import dialog reads it through the
 * same schema, so the screen cannot show a number the server did not send.
 */
export const leadImportResultSchema = z.object({
  created: z.number().int().min(0),
  skipped: z.number().int().min(0),
  failed: z.number().int().min(0),
  failures: z.array(z.object({ row: z.number().int().min(1), name: z.string(), reason: z.string() })),
});

export type LeadImportResult = z.infer<typeof leadImportResultSchema>;

/** A result plus, when the whole request went wrong, the reason in words. */
export type LeadImportOutcome = LeadImportResult & { problem: string | null };

/**
 * What the dialog shows for one import request of `sent` rows. A refused
 * request, or an answer that is not the agreed shape, means no row is known to
 * be saved: every row counts as failed and the reason is shown.
 */
export function readLeadImportResult(ok: boolean, body: unknown, sent: number): LeadImportOutcome {
  if (ok) {
    const parsed = leadImportResultSchema.safeParse(body);
    if (parsed.success) return { ...parsed.data, problem: null };
  }
  const said = z.object({ error: z.string().min(1) }).safeParse(body);
  return {
    created: 0,
    skipped: 0,
    failed: sent,
    failures: [],
    problem: said.success
      ? said.data.error
      : "The server gave no readable answer. Some rows may be saved: check the leads list before importing again.",
  };
}

const PLATFORMS = Object.keys(PLATFORM_CONFIG) as LeadSourcePlatform[];
const PRIORITIES = Object.keys(LEAD_PRIORITY_CONFIG) as LeadPriority[];

/**
 * The columns an imported row fills: the ones the import dialog lets a person
 * map. Everything else keeps its database default.
 */
export interface LeadImportRow {
  merchant_name: string;
  platform: LeadSourcePlatform;
  platform_url: string | null;
  handle: string | null;
  follower_count: number;
  management_name: string | null;
  management_info: string | null;
  page_phone: string | null;
  avg_view_count: number;
  avg_like_count: number;
  avg_comments_count: number;
  address: string | null;
  city: string | null;
  priority: LeadPriority;
  tags: string[];
}

export type LeadImportRowResult =
  | { kind: "row"; row: LeadImportRow }
  | { kind: "skip" }
  | { kind: "bad"; name: string; reason: string };

/** A cell as trimmed text; "" when it is empty or not text or a number. */
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

/**
 * A count cell as a whole number: "12500", "12,500", "12.5K" and "1.2M" are
 * read, an empty cell is 0, and anything else is null so the row is refused
 * rather than saved with a wrong number.
 */
function count(value: unknown): number | null {
  const cell = text(value).replace(/[,\s]/g, "");
  if (cell === "") return 0;
  const match = /^(\d+(?:\.\d+)?)([km]?)$/i.exec(cell);
  if (!match) return null;
  const scale = match[2] === "" ? 1 : match[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
  return Math.round(Number(match[1]) * scale);
}

function list(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.map(text) : text(value).split(",").map((part) => part.trim());
  return parts.filter(Boolean);
}

/** The largest number a count column (a 32-bit integer) holds. */
const MAX_COUNT = 2_147_483_647;

const COUNT_LABELS = {
  follower_count: "Follower count",
  avg_view_count: "Average views",
  avg_like_count: "Average likes",
  avg_comments_count: "Average comments",
} as const;

/**
 * One uploaded row as the columns to save. A row with no merchant name is
 * skipped. A platform, priority or count the database cannot hold is refused
 * with the reason in plain words, in place of a raw database error.
 */
export function leadImportRow(raw: Record<string, unknown>): LeadImportRowResult {
  const name = text(raw.merchant_name);
  if (!name) return { kind: "skip" };
  const bad = (reason: string): LeadImportRowResult => ({ kind: "bad", name, reason });

  const platformCell = text(raw.platform).toLowerCase().replace(/[\s-]+/g, "_");
  const platform = platformCell === "" ? "other" : PLATFORMS.find((p) => p === platformCell);
  if (!platform) return bad(`Platform "${text(raw.platform)}" is not known. Use one of: ${PLATFORMS.join(", ")}.`);

  const priorityCell = text(raw.priority).toLowerCase();
  const priority = priorityCell === "" ? "medium" : PRIORITIES.find((p) => p === priorityCell);
  if (!priority) return bad(`Priority "${text(raw.priority)}" is not known. Use one of: ${PRIORITIES.join(", ")}.`);

  const counts = { follower_count: 0, avg_view_count: 0, avg_like_count: 0, avg_comments_count: 0 };
  for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
    const value = count(raw[key]);
    if (value === null) return bad(`${COUNT_LABELS[key]} "${text(raw[key])}" is not a number.`);
    if (value > MAX_COUNT) return bad(`${COUNT_LABELS[key]} "${text(raw[key])}" is too large.`);
    counts[key] = value;
  }

  return {
    kind: "row",
    row: {
      merchant_name: name,
      platform,
      platform_url: text(raw.platform_url) || null,
      handle: text(raw.handle).replace(/^@+/, "") || null,
      management_name: text(raw.management_name) || null,
      management_info: text(raw.management_info) || null,
      page_phone: text(raw.page_phone) || null,
      address: text(raw.address) || null,
      city: text(raw.city) || null,
      priority,
      tags: list(raw.tags),
      ...counts,
    },
  };
}
