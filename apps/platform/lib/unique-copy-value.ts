/**
 * The slug or SKU for a duplicated product: `<value>-copy`, or `<value>-copy-2`,
 * `-copy-3` … when that is already taken. Slugs and SKUs are unique per store,
 * so copying a product twice used to fail on the second copy.
 */
export function uniqueCopyValue(value: string, taken: ReadonlySet<string>): string {
    const base = `${value}-copy`;
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
        const candidate = `${base}-${n}`;
        if (!taken.has(candidate)) return candidate;
    }
}
