"use client";

import { Suspense } from "react";
import { PrimePage } from "@/components/prime/prime-page";

export default function PrimeRoute() {
    // useSearchParams (the list a link opens) needs a Suspense boundary.
    return (
        <Suspense>
            <PrimePage />
        </Suspense>
    );
}
