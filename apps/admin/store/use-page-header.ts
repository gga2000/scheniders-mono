import { create } from "zustand";

/**
 * Lets a page hand its title + subtitle to the global topbar so the page header
 * lives in the top header bar (instead of a duplicate block in the page body).
 * Pages set this on mount and clear it on unmount; the topbar falls back to its
 * static PAGE_TITLES map whenever `title` is null. The header icon is keyed by
 * route in the topbar's PAGE_ICONS map (icons are static per page).
 */
interface PageHeaderState {
  title: string | null;
  subtitle: string | null;
  setHeader: (header: { title: string | null; subtitle: string | null }) => void;
  clearHeader: () => void;
}

export const usePageHeader = create<PageHeaderState>((set) => ({
  title: null,
  subtitle: null,
  setHeader: ({ title, subtitle }) => set({ title, subtitle }),
  clearHeader: () => set({ title: null, subtitle: null }),
}));
