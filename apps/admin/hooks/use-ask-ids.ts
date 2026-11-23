"use client";

import { useCallback, useMemo, useRef } from "react";
import { sendStep } from "@/lib/send-json";

/**
 * One id per ask, kept until it goes through. The ask is what staff send (the
 * conversation, the words, the outcome): pressing again after an error or a
 * lost answer sends the same id, and the database writes once. Once it goes
 * through, the same words again are a new ask. Kept for the page's life: the
 * words of a send are not kept across a reload either.
 *
 * Unlike money asks (lib/request-ids.ts), the words are the ask here: a reply
 * in other words is another message, never a retry of the first.
 */
export function useAskIds() {
  const ids = useRef(new Map<string, string>());
  return useMemo(
    () => ({
      askId(ask: unknown): { key: string; id: string } {
        const key = JSON.stringify(ask);
        const known = ids.current.get(key);
        if (known) return { key, id: known };
        const id = crypto.randomUUID();
        ids.current.set(key, id);
        return { key, id };
      },
      done(key: string) {
        ids.current.delete(key);
      },
    }),
    [],
  );
}

/**
 * Saves one ask with its id (a lead's follow-up or note, a shop's note): the
 * route answers a repeat with the first row (lib/saved-once.ts), so a press
 * again after a lost answer saves once. `lost` is what staff read when no
 * answer came back; `fallback`, a refusal with no words.
 */
export function useSaveOnce() {
  const ids = useAskIds();
  return useCallback(
    async <T>(url: string, ask: Record<string, unknown>, lost: string, fallback?: string): Promise<T> => {
      const { key, id } = ids.askId([url, ask]);
      const answer = await sendStep<T>(url, { ...ask, request_id: id }, "POST", lost, fallback);
      ids.done(key);
      return answer;
    },
    [ids],
  );
}
