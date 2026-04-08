import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useCustomerUrlState } from "./use-customer-url-state";
import { CustomerFilterPreset } from "@/components/customers/saved-views-tabs";

export function useCustomerFilterPresets() {
    const [presets, setPresets] = useState<CustomerFilterPreset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { state, setSearch, setStatus, setCity, setSort, setAdvancedFilters } = useCustomerUrlState();

    // Fetch presets from database
    useEffect(() => {
        fetchPresets();
    }, []);

    const fetchPresets = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from("customer_filter_presets")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            setPresets(data || []);
        } catch (error) {
            console.error("Failed to fetch filter presets:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const savePreset = async (name: string) => {
        try {
            const { data, error } = await supabase
                .from("customer_filter_presets")
                .insert({
                    name,
                    filters: {
                        search: state.search,
                        status: state.status,
                        city: state.city,
                        minLtv: state.minLtv,
                        maxLtv: state.maxLtv,
                        lastOrderWithinDays: state.lastOrderWithinDays,
                        tagId: state.tagId,
                        sortBy: state.sortBy,
                        sortOrder: state.sortOrder,
                    },
                })
                .select()
                .single();

            if (error) throw error;
            if (data) {
                setPresets((prev) => [data, ...prev]);
            }
        } catch (error) {
            console.error("Failed to save preset:", error);
        }
    };

    const deletePreset = async (presetId: string) => {
        try {
            const { error } = await supabase
                .from("customer_filter_presets")
                .delete()
                .eq("id", presetId);

            if (error) throw error;
            setPresets((prev) => prev.filter((p) => p.id !== presetId));
        } catch (error) {
            console.error("Failed to delete preset:", error);
        }
    };

    const applyPreset = (preset: CustomerFilterPreset) => {
        const filters = preset.filters as any;
        setSearch(filters.search || "");
        setStatus(filters.status || "all");
        setCity(filters.city || "");
        setSort(filters.sortBy || "last_order_date", filters.sortOrder || "desc");
        setAdvancedFilters({
            minLtv: filters.minLtv,
            maxLtv: filters.maxLtv,
            lastOrderWithinDays: filters.lastOrderWithinDays,
            tagId: filters.tagId,
        });
    };

    return {
        presets,
        isLoading,
        savePreset,
        deletePreset,
        applyPreset,
        refreshPresets: fetchPresets,
    };
}
