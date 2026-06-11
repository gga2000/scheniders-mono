// ── Lead Enums ─────────────────────────────────────────────────────────

export type LeadStatus = "new" | "contacted" | "interested" | "store_built" | "converted" | "lost";

export type LeadPriority = "low" | "medium" | "high" | "urgent";

export type LeadSourcePlatform =
  | "instagram" | "facebook" | "tiktok" | "snapchat"
  | "youtube" | "twitter" | "linkedin" | "website"
  | "referral" | "cold_call" | "other";

export type LeadActivityType =
  | "note" | "call" | "whatsapp" | "email" | "meeting"
  | "status_change" | "assignment_change" | "store_created"
  | "follow_up" | "conversion" | "score_change" | "tag_change";

export type LeadTier = "bronze" | "silver" | "gold" | "diamond" | "legendary";

export type CompetitorRelationship = "direct" | "indirect" | "substitute";

export type CommissionType = "per_order" | "percentage" | "tiered_bonus" | "custom";

export type CommissionStatus = "pending" | "approved" | "paid";

// ── Lead Status Config ──────────────────────────────────────────────────

export const LEAD_STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bgColor: string }> = {
  new: { label: "New", color: "#EFFF00", bgColor: "rgba(239,255,0,0.15)" },
  contacted: { label: "Contacted", color: "#66FFAA", bgColor: "rgba(102,255,170,0.15)" },
  interested: { label: "Interested", color: "#60A5FA", bgColor: "rgba(96,165,250,0.15)" },
  store_built: { label: "Store Built", color: "#A78BFA", bgColor: "rgba(167,139,250,0.15)" },
  converted: { label: "Converted", color: "#34D399", bgColor: "rgba(52,211,153,0.15)" },
  lost: { label: "Lost", color: "#94A3B8", bgColor: "rgba(148,163,184,0.15)" },
};

/**
 * Accessible, vivid status palette for UI surfaces (chips, badges, columns).
 * `LEAD_STATUS_CONFIG.color` is the neon brand accent (great on dark charcoal,
 * unreadable as text on light) — use these mid-dark hues for text + dots so
 * status reads clearly and vividly in both light and dark mode.
 */
export const LEAD_STATUS_UI: Record<LeadStatus, { solid: string; soft: string }> = {
  new: { solid: "#D97706", soft: "rgba(217,119,6,0.12)" }, // amber-600
  contacted: { solid: "#0891B2", soft: "rgba(8,145,178,0.12)" }, // cyan-600
  interested: { solid: "#2563EB", soft: "rgba(37,99,235,0.12)" }, // blue-600
  store_built: { solid: "#7C3AED", soft: "rgba(124,58,237,0.12)" }, // violet-600
  converted: { solid: "#16A34A", soft: "rgba(22,163,74,0.12)" }, // green-600
  lost: { solid: "#64748B", soft: "rgba(100,116,139,0.12)" }, // slate-500
};

export const LEAD_PRIORITY_CONFIG: Record<LeadPriority, { label: string; color: string }> = {
  low: { label: "Low", color: "#94A3B8" },
  medium: { label: "Medium", color: "#F59E0B" },
  high: { label: "High", color: "#F97316" },
  urgent: { label: "Urgent", color: "#EF4444" },
};

/** Readable text/dot colors for priority (mirrors LEAD_STATUS_UI rationale). */
export const LEAD_PRIORITY_UI: Record<LeadPriority, string> = {
  low: "#64748B", // slate-500
  medium: "#D97706", // amber-600
  high: "#EA580C", // orange-600
  urgent: "#DC2626", // red-600
};

