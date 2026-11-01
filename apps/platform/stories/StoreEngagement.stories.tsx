import type { Meta, StoryObj } from "@storybook/nextjs";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ReviewsBoard } from "@/components/store-engagement/reviews-board";
import { RecoveryBoard } from "@/components/store-engagement/recovery-board";
import type { AdminReview } from "@/hooks/use-product-reviews";
import type { AbandonedCartRow } from "@/hooks/use-abandoned-carts";

const review = (id: string, over: Partial<AdminReview>): AdminReview => ({
    id, product_id: "p1", rating: 5, title: null, body: null, author_name: null, photo_urls: [],
    status: "pending", created_at: "2026-10-30T10:00:00Z", product_name: "ساعة يد كلاسيك", ...over,
});

const reviews: AdminReview[] = [
    review("r1", { rating: 5, title: "ممتازة", body: "وصلتني بيومين والجودة أحسن من التوقعات.", author_name: "سارة علي" }),
    review("r2", { rating: 2, body: "التغليف كان مفتوح.", author_name: null, product_name: "حقيبة جلد" }),
    review("r3", { rating: 4, title: "حلوة", status: "approved", author_name: "أحمد" }),
    review("r4", { rating: 1, status: "rejected", body: "سبام", product_name: null }),
];

const cart = (id: string, over: Partial<AbandonedCartRow>): AbandonedCartRow => ({
    id, phone: "07701234567", items: [{ name: "ساعة يد كلاسيك", quantity: 1 }] as AbandonedCartRow["items"],
    subtotal_iqd: 45_000, governorate: "BG", updated_at: "2026-10-31T12:00:00Z", reminded_at: null,
    recovered_at: null, consent_at: null, recovery_kind: null, ...over,
});

const carts: AbandonedCartRow[] = [
    cart("c1", {}),
    cart("c2", { phone: "07801112233", reminded_at: "2026-10-31T13:00:00Z", subtotal_iqd: 120_000 }),
    cart("c3", { phone: "07509998877", reminded_at: "2026-10-30T13:00:00Z", recovered_at: "2026-10-30T15:00:00Z", recovery_kind: "after_reminder", subtotal_iqd: 78_000 }),
    cart("c4", { phone: "07712223344", recovered_at: "2026-10-29T15:00:00Z", recovery_kind: "organic", subtotal_iqd: 30_000 }),
];

const meta: Meta = {
    title: "Store/Engagement",
    decorators: [(Story) => <LanguageProvider><div className="min-h-screen bg-[var(--background)]"><Story /></div></LanguageProvider>],
    parameters: { layout: "fullscreen" },
};
export default meta;

export const Reviews: StoryObj = {
    render: () => <ReviewsBoard reviews={reviews} isLoading={false} isError={false} busyId={null} onSetStatus={() => undefined} onRemove={() => undefined} />,
};
export const Recovery: StoryObj = {
    render: () => <RecoveryBoard carts={carts} isLoading={false} isError={false} />,
};
