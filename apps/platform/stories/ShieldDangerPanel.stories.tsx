import type { Meta, StoryObj } from "@storybook/nextjs";
import { useState } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ShieldDangerPanel } from "@/components/orders/shield/shield-danger-panel";
import type { DangerBand } from "@/lib/shield/danger";

function Panel({ counts, start }: { counts: Record<DangerBand, number>; start: DangerBand | null }) {
    const [active, setActive] = useState<DangerBand | null>(start);
    return (
        <LanguageProvider>
            <div className="min-h-screen bg-[var(--background)] p-8">
                <ShieldDangerPanel counts={counts} active={active} onSelect={setActive} />
            </div>
        </LanguageProvider>
    );
}

const meta: Meta<typeof Panel> = { title: "Orders/Shield danger panel", component: Panel, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof Panel>;

/** Today's open orders split by danger. */
export const Mixed: Story = { args: { counts: { red: 2, yellow: 3, green: 21 }, start: null } };

/** High danger picked: only those cards are listed. */
export const HighPicked: Story = { args: { counts: { red: 2, yellow: 3, green: 21 }, start: "red" } };