// Thresholds mirror the DB `compute_lead_tier` function (the source of truth that
// sets the stored `tier` column). Keep both in sync — see migration
// 20260609030000_adjust_lead_tier_thresholds.sql.
export const LEAD_TIER_CONFIG: Record<LeadTier, { label: string; minFollowers: number; color: string; icon: string }> = {
  bronze: { label: "Bronze", minFollowers: 0, color: "#CD7F32", icon: "Circle" },
  silver: { label: "Silver", minFollowers: 10000, color: "#C0C0C0", icon: "Award" },
  gold: { label: "Gold", minFollowers: 50000, color: "#FFD700", icon: "Star" },
  diamond: { label: "Diamond", minFollowers: 150000, color: "#B9F2FF", icon: "Diamond" },
  legendary: { label: "Legendary", minFollowers: 400000, color: "#FF6EFF", icon: "Crown" },
};

/**
 * Readable, high-contrast tier palette for light surfaces.
 * `LEAD_TIER_CONFIG.color` is the vivid trophy-metal brand hue (gold, ice-blue…)
 * — gorgeous as a fill or glow but unreadable as text on light. Mirrors the
 * LEAD_STATUS_UI rationale: `solid` is a mid-dark hue for badge text + dots,
 * `soft` a tinted background, and `gradient` a glossy jewel fill for the
 * merchant medallion (paired with white text).
 */
export const LEAD_TIER_UI: Record<LeadTier, { solid: string; soft: string; gradient: string }> = {
  bronze: { solid: "#B45309", soft: "rgba(180,83,9,0.12)", gradient: "linear-gradient(135deg,#CD7F32,#7C3A12)" },
  silver: { solid: "#475569", soft: "rgba(71,85,105,0.12)", gradient: "linear-gradient(135deg,#8B97A6,#3F4C5A)" },
  gold: { solid: "#A16207", soft: "rgba(161,98,7,0.14)", gradient: "linear-gradient(135deg,#D8951A,#7A4309)" },
  diamond: { solid: "#0E7490", soft: "rgba(14,116,144,0.12)", gradient: "linear-gradient(135deg,#38BDF8,#0E7490)" },
  legendary: { solid: "#A21CAF", soft: "rgba(162,28,175,0.14)", gradient: "linear-gradient(135deg,#E879F9,#A21CAF)" },
};

export const PLATFORM_CONFIG: Record<LeadSourcePlatform, { label: string; icon: string; color: string }> = {
  instagram: { label: "Instagram", icon: "Instagram", color: "#E4405F" },
  facebook: { label: "Facebook", icon: "Facebook", color: "#1877F2" },
  tiktok: { label: "TikTok", icon: "Music2", color: "#000000" },
  snapchat: { label: "Snapchat", icon: "Ghost", color: "#FFFC00" },
  youtube: { label: "YouTube", icon: "Youtube", color: "#FF0000" },
  twitter: { label: "X / Twitter", icon: "Twitter", color: "#1DA1F2" },
  linkedin: { label: "LinkedIn", icon: "Linkedin", color: "#0A66C2" },
  website: { label: "Website", icon: "Globe", color: "#6B7280" },
  referral: { label: "Referral", icon: "UserPlus", color: "#8B5CF6" },
  cold_call: { label: "Cold Call", icon: "Phone", color: "#F97316" },
  other: { label: "Other", icon: "MoreHorizontal", color: "#6B7280" },
};

// ── Pipeline flow (valid transitions) ───────────────────────────────────

export const LEAD_STATUS_FLOW: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "lost"],
  contacted: ["interested", "lost"],
  interested: ["store_built", "converted", "lost"],
  store_built: ["converted", "lost"],
  converted: [],
  lost: ["new"],
};

// ── Core Interfaces ─────────────────────────────────────────────────────

export interface LeadPhoneNumber {
  title: string;
  number: string;
}

/** An additional physical branch of a multi-location store. */
export interface LeadBranch {
  name: string;
  city: string;
  address: string;
  phones: LeadPhoneNumber[];
}

