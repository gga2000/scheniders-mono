import type { Meta, StoryObj } from "@storybook/nextjs";
import { useState } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { DangerSlider } from "@/components/orders/shield/shield-danger-toggle";
import type { DangerBand } from "@/lib/shield/danger";

const counts = { red: 41, yellow: 1225, green: 4083 };

function Slider({ start }: { start: DangerBand | null }) {
    const [band, setBand] = useState(start);
    return (
        <LanguageProvider>
            <div className="min-h-screen bg-[var(--background)] p-10">
                <div className="w-[320px] rounded-2xl border border-(--card-border) bg-(--card-bg) p-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.28)]">
                    <DangerSlider band={band} counts={counts} onChange={setBand} />
                </div>
            </div>
        </LanguageProvider>
    );
}

const meta: Meta<typeof Slider> = { title: "Orders/Shield danger slider", component: Slider, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof Slider>;

/** No stop picked: every order. */
export const Off: Story = { args: { start: null } };

/** High danger picked. */
export const HighRisk: Story = { args: { start: "red" } };

/** Medium danger picked. */
export const Medium: Story = { args: { start: "yellow" } };
