"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * When an employee lands on /settings?linkGoogle=1 (via the admin's Flow-A claim
 * link, which just signed them into their own account), automatically start the
 * Google link. linkGoogle redirects back to /settings (no param), so it can't loop.
 */
export function AutoLinkGoogle() {
    const params = useSearchParams();
    const { linkGoogle, user, googleLinked } = useAuth();
    const fired = useRef(false);

    useEffect(() => {
        if (fired.current) return;
        if (params.get("linkGoogle") === "1" && user && !googleLinked) {
            fired.current = true;
            void linkGoogle();
        }
    }, [params, user, googleLinked, linkGoogle]);

    return null;
}