export interface Industry {
  id: string;
  name: string;
  name_ar: string | null;
  icon: string;
  color: string;
  avg_order_value_iqd: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Lead {
  id: string;
  merchant_name: string;
  industry_id: string | null;
  /** Free-text refinement of the industry (e.g. "herbs & natural products" under Health & Wellness). */
  industry_detail: string | null;
  platform: LeadSourcePlatform;
  platform_url: string | null;
  /** Social handle / username for the primary platform (e.g. Instagram @username), stored without the leading "@". */
  handle: string | null;
  follower_count: number;
  post_count: number;

  management_name: string | null;
  management_info: string | null;
  page_phone: string | null;
  phone_numbers: LeadPhoneNumber[];
  /** Page has no phone — reachable strictly via direct messages. */
  contact_via_dm: boolean;
  /** Optional standalone shop website (distinct from the social platform_url). */
  website_url: string | null;
  /** Optional contact email. */
  email: string | null;

  avg_view_count: number;
  avg_like_count: number;
  avg_comments_count: number;
  avg_order_count: number;

  estimated_daily_orders: number;
  estimated_monthly_revenue: number;

  address: string | null;
  city: string | null;
  governorate_code: string | null;
  /** Page has no physical location — online shop only. */
  is_online_only: boolean;
  /** Additional store branches, each with its own location + phone(s). */
  branches: LeadBranch[];

  /** True while this is an unfinished draft (auto-saved on accidental form exit). */
  is_draft: boolean;

  status: LeadStatus;
  priority: LeadPriority;
  lead_score: number;
  score_breakdown: Partial<{
    followers: number;
    engagement: number;
    orders: number;
    contact: number;
    platform: number;
    responsiveness: number;
    store: number;
  }>;
  tier: LeadTier;

  assigned_to: string | null;
  assigned_at: string | null;

  prospect_tenant_id: string | null;
  store_built_at: string | null;

  converted_tenant_id: string | null;
  converted_at: string | null;

  source_campaign: string | null;
  source_medium: string | null;
  source_referrer: string | null;

  tags: string[];
  custom_fields: Record<string, unknown>;

  normalized_phone: string | null;
  normalized_name: string | null;

  last_contacted_at: string | null;
  next_follow_up_at: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined data (optional)
  industry?: Industry | null;
  assigned_user?: { id: string; display_name: string | null; email: string; avatar_url: string | null } | null;
  created_by_user?: { id: string; display_name: string | null; email: string; avatar_url: string | null } | null;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type: LeadActivityType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  created_by_user?: { display_name: string | null; email: string; avatar_url: string | null } | null;
}

export interface LeadFollowUp {
  id: string;
  lead_id: string;
  assigned_to: string;
  scheduled_at: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  assigned_user?: { display_name: string | null; email: string; avatar_url: string | null } | null;
}

export interface LeadSocialLink {
  id: string;
  lead_id: string;
  platform: string;
  url: string;
  username: string | null;
  follower_count: number;
  created_at: string;
}

export interface LeadCompetitor {
  id: string;
  lead_id: string;
  competitor_lead_id: string | null;
  competitor_tenant_id: string | null;
  relationship_type: CompetitorRelationship;
  notes: string | null;
  created_at: string;
  competitor_lead?: { id: string; merchant_name: string; follower_count: number; tier: LeadTier } | null;
  competitor_tenant?: { id: string; business_name: string; slug: string } | null;
}

export interface OutreachTemplate {
  id: string;
  name: string;
  stage: LeadStatus;
  message_template: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Team & Commission Types ─────────────────────────────────────────────

export interface AdminEmployee {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  // Computed stats
  leads_added: number;
  leads_converted: number;
  stores_built: number;
  total_actions: number;
  commission_earned: number;
  commission_pending: number;
  achievements: string[];
}

export interface AdminEmployeeTracking {
  id: string;
  admin_user_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  admin_user?: { display_name: string | null; email: string; avatar_url: string | null } | null;
}

export interface CommissionConfig {
  id: string;
  name: string;
  type: CommissionType;
  config: Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeCommission {
  id: string;
  admin_user_id: string;
  lead_id: string | null;
  tenant_id: string | null;
  commission_config_id: string | null;
  period_start: string;
  period_end: string;
  orders_count: number;
  order_revenue: number;
  amount_earned: number;
  status: CommissionStatus;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  created_at: string;
  lead?: { merchant_name: string } | null;
  tenant?: { business_name: string; slug: string } | null;
}

export interface AchievementDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { key: "first_lead", name: "First Scout", description: "Add your first lead", icon: "Target", color: "#CD7F32" },
  { key: "ten_leads", name: "Lead Hunter", description: "Add 10 leads", icon: "Crosshair", color: "#C0C0C0" },
  { key: "fifty_leads", name: "Lead Machine", description: "Add 50 leads", icon: "Zap", color: "#FFD700" },
  { key: "first_conversion", name: "Closer", description: "Convert your first lead", icon: "Trophy", color: "#34D399" },
  { key: "five_conversions", name: "Deal Maker", description: "Convert 5 leads", icon: "Award", color: "#60A5FA" },
  { key: "first_store", name: "Store Builder", description: "Build your first prospect store", icon: "Store", color: "#A78BFA" },
  { key: "ten_stores", name: "Architect", description: "Build 10 prospect stores", icon: "Building2", color: "#F97316" },
  { key: "hot_streak", name: "On Fire", description: "3 conversions in 7 days", icon: "Flame", color: "#EF4444" },
  { key: "speed_demon", name: "Speed Demon", description: "Convert a lead within 48hrs", icon: "Rocket", color: "#EC4899" },
  { key: "follow_up_king", name: "Never Forgets", description: "Complete 20 follow-ups on time", icon: "Bell", color: "#22C55E" },
  { key: "legendary_catch", name: "Whale Hunter", description: "Convert a Legendary-tier lead", icon: "Crown", color: "#FF6EFF" },
  { key: "team_player", name: "Team Player", description: "Active leads in 5 different industries", icon: "Users", color: "#06B6D4" },
];

// ── Analytics Types ─────────────────────────────────────────────────────

export interface LeadAnalytics {
  total_leads: number;
  by_status: Record<LeadStatus, number>;
  by_platform: Record<string, number>;
  by_tier: Record<LeadTier, number>;
  by_industry: { industry_name: string; count: number }[];
  conversion_rate: number;
  avg_time_to_convert_days: number;
  total_estimated_revenue: number;
  top_employees: {
    user_id: string;
    display_name: string | null;
    leads_added: number;
    leads_converted: number;
    commission_earned: number;
  }[];
  monthly_trends: {
    month: string;
    added: number;
    converted: number;
  }[];
}

// ── Form Types ──────────────────────────────────────────────────────────

export interface LeadFormData {
  merchant_name: string;
  industry_id: string | null;
  /** Free-text refinement of the industry (e.g. "herbs & natural products" under Health & Wellness). */
  industry_detail: string;
  platform: LeadSourcePlatform;
  platform_url: string;
  /** Social handle / username for the primary platform (e.g. Instagram @username), stored without the leading "@". */
  handle: string;
  follower_count: number;
  post_count: number;
  management_name: string;
  management_info: string;
  page_phone: string;
  phone_numbers: LeadPhoneNumber[];
  /** Page has no phone — reachable strictly via direct messages. */
  contact_via_dm: boolean;
  /** Optional standalone shop website (distinct from the social platform_url). */
  website_url: string;
  /** Optional contact email. */
  email: string;
  avg_view_count: number;
  avg_like_count: number;
  avg_comments_count: number;
  avg_order_count: number;
  address: string;
  city: string;
  governorate_code: string;
  /** Page has no physical location — online shop only. */
  is_online_only: boolean;
  /** Additional store branches, each with its own location + phone(s). */
  branches: LeadBranch[];
  priority: LeadPriority;
  assigned_to: string | null;
  tags: string[];
  source_campaign: string;
  source_medium: string;
}

export interface LeadFilters {
  status: LeadStatus | null;
  platform: LeadSourcePlatform | null;
  priority: LeadPriority | null;
  tier: LeadTier | null;
  industry_id: string | null;
  assigned_to: string | null;
  has_store: boolean | null;
  score_min: number | null;
  score_max: number | null;
  search: string;
}
