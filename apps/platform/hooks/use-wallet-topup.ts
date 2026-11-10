"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";

export const TOPUP_METHODS = ["zain_cash", "qi_card"] as const;
export type TopupMethod = (typeof TOPUP_METHODS)[number];

/** Limits the database enforces on a request; the form checks them first. */
export const TOPUP_MIN_IQD = 1_000;
export const TOPUP_MAX_IQD = 10_000_000;
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

const RECEIPT_EXT: Readonly<Record<string, string>> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
};

export type ReceiptProblem = "type" | "size";

/** Why a file cannot be a receipt, or null when it can. */
export function receiptProblem(file: Pick<File, "type" | "size">): ReceiptProblem | null {
    if (!RECEIPT_EXT[file.type]) return "type";
    if (file.size > RECEIPT_MAX_BYTES) return "size";
    return null;
}

const paymentDetailsSchema = z.object({
    zain_cash: z.string().nullable(),
    qi_card: z.string().nullable(),
});
export type TopupPaymentDetails = z.infer<typeof paymentDetailsSchema>;

export interface TopupRequest {
    id: string;
    amount_iqd: number;
    method: TopupMethod;
    created_at: string;
    decided_at: string | null;
    outcome: "approved" | "rejected" | null;
}

export function useWalletTopup() {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();

    /** Where shops send the money; set by our team. Null fields mean not set yet. */
    const paymentDetails = useQuery({
        queryKey: ["topup_payment_details"],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_topup_payment_details");
            if (error) throw error;
            return paymentDetailsSchema.parse(data ?? { zain_cash: null, qi_card: null });
        },
        staleTime: 5 * 60_000,
    });

    const requests = useQuery({
        queryKey: ["wallet_topup_requests", tenantId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("wallet_topup_requests")
                .select("id, amount_iqd, method, created_at, decided_at, outcome")
                .eq("tenant_id", tenantId!)
                .order("created_at", { ascending: false })
                .limit(20);
            if (error) throw error;
            return data as TopupRequest[];
        },
        enabled: !!tenantId,
    });

    const submit = useMutation({
        mutationFn: async (input: { amount: number; method: TopupMethod; file: File }) => {
            if (!tenantId) throw new Error("No shop selected");
            const ext = RECEIPT_EXT[input.file.type];
            if (!ext) throw new Error("Unsupported receipt type");
            // The folder must be the shop's id: storage and the table both check it.
            const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
            const upload = await supabase.storage
                .from("wallet-receipts")
                .upload(path, input.file, { contentType: input.file.type, upsert: false });
            if (upload.error) throw upload.error;
            const { error } = await supabase.from("wallet_topup_requests").insert({
                tenant_id: tenantId,
                amount_iqd: input.amount,
                method: input.method,
                receipt_path: path,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["wallet_topup_requests", tenantId] });
        },
    });

    return {
        paymentDetails: paymentDetails.data ?? null,
        paymentDetailsLoading: paymentDetails.isLoading,
        requests: requests.data ?? [],
        submit,
    };
}
