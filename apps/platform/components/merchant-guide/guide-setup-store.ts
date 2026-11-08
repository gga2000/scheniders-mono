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
    setStep: (step: FoundationStep | null) => void;
    setProductDraft: (draft: GuideProductDraft | null) => void;
}

export const useGuideSetup = create<GuideSetupState>((set) => ({
    step: null,
    productDraft: null,
    setStep: (step) => set({ step }),
    setProductDraft: (productDraft) => set({ productDraft }),
}));

/** True while a new shop is still doing the basics with the guide. */
export function useGuideSetupActive(): boolean {
    return useGuideSetup((s) => s.step !== null);
}
