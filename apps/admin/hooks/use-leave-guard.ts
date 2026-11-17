import { useEffect } from "react";

/**
 * While a page holds typing that is not saved, leaving it asks first, with the
 * browser's own "Leave site?" question. That covers the reload when a sign-in
 * ends (leaveIfSignedOut in lib/admin-fetch.ts), a closed tab and a typed
 * address: staff can stay, copy what they wrote, and then sign in again.
 */
export function useLeaveGuard(unsaved: boolean): void {
  useEffect(() => {
    if (!unsaved) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsaved]);
}
