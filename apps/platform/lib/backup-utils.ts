import { supabase } from "@/lib/supabase";

// Define the shape of our snapshot
export interface DatabaseSnapshot {
    version: number;
    timestamp: string;
    source: string;
    data: {
        orders: any[];
        customers: {
            metadata: any[];
            notes: any[];
            tags: any[];
            assignments: any[];
        };
        // Add other entities as needed
    };
}

const CURRENT_VERSION = 1;

export async function generateFullSnapshot(): Promise<DatabaseSnapshot> {
    try {
        // Parallel fetch for speed
        const [
            { data: orders },
            { data: metadata },
            { data: notes },
            { data: tags },
            { data: assignments },
        ] = await Promise.all([
            supabase.from('orders').select('*'),
            supabase.from('customer_metadata').select('*'),
            supabase.from('customer_notes').select('*'),
            supabase.from('customer_tags').select('*'),
            supabase.from('customer_tag_assignments').select('*'),
        ]);

        return {
            version: CURRENT_VERSION,
            timestamp: new Date().toISOString(),
            source: 'admin_dashboard',
            data: {
                orders: orders || [],
                customers: {
                    metadata: metadata || [],
                    notes: notes || [],
                    tags: tags || [],
                    assignments: assignments || [],
                },
            }
        };
    } catch (error) {
        console.error("Snapshot generation failed:", error);
        throw new Error("Failed to generate snapshot");
    }
}

export async function restoreFromSnapshot(snapshot: DatabaseSnapshot): Promise<{ success: boolean; error?: string }> {
    try {
        if (!snapshot.version || snapshot.version !== CURRENT_VERSION) {
            return { success: false, error: "Incompatible snapshot version" };
        }

        // Restore logic: Upsert everything
        // We do this sequentially to respect dependencies (e.g. tags must exist before assignments)

        // 1. Tags (Independent)
        if (snapshot.data.customers.tags?.length) {
            const { error } = await supabase.from('customer_tags').upsert(snapshot.data.customers.tags, { onConflict: 'id' });
            if (error) throw error;
        }

        // 2. Orders (Independent-ish)
        if (snapshot.data.orders?.length) {
            // Chunked insert if necessary, but Supabase handles reasonably large payloads
            const { error } = await supabase.from('orders').upsert(snapshot.data.orders, { onConflict: 'id' });
            if (error) throw error;
        }

        // 3. Customer Metadata
        if (snapshot.data.customers.metadata?.length) {
            const { error } = await supabase.from('customer_metadata').upsert(snapshot.data.customers.metadata, { onConflict: 'customer_phone' });
            if (error) throw error;
        }

        // 4. Customer Notes
        if (snapshot.data.customers.notes?.length) {
            const { error } = await supabase.from('customer_notes').upsert(snapshot.data.customers.notes, { onConflict: 'id' });
            if (error) throw error;
        }

        // 5. Tag Assignments (Dependent on Tags)
        if (snapshot.data.customers.assignments?.length) {
            const { error } = await supabase.from('customer_tag_assignments').upsert(snapshot.data.customers.assignments, { onConflict: 'id' });
            if (error) throw error;
        }

        return { success: true };
    } catch (error: any) {
        console.error("Restore failed:", error);
        return { success: false, error: error.message || "Unknown restore error" };
    }
}

// Download helper
export function downloadSnapshot(snapshot: DatabaseSnapshot, filename?: string) {
    const name = filename || `snapshot_${new Date().toISOString().split('T')[0]}.json`;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
