import { create } from "zustand";

interface RealtimePulseState {
  /** Set of merchant IDs that were recently updated via real-time */
  pulsing: Set<string>;
  addPulse: (id: string) => void;
  removePulse: (id: string) => void;
}

export const useRealtimePulse = create<RealtimePulseState>((set) => ({
  pulsing: new Set(),
  addPulse: (id) =>
    set((state) => {
      const next = new Set(state.pulsing);
      next.add(id);
      return { pulsing: next };
    }),
  removePulse: (id) =>
    set((state) => {
      const next = new Set(state.pulsing);
      next.delete(id);
      return { pulsing: next };
    }),
}));
