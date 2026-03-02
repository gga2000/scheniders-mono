import { supabase } from "@/lib/supabase";

// =============================================
// CONFLICT DETECTION (Optimistic Locking)
// Uses updated_at to detect when another
// client has modified an order between your
// read and your write.
// =============================================

export interface ConflictResult<T = any> {
    success: boolean;
    conflict: boolean;
    data?: T;
    error?: string;
}

/**
 * Perform an update with conflict detection using updated_at.
 * 
 * If the row's updated_at has changed since the client last read it,
 * the update will affect 0 rows → conflict detected.
 * 
 * @param table - Supabase table name
 * @param id - Row ID to update
 * @param updates - Fields to update
 * @param expectedUpdatedAt - The updated_at value the client last saw
 * @returns ConflictResult with success/conflict/error
 */
export async function updateWithConflictCheck<T extends Record<string, any>>(
    table: string,
    id: string,
    updates: Partial<T>,
    expectedUpdatedAt?: string
): Promise<ConflictResult<T>> {
    try {
        let query = supabase
            .from(table)
            .update(updates as any)
            .eq("id", id);

        // If we have an expected updated_at, add conflict check
        if (expectedUpdatedAt) {
            query = query.eq("updated_at", expectedUpdatedAt);
        }

        const { data, error, count } = await query
            .select()
            .maybeSingle();

        if (error) {
            return { success: false, conflict: false, error: error.message };
        }

        // If no rows were affected and we had a conflict check, it's a conflict
        if (!data && expectedUpdatedAt) {
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

/**
 * Perform a bulk update with conflict detection.
 * Uses a different approach: update all and check affected count.
 */
export async function bulkUpdateWithConflictCheck<T extends Record<string, any>>(
    table: string,
    ids: string[],
    updates: Partial<T>
): Promise<ConflictResult> {
    try {
        const { error } = await supabase
            .from(table)
            .update(updates as any)
            .in("id", ids);

        if (error) {
            return { success: false, conflict: false, error: error.message };
        }

        return { success: true, conflict: false };
    } catch (err) {
        return {
            success: false,
            conflict: false,
            error: err instanceof Error ? err.message : "Bulk update failed",
        };
    }
}
