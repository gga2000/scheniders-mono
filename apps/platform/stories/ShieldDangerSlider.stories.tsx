import type { Meta, StoryObj } from "@storybook/nextjs";
import { useState } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { DangerSlider } from "@/components/orders/shield/shield-danger-toggle";

const scores = [10, 30, 45, 60, 75];

function Slider({ start }: { start: number }) {
    const [max, setMax] = useState(start);
    return (
        <LanguageProvider>
            <div className="min-h-screen bg-[var(--background)] p-10">
                <div className="w-[320px] rounded-2xl border border-(--card-border) bg-(--card-bg) p-4 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.28)]">
                    <DangerSlider max={max} shown={max < 100 ? scores.filter((s) => s <= max).length : null} onChange={setMax} />
                </div>
            </div>
        </LanguageProvider>
    );
}

const meta: Meta<typeof Slider> = { title: "Orders/Shield danger slider", component: Slider, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof Slider>;

/** Off: every order. */
export const Off: Story = { args: { start: 100 } };

/** Set to 45: only the high-risk orders. */
export const HighRisk: Story = { args: { start: 45 } };
