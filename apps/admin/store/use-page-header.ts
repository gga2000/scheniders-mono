import { create } from "zustand";

/**
 * Names the browser tab when a page knows better than the menu: a shop's page
 * puts the shop's name there, so ten open shops can be told apart. The page's
 * own heading is the only place its name is shown (board n3: one name per
 * page), so this store holds the tab name and nothing else.
 */
interface PageHeaderState {
  tab: string | null;
  setTab: (tab: string | null) => void;
}

export const usePageHeader = create<PageHeaderState>((set) => ({
  tab: null,
  setTab: (tab) => set({ tab }),
}));
