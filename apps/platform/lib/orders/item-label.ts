/** The parts of an order line that name what was bought. */
export interface NamedOrderLine {
    name: string;
    variant_name?: string | null;
}

/**
 * An order line as people read it: the product, then the size or colour
 * picked, e.g. «قميص (XL / أبيض)». Cards, labels, the courier's file and
 * Prime all print this, so the person packing the parcel and the driver
 * see the same size. `variant_name` is stored apart from `name` and never
 * repeated inside it.
 */
export function orderItemLabel(line: NamedOrderLine): string {
    const variant = line.variant_name?.trim();
    return variant ? `${line.name} (${variant})` : line.name;
}
