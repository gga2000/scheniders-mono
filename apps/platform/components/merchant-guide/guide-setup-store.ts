"use client";

import { create } from "zustand";
import type { FoundationStep } from "@/lib/merchant-guide/foundation";
import type { ProductWalkDraft } from "@/lib/merchant-guide/product-walk";

export type GuideProductDraft = ProductWalkDraft;

interface GuideSetupState {
    /**
     * The basics step the guide is on, or null when the guide isn't running
     * the basics. Pages read it to simplify themselves while a new shop sets up.
     */
    step: FoundationStep | null;
    /** What the merchant has typed on the new-product page, while the guide walks it. */
    productDraft: GuideProductDraft | null;
    /**
     * Height of a bar fixed to the bottom of the screen (the phone store
     * editor's toolbar), so the guide's pill and card float above it. 0 when
     * there is none.
     */
    bottomInset: number;
    setStep: (step: FoundationStep | null) => void;
    setProductDraft: (draft: GuideProductDraft | null) => void;
    setBottomInset: (px: number) => void;
}

export const useGuideSetup = create<GuideSetupState>((set) => ({
    step: null,
    productDraft: null,
    bottomInset: 0,
    setStep: (step) => set({ step }),
    setProductDraft: (productDraft) => set({ productDraft }),
    setBottomInset: (bottomInset) => set({ bottomInset }),
}));

/** The guide's pill, notes and list rest this far above the bottom edge. */
const GUIDE_PILL_BOTTOM = 24;

/** Where the guide's bottom row sits now: clear of any bar fixed to the bottom. */
export function useGuidePillBottom(): number {
    return useGuideSetup((s) => GUIDE_PILL_BOTTOM + s.bottomInset);
}

/** True while a new shop is still doing the basics with the guide. */
export function useGuideSetupActive(): boolean {
    return useGuideSetup((s) => s.step !== null);
}
