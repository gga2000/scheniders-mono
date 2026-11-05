import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ShieldReviewDialog } from "@/components/orders/shield/shield-review-dialog";
import { orderChecks, trustOf } from "@/lib/shield/trust";
import type { ShieldNetwork } from "@/lib/shield/types";

const none = {
    band: "none", score: null, confidence: null, stores: null, outcomes: null, delivered: null, delivered_stores: null,
    bad: null, sequence: null, last_bad_orders_ago: null, trend: null,
} as const;

/** Refusals in other stores (one hits its 50-point limit), the 2+ stores pattern, and a no-answer here: 10. */
const redNetwork: ShieldNetwork = {
    phone: "7762785320", band: "red", score: 71, confidence: "high", stores: 4, outcomes: 9,
    delivered: 2, delivered_stores: 1,
    bad: { refused: { count: 4, stores: 3 }, no_answer: { count: 2, stores: 2 }, changed_mind: { count: 1, stores: 1 } },
    sequence: ["D", "R", "N", "D", "R", "R", "C", "N", "R"], last_bad_orders_ago: 0, trend: "worsening",
    trust: 10,
    trust_new: false,
    trust_steps: [
        { src: "net", kind: "delivered", pts: 0 },
        { src: "net", kind: "refused", pts: -35 },
        { src: "net", kind: "no_answer", pts: -25 },
        { src: "net", kind: "pattern", pts: -10 },
        { src: "own", kind: "delivered", pts: 15 },
        { src: "net", kind: "refused", pts: -15 },
        { src: "own", kind: "no_answer", pts: -25 },
        { src: "net", kind: "delivered", pts: 15 },
        { src: "net", kind: "changed_mind", pts: -10 },
    ],
};

const mixedOwn: ShieldNetwork = {
    phone: "7762785320", ...none, trust: 60, trust_new: false,
    trust_steps: [
        { src: "own", kind: "delivered", pts: 0 },
        { src: "own", kind: "refused", pts: -35 },
        { src: "own", kind: "delivered", pts: 15 },
        { src: "own", kind: "changed_mind", pts: -10 },
        { src: "own", kind: "delivered", pts: 15 },
        { src: "own", kind: "no_answer", pts: -25 },
    ],
};

const loyal: ShieldNetwork = {
    phone: "7762785320", ...none, trust: 100, trust_new: false,
    trust_steps: [
        { src: "own", kind: "delivered", pts: 0 },
        { src: "own", kind: "no_answer", pts: -25 },
        { src: "own", kind: "delivered", pts: 15 },
        { src: "own", kind: "delivered", pts: 10 },
        { src: "own", kind: "delivered", pts: 0 },
    ],
};

function Report({ row, address, phone = "07762785320" }: { row: ShieldNetwork | null; address: string; phone?: string }) {
    const [client] = useState(() => new QueryClient());
    const [open, setOpen] = useState(true);
    return (
        <QueryClientProvider client={client}>
            <LanguageProvider>
                <div className="min-h-screen bg-[var(--background)]">
                    <ShieldReviewDialog
                        open={open}
                        onOpenChange={setOpen}
                        customerName="ابو كافل المحمداوي"
                        phone={phone}
                        orderId="4261105031"
                        orderedAt="2026-11-05T00:10:00Z"
                        trust={trustOf(row)}
                        checks={orderChecks({ phone, addressDetails: address })}
                        network={row && row.band !== "none" ? row : null}
                        networkFailed={false}
                    />
                </div>
            </LanguageProvider>
        </QueryClientProvider>
    );
}

const meta: Meta<typeof Report> = { title: "Orders/Shield report", component: Report, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof Report>;

/** A first order: 100 with the "new" label, nothing has moved the score. */
export const NewCustomer: Story = { args: { row: null, address: "حي الجامعة قرب جامع الرحمن شارع 14 دار 7" } };

/** Other stores flag this number and the address is only the governorate. */
export const HighRisk: Story = { args: { row: redNetwork, address: "بغداد" } };

/** Refused and cancelled here before, delivered in between: yellow. */
export const CallFirst: Story = { args: { row: mixedOwn, address: "الكرادة داخل شارع 62" } };

/** One missed call long ago, healed by deliveries back to 100. */
export const Trusted: Story = { args: { row: loyal, address: "الكرادة داخل شارع 62 قرب مطعم الفقمة عمارة 4 الطابق الثاني" } };
