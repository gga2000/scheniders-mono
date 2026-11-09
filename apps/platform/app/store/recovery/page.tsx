"use client";

import { useAbandonedCarts } from "@/hooks/use-abandoned-carts";
import { useCartRecoverySetting } from "@/hooks/use-cart-recovery-setting";
import { RecoveryBoard } from "@/components/store-engagement/recovery-board";

export default function RecoveryPage() {
    const { data: carts = [], isLoading, isError } = useAbandonedCarts();
    const { data: autoReminders } = useCartRecoverySetting();
    return <RecoveryBoard carts={carts} isLoading={isLoading} isError={isError} autoReminders={autoReminders ?? null} />;
}
