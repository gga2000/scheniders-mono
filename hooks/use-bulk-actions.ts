"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { PaginatedCustomer } from "./use-paginated-customers";

export function useCustomerBulkActions() {
    const queryClient = useQueryClient();
    const [isExporting, setIsExporting] = useState(false);
    const [isTagging, setIsTagging] = useState(false);

    /**
     * Exports the provided array of customer IDs to a CSV file.
     * Since the frontend only holds the currently selected IDs (via the Set),
     * we fetch the full details for those IDs from Supabase to ensure we get 
     * fresh, complete data for the export.
     */
    const exportToCSV = async (customerIds: string[]) => {
        if (!customerIds.length) return;
        setIsExporting(true);

        try {
            // Fetch the full customer rows for the selected phones
            const { data, error } = await supabase
                .from("customers")
                .select("phone, name, city, governorate, blacklisted")
                .in("phone", customerIds);

            if (error) throw error;

            if (!data || data.length === 0) {
                throw new Error("No customer data found for the selected IDs.");
            }

            // Define CSV headers
            const headers = ["Phone Number", "Name", "City", "Governorate", "Blacklisted"];

            // Map rows to CSV format
            const csvRows = data.map((customer: any) => [
                `"${customer.phone || ""}"`, // Quoted to prevent Excel from formatting as scientific notation
                `"${(customer.name || "").replace(/"/g, '""')}"`,
                `"${customer.city || ""}"`,
                `"${customer.governorate || ""}"`,
                customer.blacklisted ? "Yes" : "No"
            ].join(","));

            // Combine
            const csvContent = [headers.join(","), ...csvRows].join("\n");

            // Trigger download
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);

            link.setAttribute("href", url);
            link.setAttribute("download", `customer_export_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Failed to export customers to CSV:", error);
            throw error;
        } finally {
            setIsExporting(false);
        }
    };

    /**
     * Adds an array of tag IDs to an array of customer phone numbers.
     * Inserts records into the junction table `customer_tag_assignments`.
     */
    const bulkAddTags = async (customerPhones: string[], tagIds: string[]) => {
        if (!customerPhones.length || !tagIds.length) return;
        setIsTagging(true);

        try {
            // Prepare the bulk insert payload
            // For every selected customer, we assign every selected tag
            const payload = [];
            for (const phone of customerPhones) {
                for (const tagId of tagIds) {
                    payload.push({
                        customer_phone: phone,
                        tag_id: tagId
                    });
                }
            }

            // Perform an upsert to avoid duplicate key errors if a customer already has the tag
            const { error } = await supabase
                .from("customer_tag_assignments")
                .upsert(payload, { onConflict: "customer_phone,tag_id" });

            if (error) {
                console.error("Supabase Error assigning tags in bulk:", error);
                throw error;
            }

            // Allow the query client to refetch tag data globally
            await queryClient.invalidateQueries({ queryKey: ["customer_tags"] });
            await queryClient.invalidateQueries({ queryKey: ["customers"] });

        } catch (error) {
            console.error("Failed to assign tags:", error);
            throw error;
        } finally {
            setIsTagging(false);
        }
    };

    return {
        exportToCSV,
        isExporting,
        bulkAddTags,
        isTagging,
    };
}
