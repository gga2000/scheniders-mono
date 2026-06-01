"use client";

import { createContext, useContext, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

interface FinancialVisibilityContextValue {
    /** Whether financial values are currently shown. Always false for users without permission. */
    revealed: boolean;
    /** Whether the current user is allowed to reveal financial data at all. */
    canReveal: boolean;
    /** Toggle reveal on/off (no-op for users without permission). */
    toggle: () => void;
}

const FinancialVisibilityContext = createContext<FinancialVisibilityContextValue | undefined>(undefined);

export function FinancialVisibilityProvider({ children }: { children: React.ReactNode }) {
    const { role } = useAuth();
    const canReveal = role === "admin" || hasPermission(role, PERMISSIONS.VIEW_FINANCIALS);
    const [revealed, setRevealed] = useState(false);

    const toggle = useCallback(() => {
        if (!canReveal) return;
        setRevealed((r) => !r);
    }, [canReveal]);

    const value = useMemo<FinancialVisibilityContextValue>(
        () => ({ revealed: canReveal && revealed, canReveal, toggle }),
        [canReveal, revealed, toggle]
    );

    return (
        <FinancialVisibilityContext.Provider value={value}>
            {children}
        </FinancialVisibilityContext.Provider>
    );
}

export function useFinancialVisibility(): FinancialVisibilityContextValue {
    const ctx = useContext(FinancialVisibilityContext);
    // Safe fallback (e.g. rendered outside provider): keep everything hidden.
    return ctx ?? { revealed: false, canReveal: false, toggle: () => {} };
}
