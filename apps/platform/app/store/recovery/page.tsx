"use client";

import { useAbandonedCarts } from "@/hooks/use-abandoned-carts";
import { RecoveryBoard } from "@/components/store-engagement/recovery-board";

export default function RecoveryPage() {
    const { data: carts = [], isLoading, isError } = useAbandonedCarts();
    return <RecoveryBoard carts={carts} isLoading={isLoading} isError={isError} />;
}
