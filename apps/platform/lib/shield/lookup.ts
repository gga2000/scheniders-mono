import { supabase } from "@/lib/supabase";
import { shieldNetworkSchema, type ShieldNetwork } from "./types";

/**
 * Batches Shield lookups: every card on screen asks for its own phone, and the
 * asks made in the same tick go to `shield_lookup` as one call (at most 200
 * phones, the function's own limit). The server decides what each store may
 * see; this file only groups the requests.
 */

const MAX_PER_CALL = 200;

export function normalizeShieldPhone(raw: string | null | undefined): string | null {
    const d = (raw ?? "").replace(/\D/g, "").replace(/^00964|^964/, "").replace(/^0/, "");
    return /^7\d{9}$/.test(d) ? d : null;
}

type Waiter = { resolve: (row: ShieldNetwork | null) => void; reject: (err: unknown) => void };

let queue = new Map<string, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
    const batch = queue;
    queue = new Map();
    timer = null;
    const phones = [...batch.keys()];
    for (let i = 0; i < phones.length; i += MAX_PER_CALL) {
        const chunk = phones.slice(i, i + MAX_PER_CALL);
        const { data, error } = await supabase.rpc("shield_lookup", { p_phones: chunk });
        if (error) {
            for (const p of chunk) batch.get(p)?.forEach((w) => w.reject(error));
            continue;
        }
        const parsed = shieldNetworkSchema.array().safeParse(data ?? []);
        if (!parsed.success) {
            for (const p of chunk) batch.get(p)?.forEach((w) => w.reject(parsed.error));
            continue;
        }
        const byPhone = new Map(parsed.data.map((r) => [r.phone, r]));
        for (const p of chunk) batch.get(p)?.forEach((w) => w.resolve(byPhone.get(p) ?? null));
    }
}

/** Shield's record for one normalized phone, batched with its neighbours. */
export function loadShield(phone: string): Promise<ShieldNetwork | null> {
    return new Promise((resolve, reject) => {
        const list = queue.get(phone) ?? [];
        list.push({ resolve, reject });
        queue.set(phone, list);
        if (!timer) timer = setTimeout(() => { void flush(); }, 25);
    });
}
