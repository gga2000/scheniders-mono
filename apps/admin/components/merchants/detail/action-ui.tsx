import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin-fetch";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

/*
 * The parts every shop action panel shares: a title, a row of choices, the
 * line that says what will happen, and the button that does it. Plain fills,
 * text 13px and up.
 */

export function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <p className="text-[15px] font-semibold text-foreground">{children}</p>
      {aside && <p className="text-[13px] text-foreground/70 tabular-nums">{aside}</p>}
    </div>
  );
}

export function Choice({
  selected,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[13px] font-semibold tabular-nums transition-colors disabled:opacity-50",
        selected
          ? "bg-foreground text-background"
          : "bg-foreground/[0.05] text-foreground hover:bg-foreground/10",
        className,
      )}
      {...props}
    />
  );
}

export function FieldInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-foreground/45 focus:border-foreground/40 disabled:cursor-wait disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/** What pressing the button will do, in a sentence, so the press is the confirm. */
export function WillHappen({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[13px] leading-snug text-foreground/75">{children}</p>;
}

export function ConfirmButton({
  tone = "go",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "go" | "stop" }) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "go" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-rose-700 hover:bg-rose-800",
        className,
      )}
      {...props}
    />
  );
}

/** Whether the component is still on screen, read when a write's answer lands. */
export function useStillDrawn(): () => boolean {
  const drawn = useRef(true);
  useEffect(() => {
    drawn.current = true;
    return () => {
      drawn.current = false;
    };
  }, []);
  return () => drawn.current;
}

/** Reads the shop and the merchants list again, after a write or a failed one. */
export function useRereadShop(shopId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "merchant", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
  };
}

/**
 * For a panel's failed write. The shop is read again first: an answer lost on
 * the way back may hide a change that was made, and the page then shows it
 * ("Wallet now" says whether the money came, round 20). While the form is
 * drawn its ErrorLine says the refusal. Once it is gone (staff left the page
 * during the write), a toast says it, starting with what did not happen, so
 * the refusal is never said nowhere. A lost answer is not a refusal: its toast
 * names the shop and never says the step was not done (round 21).
 */
export function useWriteFailed(shopId: string, notDone: string): (error: Error) => void {
  const queryClient = useQueryClient();
  const rereadShop = useRereadShop(shopId);
  const stillDrawn = useStillDrawn();
  return (error) => {
    rereadShop();
    if (stillDrawn()) return;
    if (error instanceof AnswerLost) {
      const shop = queryClient.getQueryData<MerchantDetail>(["admin", "merchant", shopId])?.tenant.business_name;
      toast.error(shop ? `${shop}: ${error.message}` : error.message);
    } else {
      toast.error(`${notDone} ${error.message}`);
    }
  };
}

/**
 * A panel's choices and boxes, which wait while its write runs: the form keeps
 * showing what was sent, so a retry after a failure sends the same ask (round
 * 20: the amount could be changed while the first one ran).
 */
export function PanelFields({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={busy} className="min-w-0">
      {children}
    </fieldset>
  );
}

export function ErrorLine({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-2 text-[13px] font-medium text-[var(--ink-red)]">
      {error.message}
    </p>
  );
}

/** The server's answer to a request id it had already done: it did nothing again. */
export function wasAlreadyDone(answer: unknown): boolean {
  return typeof answer === "object" && answer !== null && "duplicate" in answer && answer.duplicate === true;
}

const answerLostWords = (where: string) =>
  `No answer came back, so this may have been done. Check ${where} before trying again.`;

/**
 * What staff read when no answer came back: the request reached the network
 * but the server's words did not come back (the connection dropped, or a
 * gateway answered 502 or 504 with no words). The step may have been done, so
 * "Something went wrong." would invite a second one (round 20).
 */
export const ANSWER_LOST = answerLostWords("the shop");
/** The same, for a step on many shops at once. */
export const ANSWER_LOST_SHOPS = answerLostWords("the shops");

/** No answer came back, so the step may have been done: never say it was not. */
export class AnswerLost extends Error {
  constructor(message: string = ANSWER_LOST) {
    super(message);
    this.name = "AnswerLost";
  }
}

/** The API's own words for a refusal, if its answer has them. */
function refusalWords(data: unknown): string | null {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
    ? data.error
    : null;
}

/**
 * Why a request failed: the API's own words, or, from a 5xx with no words, a
 * lost answer (a gateway timed out; the step may have run).
 */
export function failureOf(status: number, data: unknown, fallback = "Something went wrong."): Error {
  const words = refusalWords(data);
  if (words !== null) return new Error(words);
  return status >= 500 ? new AnswerLost() : new Error(fallback);
}

/**
 * Sends JSON and gives back the status and the answer's JSON (null when it has
 * none). A dropped connection throws AnswerLost: the browser rejects with a
 * TypeError when the network fails, and the request may have reached the
 * server before the answer was lost.
 */
export async function sendJson(
  url: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await adminFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((error: unknown) => {
    if (error instanceof TypeError) throw new AnswerLost();
    throw error;
  });
  const data: unknown = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/** Posts JSON and throws the API's own error message when it refuses. */
export async function postJson(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<unknown> {
  const answer = await sendJson(url, body, method);
  if (!answer.ok) throw failureOf(answer.status, answer.data);
  return answer.data;
}
