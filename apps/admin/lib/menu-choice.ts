/*
 * The desktop menu: words (the default) or icons only, kept per browser.
 *
 * The console's pages are built ahead of time, so the server cannot know the
 * choice. MENU_BEFORE_PAINT runs before the first paint and marks <html>
 * data-menu="icons"; CSS in globals.css then gives the page the narrow
 * menu's room at once, instead of the page jumping 184px sideways when the
 * app comes alive.
 */

export const MENU_KEY = "adminSidebarCollapsed";

/**
 * Inline script for the root layout. localStorage can refuse to be read
 * (blocked storage, some private windows); the menu then opens with its
 * words, the same as for someone who never chose, so that case is caught.
 */
export const MENU_BEFORE_PAINT = `try{if(localStorage.getItem("${MENU_KEY}")==="true")document.documentElement.dataset.menu="icons"}catch(e){}`;

export function readMenuCollapsed(): boolean {
  return localStorage.getItem(MENU_KEY) === "true";
}

export function writeMenuCollapsed(collapsed: boolean): void {
  localStorage.setItem(MENU_KEY, String(collapsed));
  if (collapsed) document.documentElement.dataset.menu = "icons";
  else delete document.documentElement.dataset.menu;
}
