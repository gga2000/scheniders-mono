import { supabase } from "@/lib/supabase";

// =============================================
// CONFLICT DETECTION (Optimistic Locking)
// Uses the server-maintained `version` column to
// detect when another client has modified a row
// between your read and your write.
//
// `updated_at` is NOT usable as the token: platform
// UPDATEs never set it, so the guard silently passed
// and writes overwrote each other (CON-1). `version`
// is bumped by a BEFORE UPDATE trigger on every write
// and cannot be fabricated by a client.
// =============================================

export interface ConflictResult<T = unknown> {
    success: boolean;
    conflict: boolean;
    data?: T;
    error?: string;
}

/**
 * Perform an update with conflict detection using `version`.
 *
 * If the row's version has advanced since the client last read it, the update
 * matches 0 rows → conflict detected.
 *
 * @param table - Supabase table name
 * @param id - Row ID to update
 * @param updates - Fields to update
 * @param expectedVersion - The `version` the client last saw
 * @returns ConflictResult with success/conflict/error
 */
export async function updateWithConflictCheck<T extends Record<string, unknown>>(
    table: string,
    id: string,
    updates: Partial<T>,
    expectedVersion?: number
): Promise<ConflictResult<T>> {
    try {
        let query = supabase
            .from(table)
            .update(updates as Record<string, unknown>)
            .eq("id", id);

        // If we have an expected version, add the conflict check
        if (typeof expectedVersion === "number") {
            query = query.eq("version", expectedVersion);
        }

        const { data, error, count } = await query
            .select()
            .maybeSingle();

        if (error) {
            return { success: false, conflict: false, error: error.message };
        }

        // If no rows were affected and we had a conflict check, it's a conflict
        if (!data && typeof expectedVersion === "number") {
            return {
                success: false,
                conflict: true,
                error: "This order was modified by another employee. Please refresh to see the latest changes.",
            };
        }

        return { success: true, conflict: false, data: data as T };
    } catch (err) {
        return {
            success: false,
            conflict: false,
            error: err instanceof Error ? err.message : "Update failed",
        };
    }
}

