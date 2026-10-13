import { getGovernorateSelectOptions } from "@/lib/address-validator";

/**
 * Governorate <option>s shared by the new-order and edit-order modals — numbered,
 * capital in parentheses, value = Arabic name (what `orders.city` stores).
 * Render inside a <select> after its placeholder option.
 */
export function GovernorateOptions() {
    return (
        <>
            {getGovernorateSelectOptions().map((option) => (
                <option key={option.code} value={option.value}>
                    {option.label}
                </option>
            ))}
        </>
    );
}
