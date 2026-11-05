import type { Meta, StoryObj } from "@storybook/nextjs";
import { useState } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { ShieldDangerPanel } from "@/components/orders/shield/shield-danger-panel";
import type { DangerBand } from "@/lib/shield/danger";

function Panel({ counts, listTotal, start }: { counts: Record<DangerBand, number>; listTotal: number; start: DangerBand | null }) {
    const [active, setActive] = useState<DangerBand | null>(start);
    return (
        <LanguageProvider>
            <div className="min-h-screen bg-[var(--background)] p-8">
                <ShieldDangerPanel counts={counts} listTotal={listTotal} active={active} onSelect={setActive} onClose={() => undefined} />
            </div>
        </LanguageProvider>
    );
}

const meta: Meta<typeof Panel> = { title: "Orders/Shield danger panel", component: Panel, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof Panel>;

/** All orders selected: 162 of 5,349 are still open. */
export const Mixed: Story = { args: { counts: { red: 41, yellow: 1225, green: 4083 }, listTotal: 5349, start: null } };

/** Medium danger picked: only those cards are listed. */
export const MediumPicked: Story = { args: { counts: { red: 41, yellow: 1225, green: 4083 }, listTotal: 5349, start: "yellow" } };
