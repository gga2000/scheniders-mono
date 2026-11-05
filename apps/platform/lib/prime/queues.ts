import type { PrimeProblem } from "./problems";

/**
 * The two Prime queues on the orders page's status row, shown across every
 * date (the list loads one date window; a parcel waiting on someone can be
 * from any day):
 *  - «معالجة» (fix): a parcel that needs someone before it is lost — delivery
 *    failed, Prime waits on a confirmation, it was put off, Prime cancelled
 *    it, or it has not moved in 3 days.
 *  - «راجع» (back): a parcel Prime is bringing back, until the returns desk
 *    takes it in.
 */
export const PRIME_QUEUE_IDS = ["fix", "back"] as const;
export type PrimeQueueId = (typeof PRIME_QUEUE_IDS)[number];

export interface PrimeQueue {
    /** Unhandled first, then the most urgent, then the one waiting longest (primeProblems' order). */
    problems: PrimeProblem[];
    /** Order ids in list order. */
    orderIds: string[];
    /** What the chip counts: the ones nobody has handled yet. */
    waiting: number;
}

export function primeQueueOf(problem: Pick<PrimeProblem, "kind">): PrimeQueueId {
    return problem.kind === "returning" ? "back" : "fix";
}

/** Splits the problems (already sorted) into the two queues. */
export function primeQueues(problems: readonly PrimeProblem[]): Record<PrimeQueueId, PrimeQueue> {
    const queues: Record<PrimeQueueId, PrimeQueue> = {
        fix: { problems: [], orderIds: [], waiting: 0 },
        back: { problems: [], orderIds: [], waiting: 0 },
    };
    for (const problem of problems) {
        const queue = queues[primeQueueOf(problem)];
        queue.problems.push(problem);
        queue.orderIds.push(problem.orderId);
        if (!problem.handled) queue.waiting++;
    }
    return queues;
}
