// =====================================================================
// Marketing-pixel event payloads (Meta / TikTok standard events)
// =====================================================================
// Pure builders shared by the client tracker (fbq/ttq) and the server-side
// Conversions API sender, so a browser event and its server twin carry the
// IDENTICAL content/value — required for event deduplication via event_id.
// =====================================================================

export interface PixelContent {
  id: string;
  quantity: number;
  item_price: number;
}

export interface PixelEventData {
  content_ids: string[];
  contents: PixelContent[];
  value: number;
  /** Iraq market — always IQD. */
  currency: "IQD";
  num_items: number;
}

export function pixelContentsFromItems(
  items: ReadonlyArray<{ product_id: string; price: number; quantity: number }>,
): PixelEventData {
  const contents: PixelContent[] = items.map((i) => ({
    id: i.product_id,
    quantity: Math.max(0, Math.floor(i.quantity)),
    item_price: Math.max(0, i.price),
  }));
  return {
    content_ids: contents.map((c) => c.id),
    contents,
    value: contents.reduce((s, c) => s + c.item_price * c.quantity, 0),
    currency: "IQD",
    num_items: contents.reduce((s, c) => s + c.quantity, 0),
  };
}

export function pixelContentFromProduct(p: {
  id: string;
  price: number;
}): PixelEventData {
  return pixelContentsFromItems([
    { product_id: p.id, price: p.price, quantity: 1 },
  ]);
}

/**
 * CAPI access tokens are stored in `globals.analytics_pixels.base` but are
 * SERVER-ONLY secrets. The full store config is serialized into the client
 * section tree, so strip the tokens before any config crosses to the browser.
 * (Pixel IDs stay — they're public by design.) Returns the config unchanged
 * when there's nothing to redact.
 */
const CAPI_SECRET_KEYS = [
  "meta_capi_token",
  "tiktok_capi_token",
  "capi_test_event_code",
] as const;

export function redactServerOnlyConfig<
  T extends { globals?: { analytics_pixels?: { base?: Record<string, unknown> } } } | null | undefined,
>(config: T): T {
  const base = config?.globals?.analytics_pixels?.base;
  if (!base || !CAPI_SECRET_KEYS.some((k) => k in base)) return config;
  const cleanBase: Record<string, unknown> = { ...base };
  for (const k of CAPI_SECRET_KEYS) delete cleanBase[k];
  return {
    ...config,
    globals: {
      ...config!.globals,
      analytics_pixels: { ...config!.globals!.analytics_pixels, base: cleanBase },
    },
  } as T;
}
