/** Fields shared by both platform and storefront Product types. */
export interface BaseProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  stock_quantity: number;
  reserved_quantity: number;
  sku?: string | null;
  is_archived: boolean;
}

/** Fields shared by both platform and storefront ProductVariant types. */
export interface BaseProductVariant {
  id: string;
  product_id: string;
  name: string;
  price?: number | null;
  stock_quantity: number;
  sku?: string | null;
}
