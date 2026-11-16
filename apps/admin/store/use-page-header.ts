import { create } from "zustand";

/**
 * Lets a page hand its title + subtitle to the global topbar so the page header
 * lives in the top header bar (instead of a duplicate block in the page body).
 * Pages set this on mount and clear it on unmount; the topbar falls back to the
 * menu's name for the page whenever `title` is null.
 *
 * `tab` names the browser tab when the page knows better than the menu: a
 * shop's page puts the shop's name there, so ten open shops can be told apart.
 */
interface PageHeaderState {
  title: string | null;
  subtitle: string | null;
  tab: string | null;
  setHeader: (header: { title: string | null; subtitle: string | null }) => void;
  clearHeader: () => void;
  setTab: (tab: string | null) => void;
}

export const usePageHeader = create<PageHeaderState>((set) => ({
  title: null,
  subtitle: null,
  tab: null,
  setHeader: ({ title, subtitle }) => set({ title, subtitle }),
  clearHeader: () => set({ title: null, subtitle: null }),
  setTab: (tab) => set({ tab }),
}));
