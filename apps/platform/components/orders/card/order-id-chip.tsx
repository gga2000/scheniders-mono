import { HighlightedText } from "@scheniders/ui/highlighted-text";
import { getDisplayOrderId } from "@/lib/order-format-utils";

const chip = "px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10";

/** The order number on a compact card: `#1234`, or a CHK tag for an abandoned checkout. */
export function OrderIdChip({ orderId, query }: { orderId: string; query: string }) {
    const id = getDisplayOrderId(orderId);
    if (orderId?.startsWith("CHK-")) {
        return (
            <span className="flex items-center gap-1">
                <span className={`${chip} uppercase font-bold text-[11px]`}>CHK</span>
                <span className={chip}>
                    <HighlightedText text={id} query={query} />
                </span>
            </span>
        );
    }
    return (
        <span className={chip}>
            #<HighlightedText text={id} query={query} />
        </span>
    );
}
