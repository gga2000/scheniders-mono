import { adminFetch } from "@/lib/admin-fetch";
import { AnswerLost } from "@/lib/answer-lost";

/*
 * The console's one sender for writes. Kept out of the panels' file (components/merchants/detail/
 * action-ui.tsx) so code in the shell, like support's sends, can use it
 * without loading the panels (round 24, speed).
 */

/** The server's answer to a request id it had already done: it did nothing again. */
export function wasAlreadyDone(answer: unknown): boolean {
  return typeof answer === "object" && answer !== null && "duplicate" in answer && answer.duplicate === true;
}

/** The API's own words for a refusal, if its answer has them. */
function refusalWords(data: unknown): string | null {
  return typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
    ? data.error
    : null;
}

/** The methods the console writes with. */
type WriteMethod = "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Why a request failed: the API's own words, or, from a 5xx with no words, a
 * lost answer (a gateway timed out; the step may have run), said with `lost`
 * when given: where to look for that step.
 */
export function failureOf(status: number, data: unknown, fallback = "Something went wrong.", lost?: string): Error {
  const words = refusalWords(data);
  if (words !== null) return new Error(words);
  return status >= 500 ? new AnswerLost(lost) : new Error(fallback);
}

/**
 * Sends JSON and gives back the status and the answer's JSON (null when it has
 * none). A dropped connection throws AnswerLost, said with `lost` when given:
 * the browser rejects with a TypeError when the network fails, and the
 * request may have reached the server before the answer was lost.
 */
export async function sendJson(
  url: string,
  body: unknown,
  method: WriteMethod = "POST",
  lost?: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await adminFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((error: unknown) => {
    if (error instanceof TypeError) throw new AnswerLost(lost);
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

/**
 * Sends one step and gives back its answer, or throws the API's own words. A
 * lost answer throws AnswerLost with `lost` when given: the words that say
 * where to look, or that pressing again is safe, for that step.
 */
export async function sendStep<T>(
  url: string,
  body: unknown,
  method: WriteMethod = "POST",
  lost?: string,
  fallback = "Request failed",
): Promise<T> {
  const answer = await sendJson(url, body, method, lost);
  if (answer.ok) return answer.data as T;
  throw failureOf(answer.status, answer.data, fallback, lost);
}
