import { z } from "zod";

// =============================================
// Zod Schemas for Store Config Validation
// =============================================
// Runtime validation used before persisting store config.

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color");

export const designTokenColorsSchema = z.object({
    primary: hexColor,
    secondary: hexColor,
    accent: hexColor,
    background: hexColor.optional(),
    text: hexColor.optional(),
});

export const designTokenFontsSchema = z.object({
    heading: z.string().min(1).max(100),
    body: z.string().min(1).max(100),
    pairing_id: z.string().optional(),
});

export const designTokensSchema = z.object({
    colors: designTokenColorsSchema.optional(),
    fonts: designTokenFontsSchema.optional(),
    radius: z.enum(["none", "sm", "md", "lg", "full"]).optional(),
    spacing: z.enum(["compact", "comfortable", "spacious"]).optional(),
    shadows: z.enum(["flat", "subtle", "elevated"]).optional(),
});

export const sectionAnimationSchema = z.object({
    type: z.enum(["none", "fade", "slide", "scale"]),
    duration: z.number().min(0).max(5000).optional(),
    delay: z.number().min(0).max(5000).optional(),
});

export const sectionConfigSchema = z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    enabled: z.boolean(),
    variant: z.string().optional(),
    data: z.record(z.string(), z.unknown()),
    animation: sectionAnimationSchema.optional(),
});

export const seoConfigSchema = z.object({
    meta_title: z.string().max(70).optional(),
    meta_description: z.string().max(200).optional(),
    og_image_url: z.string().url().optional(),
    canonical_url: z.string().url().optional(),
});

export const heroConfigSchema = z.object({
    title: z.string().max(200).optional(),
    subtitle: z.string().max(500).optional(),
    cta_text: z.string().max(100).optional(),
    image_url: z.string().url().optional(),
});

export const aboutConfigSchema = z.object({
    enabled: z.boolean().optional(),
    title: z.string().max(200).optional(),
    body: z.string().max(5000).optional(),
});

export const contactConfigSchema = z.object({
    whatsapp_number: z.string().max(30).optional(),
    instagram: z.string().max(100).optional(),
    facebook: z.string().max(200).optional(),
    tiktok: z.string().max(100).optional(),
});

export const storeConfigSchema = z.object({
    template: z.enum(["fashion", "beauty", "electronics", "general", "clean"]).optional(),
    hero: heroConfigSchema.optional(),
    about: aboutConfigSchema.optional(),
    contact: contactConfigSchema.optional(),
    sections_order: z.array(z.string()).optional(),
    enable_whatsapp_order: z.boolean().optional(),
    design_tokens: designTokensSchema.optional(),
    logo_url: z.string().url().optional(),
    custom_css: z.string().max(10000).optional(),
    sections: z.array(sectionConfigSchema).optional(),
    seo: seoConfigSchema.optional(),
});

export type ValidatedStoreConfig = z.infer<typeof storeConfigSchema>;
