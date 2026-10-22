import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Supabase records a migration by its version prefix alone. Two files that share
 * one are indistinguishable in supabase_migrations.schema_migrations: on
 * 2026-10-22 three files carried 20261021130000, only one was recorded, and a
 * second looked applied while its function did not exist.
 */
/** Collisions that predate this check and are already applied; renaming them
 *  now would desync the files from the recorded history. Do not add to this. */
const KNOWN_HISTORICAL_DUPLICATES = new Set([
    "20260411000000",
    "20260628120000",
    "20260909100000",
    "20260911120000",
]);

describe("packages/supabase/migrations", () => {
    it("gives every migration file its own version", () => {
        const dir = path.resolve(__dirname, "../../../packages/supabase/migrations");
        const byVersion = new Map<string, string[]>();
        for (const file of fs.readdirSync(dir)) {
            const match = /^(\d{14})_.+\.sql$/.exec(file);
            if (!match) continue;
            const files = byVersion.get(match[1]) ?? [];
            files.push(file);
            byVersion.set(match[1], files);
        }
        const duplicates = [...byVersion.entries()].filter(
            ([version, files]) => files.length > 1 && !KNOWN_HISTORICAL_DUPLICATES.has(version),
        );
        expect(duplicates).toEqual([]);
    });
});
