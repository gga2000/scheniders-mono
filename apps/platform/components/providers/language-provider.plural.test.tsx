import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { LanguageProvider } from "./language-provider";
import { useLanguage } from "@/hooks/use-language";

const wrapper = ({ children }: { children: ReactNode }) => <LanguageProvider>{children}</LanguageProvider>;

describe("t() singular forms", () => {
    it("uses the .one entry for a count of 1 and the plural otherwise", () => {
        localStorage.setItem("schneiders_language", "en");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        expect(result.current.t("finances.invoices.kpi.outSub", { count: 1 })).toBe("1 expense");
        expect(result.current.t("finances.invoices.kpi.outSub", { count: 3 })).toBe("3 expenses");
        expect(result.current.t("finances.invoices.kpi.outSub", { count: 0 })).toBe("0 expenses");
    });

    it("falls back to the normal entry in a language with no singular form", () => {
        localStorage.setItem("schneiders_language", "ar");
        const { result } = renderHook(() => useLanguage(), { wrapper });
        expect(result.current.t("finances.invoices.kpi.outSub", { count: 1 })).toBe("1 مصروف");
    });
});
