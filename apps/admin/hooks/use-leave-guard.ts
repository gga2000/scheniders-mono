import { useEffect } from "react";

function askBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
}

/**
 * While a page holds typing that is not saved, leaving it asks first, with the
 * browser's own "Leave site?" question. That covers the reload when a sign-in
 * ends (leaveIfSignedOut in lib/admin-fetch.ts), a closed tab and a typed
 * address: staff can stay, copy what they wrote, and then sign in again.
 */
export function useLeaveGuard(unsaved: boolean): void {
  useEffect(() => {
    if (!unsaved) return;
    const ask = (event: BeforeUnloadEvent) => askBeforeUnload(event);
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsaved]);
}

/**
 * For work that goes on after its page is left (a product import keeps
 * running when staff move elsewhere in the console): a reload, a closed tab
 * or a typed address asks first until the returned release is called,
 * whichever console page staff are on by then. Releasing twice is harmless.
 * Console audit round 23: the page's own guard went with the page, so a
 * reload after moving on stopped the run with no question.
 */
export function holdLeaveGuard(): () => void {
  const ask = (event: BeforeUnloadEvent) => askBeforeUnload(event);
  window.addEventListener("beforeunload", ask);
  return () => window.removeEventListener("beforeunload", ask);
}

/** Whether a click on this link takes the tab to another page of the console. */
function movesAway(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return false;
  if (link.target !== "" && link.target !== "_self") return false;
  const to = new URL(link.href, window.location.href);
  return to.origin === window.location.origin && (to.pathname !== window.location.pathname || to.search !== window.location.search);
}

/**
 * While `question` is set, a click on a link to another console page (the
 * sidebar, a shop's name, the breadcrumbs) asks it first, with the browser's
 * own OK / Cancel; Cancel keeps the page. Moving inside the console never
 * fires "beforeunload", so useLeaveGuard alone does not see it (console audit
 * round 23). A click that opens a new tab leaves nothing and is not asked.
 */
export function useLinkLeaveQuestion(question: string | null): void {
  useEffect(() => {
    if (question === null) return;
    const onClick = (event: MouseEvent) => {
      if (!movesAway(event) || window.confirm(question)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    // Capture, so the question comes before the link's own handler moves the page.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [question]);
}
