"use client";

import { governorateLabel } from "@scheniders/shared";

/**
 * Where a customer lives, said the same way in the drawer header and the
 * profile hero: the governorate (as the list and the table name it), then the
 * neighbourhood the customer typed, quieter. Either part alone when only one
 * is known, nothing when neither is. Each part is isolated, so an Arabic
 * neighbourhood never reorders the line around it.
 */
export function CustomerPlace({ governorate, city, locale }: {
    governorate: string | null | undefined;
    city: string | null | undefined;
    locale: string;
}) {
    const gov = governorate ? governorateLabel(governorate, locale) || governorate : null;
    const place = city?.trim() || null;
    // A neighbourhood that only repeats the governorate ("Basra · Basra") adds nothing.
    const secondary = place && place !== gov && place !== governorate ? place : null;
    if (!gov && !secondary) return null;

    return (
        <span className="inline-flex items-center gap-1.5 min-w-0">
            {gov && <bdi>{gov}</bdi>}
            {secondary && (
                <span className="opacity-75 truncate">
                    {gov && <span aria-hidden className="me-1.5">·</span>}
                    <bdi>{secondary}</bdi>
                </span>
            )}
        </span>
    );
}
