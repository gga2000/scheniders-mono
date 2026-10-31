import { z } from "zod";

/** One backed-up row. Columns differ per table and per backup age, so only "an object" is promised. */
const rowSchema = z.record(z.string(), z.unknown());

const rowsSchema = z.array(rowSchema).default([]);

export const vaultFileSchema = z.object({
    metadata: z.object({
        version: z.string().min(1),
        timestamp: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid backup date"),
        counts: z.object({
            orders: z.number().int().nonnegative(),
            products: z.number().int().nonnegative(),
            customers: z.number().int().nonnegative(),
            // Added after the first backups were taken: older files carry none.
            categories: z.number().int().nonnegative().default(0),
            expenses: z.number().int().nonnegative().default(0),
            customer_tags: z.number().int().nonnegative().default(0),
            customer_tag_assignments: z.number().int().nonnegative().default(0),
            customer_notes: z.number().int().nonnegative().default(0),
        }),
    }),
    data: z.object({
        orders: rowsSchema,
        products: rowsSchema,
        customers: rowsSchema,
        categories: rowsSchema,
        expenses: rowsSchema,
        customer_tags: rowsSchema,
        customer_tag_assignments: rowsSchema,
        customer_notes: rowsSchema,
    }),
});

export type VaultRow = z.infer<typeof rowSchema>;
export type VaultData = z.infer<typeof vaultFileSchema>;
export type VaultMetadata = VaultData["metadata"];
