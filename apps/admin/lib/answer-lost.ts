/*
 * The words for an answer that never came back: the request may have reached
 * the server, so the step may have been done. Plain text with no browser code,
 * so routes can answer with the same words the console's sender uses.
 */

/** The lost-answer words for a step whose result shows in `where` ("the shop", "the notice bar"). */
export const answerLostWords = (where: string) =>
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
