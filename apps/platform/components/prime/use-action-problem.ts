import { useLanguage } from "@/hooks/use-language";
import type { PrimeStatementActionAnswer } from "@/hooks/use-prime-statements";

/** What a failed statement action means for the person who pressed it. */
export function useActionProblem() {
    const { t } = useLanguage();
    return (answer: PrimeStatementActionAnswer): string | null => {
        if (answer.success) return null;
        switch (answer.reason) {
            case "prime_unreachable":
            case "not_connected":
                return t("orders.prime.unreachable");
            case "conflict":
                return t("prime.cash.error.conflict");
            case "prepaid":
                return t("prime.cash.error.prepaid");
            case "not_on_payment":
                return t("prime.cash.error.notOnPayment");
            case "unknown_payment":
                return t("prime.cash.error.unknownPayment");
            case "prime_rejected":
                return t("prime.cash.error.failed");
        }
    };
}
