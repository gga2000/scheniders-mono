import type { VariantFormData } from "@/hooks/use-product-editor";

export type VariantPatch = Partial<Pick<VariantFormData, "name" | "price" | "cost" | "sku" | "option_values" | "image_url" | "is_enabled">>;

/** The fields of a loaded variant the editor changed; cost only when the user may see it. */
export function variantChanges(before: VariantFormData | undefined, after: VariantFormData, showCost: boolean): VariantPatch {
    const patch: VariantPatch = {};
    if (!before || before.name !== after.name) patch.name = after.name;
    if (!before || before.price !== after.price) patch.price = after.price;
    if (!before || before.sku !== after.sku) patch.sku = after.sku;
    if (!before || JSON.stringify(before.option_values ?? {}) !== JSON.stringify(after.option_values ?? {})) {
        patch.option_values = after.option_values;
    }
    if (!before || (before.image_url ?? "") !== (after.image_url ?? "")) patch.image_url = after.image_url;
    if (!before || (before.is_enabled ?? true) !== (after.is_enabled ?? true)) patch.is_enabled = after.is_enabled ?? true;
    if (showCost && (!before || before.cost !== after.cost)) patch.cost = after.cost;
    return patch;
}
