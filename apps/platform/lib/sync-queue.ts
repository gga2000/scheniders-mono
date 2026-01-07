import { get, set } from "idb-keyval";

export interface SyncTask {
    id: string;
    type: "CREATE_ORDER" | "UPDATE_ORDER" | "DELETE_ORDER";
    payload: any;
    createdAt: number;
}

const SYNC_QUEUE_KEY = "offline-sync-queue";

export class SyncQueue {
    static async getQueue(): Promise<SyncTask[]> {
        return (await get<SyncTask[]>(SYNC_QUEUE_KEY)) || [];
    }

    static async enqueue(task: Omit<SyncTask, "id" | "createdAt">) {
        const queue = await this.getQueue();
        const newTask: SyncTask = {
            ...task,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
        };
        queue.push(newTask);
        await set(SYNC_QUEUE_KEY, queue);
        return newTask;
    }

    static async remove(id: string) {
        const queue = await this.getQueue();
        const newQueue = queue.filter((t) => t.id !== id);
        await set(SYNC_QUEUE_KEY, newQueue);
    }

    static async clear() {
        await set(SYNC_QUEUE_KEY, []);
    }
}
