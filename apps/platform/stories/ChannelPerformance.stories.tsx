import type { Meta, StoryObj } from "@storybook/nextjs";
import { ChannelPerformance } from "@/components/reports/channel-performance";
import { LanguageProvider } from "@/components/providers/language-provider";
import { calculateChannelPerformance, type ChannelFact } from "@/lib/analytics/channel-metrics";

/**
 * The reports page's ad-channel card, in the states that are hard to reach by
 * hand: the page needs an admin session, and the interesting mixes (a network
 * that matches another on volume and collapses on delivery, a period with no
 * attribution at all) depend on the tenant and the date range.
 */
const meta: Meta<typeof ChannelPerformance> = {
    title: "Reports/Channel Performance",
    component: ChannelPerformance,
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <LanguageProvider>
                <div style={{ width: 900, maxWidth: "100%" }}>
                    <Story />
                </div>
            </LanguageProvider>
        ),
    ],
    args: { loading: false, error: null, onRetry: () => {} },
};
export default meta;

type Story = StoryObj<typeof ChannelPerformance>;

const many = (count: number, ad_channel: string | null, status: string, price: number): ChannelFact[] =>
    Array.from({ length: count }, () => ({ ad_channel, status, price }));

// Shaped after the live mix (2026-08-15 → 09-15): TikTok trails Facebook on
// volume and collapses on delivery, the case that makes ranking by money rather
// than count worth it — plus the unattributed orders a real period carries.
const liveMix: ChannelFact[] = [
    ...many(36, "instagram", "delivered", 40000),
    ...many(12, "instagram", "rejected", 40000),
    ...many(22, "instagram", "new", 40000),
    ...many(12, "facebook", "delivered", 44000),
    ...many(8, "facebook", "rejected", 44000),
    ...many(7, "facebook", "confirmed", 44000),
    ...many(3, "tiktok", "delivered", 50000),
    ...many(2, "tiktok", "rejected", 50000),
    ...many(17, "tiktok", "no_response", 50000),
    ...many(1, "threads", "delivered", 44750),
    ...many(2, "threads", "new", 44750),
    ...many(1, "other", "new", 30000),
    ...many(40, null, "delivered", 45000),
    ...many(7, null, "rejected", 45000),
    ...many(12, null, "new", 45000),
];

/** An admin's view of a period with mixed attribution. */
export const MixedPeriod: Story = {
    args: { data: calculateChannelPerformance(liveMix, true) },
};

/** A viewer without financial access: counts and rates, no money, ranked by volume. */
export const WithoutFinancialAccess: Story = {
    args: { data: calculateChannelPerformance(liveMix.map(({ ad_channel, status }) => ({ ad_channel, status })), false) },
};

/** A period where no order carries a channel (the capture gap): said plainly, not hidden. */
export const NoAttributionInPeriod: Story = {
    args: {
        data: calculateChannelPerformance([
            ...many(10, null, "delivered", 36750),
            ...many(6, null, "rejected", 36750),
            ...many(40, null, "new", 36750),
        ], true),
    },
};

/** No orders at all in the range. */
export const EmptyPeriod: Story = {
    args: { data: calculateChannelPerformance([], true) },
};

export const Loading: Story = {
    args: { data: undefined, loading: true },
};

export const LoadFailed: Story = {
    args: { data: undefined, error: new Error("FetchError: network request failed") },
};
