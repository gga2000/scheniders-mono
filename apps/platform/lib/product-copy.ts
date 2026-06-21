// =====================================================================
// AI trilingual product-copy generation — prompt + parse (pure)
// =====================================================================
// Builds the Anthropic Messages prompt and validates the structured-output
// JSON the model returns. Kept transport-free so it's unit-testable; the route
// (/api/ai/product-copy) owns the fetch + auth. ar/en/ku for the Iraq market.
// =====================================================================

import { z } from "zod";

export interface LocaleCopy {
    title: string;
    description: string;
}
export interface ProductCopy {
    en: LocaleCopy;
    ar: LocaleCopy;
    ku: LocaleCopy;
}

export interface ProductCopyInput {
    name: string;
    category?: string;
    hints?: string;
    tone?: "friendly" | "luxury" | "playful" | "minimal";
}

// JSON Schema for output_config.format. Only structured-output-safe keywords
// (no min/maxLength, no numeric constraints) — length is steered in the prompt.
const localeProps = {
    type: "object",
    properties: {
        title: { type: "string" },
        description: { type: "string" },
    },
    required: ["title", "description"],
    additionalProperties: false,
} as const;

export const PRODUCT_COPY_SCHEMA = {
    type: "object",
    properties: { en: localeProps, ar: localeProps, ku: localeProps },
    required: ["en", "ar", "ku"],
    additionalProperties: false,
} as const;

export function buildProductCopyMessages(
    input: ProductCopyInput,
): Array<{ role: "user"; content: string }> {
    const tone = input.tone ?? "friendly";
    const lines = [
        "Write e-commerce product copy for an Iraqi online store.",
        `Product: ${input.name}`,
        input.category ? `Category: ${input.category}` : "",
        input.hints ? `Extra details: ${input.hints}` : "",
        `Tone: ${tone}.`,
        "For EACH language produce a short catchy title (around 60 characters) and a persuasive description of 2–3 sentences. Languages:",
        "- en: English",
        "- ar: Modern Standard Arabic, natural for Iraqi shoppers",
        "- ku: Sorani Kurdish",
        "Currency is IQD. Never invent specs, sizes, or claims that weren't provided.",
    ].filter(Boolean);
    return [{ role: "user", content: lines.join("\n") }];
}

const localeSchema = z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
});
const copySchema = z.object({
    en: localeSchema,
    ar: localeSchema,
    ku: localeSchema,
});

/** Parse + validate the model's structured-output JSON. Null when malformed. */
export function parseProductCopy(text: string | null | undefined): ProductCopy | null {
    if (!text) return null;
    try {
        const parsed = copySchema.safeParse(JSON.parse(text));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}
