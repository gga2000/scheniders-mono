"use client";

import { useAuth } from "@/hooks/use-auth";
import { useLgWindow, usePhoneScreen } from "@/hooks/use-phone-screen";
import { ComputerSignInCard } from "./computer-sign-in-card";

/**
 * Where the sign-in page shows its scan code: on the dark side panel when the
 * window is wide enough to have one, otherwise above the form. Only one of
 * the two places shows it, never on a phone (it cannot scan itself), and not
 * while someone is already signed in here.
 */
export function ComputerSignInSlot({ place }: { place: "hero" | "form" }) {
    const phone = usePhoneScreen();
    const wide = useLgWindow();
    const { user, isLoading } = useAuth();
    if (phone !== false || wide === null || isLoading || user) return null;
    if ((place === "hero") !== wide) return null;
    return <ComputerSignInCard tone={place === "hero" ? "dark" : "light"} />;
}
