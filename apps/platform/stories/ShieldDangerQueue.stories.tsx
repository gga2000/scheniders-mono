import type { Meta, StoryObj } from "@storybook/nextjs";
import { AnimatePresence } from "framer-motion";
import { Dialog, SheetContent } from "@scheniders/ui/dialog";
import { LanguageProvider } from "@/components/providers/language-provider";
import { DangerQueue } from "@/components/orders/shield/shield-danger-sheet";
import type { RiskyOpenOrder } from "@/lib/shield/home";

const now = Date.parse("2026-11-05T04:00:00Z");
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
const row = (i: number, name: string, trust: number, kind: RiskyOpenOrder["worst_kind"], src: RiskyOpenOrder["worst_src"], status: string, h: number): RiskyOpenOrder => ({
    id: `00000000-0000-0000-0000-00000000000${i}`, order_id: `426110${5000 + i}`, customer_name: name, status, created_at: ago(h), trust, worst_kind: kind, worst_src: src,
});

const rows: RiskyOpenOrder[] = [
    row(1, "ابو كافل المحمداوي", 10, "refused", "net", "new", 3),
    row(2, "حيدر علي", 30, "refused", "own", "contacted", 20),
    row(3, "مصطفى كريم", 45, "no_answer", "net", "new", 30),
    row(4, "زينب حسن", 60, "changed_mind", "own", "confirmed", 5),
    row(5, "علي جبار", 75, "no_answer", "own", "suspended", 70),
];

function Queue({ list }: { list: RiskyOpenOrder[] }) {
    return (
        <LanguageProvider>
            <div className="min-h-screen bg-[var(--background)]">
                <Dialog open>
                    <AnimatePresence>
                        <SheetContent aria-describedby={undefined}>
                            <DangerQueue rows={list} asOf={now} loading={false} failed={false} onRetry={() => undefined} onPick={() => undefined} />
                        </SheetContent>
                    </AnimatePresence>
                </Dialog>
            </div>
        </LanguageProvider>
    );
}

const meta: Meta<typeof Queue> = { title: "Orders/Shield danger queue", component: Queue, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof Queue>;

/** Three high-risk and two call-first orders, lowest score first. */
export const Mixed: Story = { args: { list: rows } };

/** Nothing under 80. */
export const Empty: Story = { args: { list: [] } };
