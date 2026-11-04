import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ShieldReviewDialog } from "@/components/orders/shield/shield-review-dialog";
import { deliveryChance, type OwnHistory } from "@/lib/shield/delivery-chance";
import type { ShieldNetwork } from "@/lib/shield/types";

const NOW = new Date("2026-11-04T13:30:00Z");

const redNetwork: ShieldNetwork = {
    phone: "7701234567", band: "red", score: 71, confidence: "high", stores: 4, outcomes: 9,
    delivered: 2, delivered_stores: 1,
    bad: { refused: { count: 4, stores: 3 }, no_answer: { count: 2, stores: 2 }, changed_mind: { count: 1, stores: 1 } },
    sequence: ["D", "R", "N", "D", "R", "R", "C", "N", "R"], last_bad_orders_ago: 0, trend: "worsening",
};

function Report({ network, own, address, channel, items }: { network: ShieldNetwork | null; own: OwnHistory | null; address: string; channel: string; items: number }) {
    const [client] = useState(() => new QueryClient());
    const [open, setOpen] = useState(true);
    const result = deliveryChance({
        phone: "07762785320", status: "new", createdAt: "2026-11-04T12:10:00Z", addressDetails: address,
        itemLines: items, adChannel: channel, own, network, now: NOW,
    });
    return (
        <QueryClientProvider client={client}>
            <LanguageProvider>
                <div className="min-h-screen bg-[var(--background)]">
                    <ShieldReviewDialog
                        open={open}
                        onOpenChange={setOpen}
                        customerName="ابو كافل المحمداوي"
                        phone="07762785320"
                        orderId="4261104031"
                        orderedAt="2026-11-04T12:10:00Z"
                        result={result}
                        network={network}
                        networkFailed={false}
                        own={own}
                    />
                </div>
            </LanguageProvider>
        </QueryClientProvider>
    );
}

const meta: Meta<typeof Report> = { title: "Orders/Shield report", component: Report, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof Report>;

/** First order, no network yet: the state every order shows while only one store is live. */
export const FirstOrder: Story = { args: { network: null, own: null, address: "حي الجامعة قرب جامع الرحمن شارع 14 دار 7", channel: "instagram", items: 1 } };

/** A customer other stores flag: refusals in 3 stores, short address, Facebook ad. */
export const HighRisk: Story = { args: { network: redNetwork, own: { delivered: 0, refused: 1, noAnswer: 1 }, address: "بغداد", channel: "facebook", items: 1 } };

/** A known good customer: delivered here before, full address, two products. */
export const LowRisk: Story = { args: { network: null, own: { delivered: 3, refused: 0, noAnswer: 0 }, address: "الكرادة داخل شارع 62 قرب مطعم الفقمة عمارة 4 الطابق الثاني", channel: "", items: 2 } };
