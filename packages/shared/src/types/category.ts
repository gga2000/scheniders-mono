export type CategoryStatus = "draft" | "published" | "archived";
export type NavVariant = "pills" | "cards" | "icons";
export type CategoryRuleSource = "manual" | "rule" | "import";

export type CategoryPageLayout = "grid" | "list" | "mixed";
export type CategoryPageSort =
  | "manual"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "best_selling";
export type CategoryPageFilter = "price" | "brand" | "tags" | "availability";

export type CategoryPageBlock =
  | {
      id: string;
      type: "hero";
      props: { title: string; subtitle?: string; image_url?: string };
    }
  | {
      id: string;
      type: "featured_products";
      props: { product_ids: string[] };
    }
  | {
      id: string;
      type: "subcategory_grid";
      props: { variant: NavVariant };
    }
  | {
      id: string;
      type: "product_list";
      props: { per_page: number; sort: CategoryPageSort };
    }
  | {
      id: string;
      type: "rich_text";
      props: { html: string };
    };

export interface CategoryPageConfig {
  layout: CategoryPageLayout;
  products_per_page: number;
  default_sort: CategoryPageSort;
  filters_enabled: CategoryPageFilter[];
  blocks?: CategoryPageBlock[];
}

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  slug: string;
  description: string | null;
  description_ar: string | null;
  description_en: string | null;
  image_url: string | null;
  banner_url: string | null;
  accent_color: string | null;
  icon: string | null;
  parent_id: string | null;
  display_order: number;
  is_visible: boolean;
  status: CategoryStatus;
  published_at: string | null;
  unpublish_at: string | null;
  archived_at: string | null;
  show_in_main_nav: boolean;
  show_in_mega_menu: boolean;
  show_in_mobile_drawer: boolean;
  nav_variant: NavVariant;
  page_config: CategoryPageConfig;
  page_config_draft: CategoryPageConfig | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  canonical_url: string | null;
  landing_page_url: string | null;
  brand_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCategoryAssignment {
  id: string;
  tenant_id: string;
  product_id: string;
  category_id: string;
  is_primary: boolean;
  is_featured: boolean;
  featured_order: number | null;
  source: CategoryRuleSource;
  rule_id: string | null;
  created_at: string;
}

export interface Collection {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  banner_url: string | null;
  accent_color: string | null;
  status: CategoryStatus;
  start_at: string | null;
  end_at: string | null;
  display_order: number;
  page_config: CategoryPageConfig;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
}

export type CategoryRuleField =
  | "price"
  | "tags"
  | "vendor"
  | "brand"
  | "stock_status"
  | "name_contains"
  | "created_after"
  | "has_image"
  | "product_type";

export type CategoryRuleOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "contains"
  | "starts_with";

export interface CategoryRuleCondition {
  field: CategoryRuleField;
  op: CategoryRuleOp;
  value: unknown;
}

export interface CategoryRuleData {
  match: "all" | "any";
  conditions: CategoryRuleCondition[];
}

export interface CategoryRule {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  rule_data: CategoryRuleData;
  is_active: boolean;
  last_evaluated_at: string | null;
  matched_count: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryRedirect {
  id: string;
  tenant_id: string;
  from_slug: string;
  to_slug: string;
  status_code: number;
  reason: string | null;
  created_at: string;
}

export interface CategoryRelated {
  id: string;
  tenant_id: string;
  category_id: string;
  related_category_id: string;
  source: "manual" | "auto";
  score: number | null;
  display_order: number;
  created_at: string;
}

export interface CategoryExperimentMetrics {
  a: { views: number; orders: number; revenue: number };
  b: { views: number; orders: number; revenue: number };
}

export interface CategoryExperiment {
  id: string;
  tenant_id: string;
  category_id: string;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  variant_a: CategoryPageConfig;
  variant_b: CategoryPageConfig;
  traffic_split: number;
  metrics: CategoryExperimentMetrics;
  started_at: string | null;
  ended_at: string | null;
  winner: "a" | "b" | "inconclusive" | null;
  created_at: string;
}

export const DEFAULT_CATEGORY_PAGE_CONFIG: CategoryPageConfig = {
  layout: "grid",
  products_per_page: 24,
  default_sort: "manual",
  filters_enabled: ["price", "availability"],
};
