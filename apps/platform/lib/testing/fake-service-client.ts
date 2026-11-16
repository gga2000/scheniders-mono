/**
 * A stand-in for the service-role Supabase client in route tests: records every
 * `from(table)` query with its write operation and payload, and answers each
 * with whatever `respond` returns. Every builder method chains; awaiting the
 * chain resolves the response.
 */

export interface FakeResult {
    data?: unknown;
    error?: { message: string; code?: string; hint?: string } | null;
}

export interface FakeCall {
    table: string;
    /** The write method on the chain, or "select" for a read. */
    op: "select" | "insert" | "upsert" | "update" | "delete";
    payload: unknown;
    /** Every other method on the chain, in order (eq, gt, order, select…). */
    filters: { method: string; args: unknown[] }[];
}

const WRITES = new Set(["insert", "upsert", "update", "delete"]);

export interface FakeAuthOptions {
    /** Error inviteUserByEmail answers with (e.g. `{ code: "email_exists" }`). */
    inviteError?: { message: string; code?: string } | null;
    /** Error signInWithOtp answers with. */
    otpError?: { message: string; code?: string } | null;
    /** Error admin.createUser answers with (e.g. `{ code: "email_exists" }`). */
    createUserError?: { message: string; code?: string } | null;
    /** Answer for `rpc(name, args)`; unanswered calls resolve to no data. */
    rpc?: (name: string, args: unknown) => FakeResult;
}

export function fakeServiceClient(respond: (call: FakeCall) => FakeResult, authOptions: FakeAuthOptions = {}) {
    const calls: FakeCall[] = [];
    const invited: string[] = [];
    const otps: { email: string; options?: { shouldCreateUser?: boolean } }[] = [];
    const created: { email?: string }[] = [];
    const deletedUsers: string[] = [];
    const rpcCalls: { name: string; args: unknown }[] = [];

    function from(table: string) {
        const call: FakeCall = { table, op: "select", payload: undefined, filters: [] };
        const chain: object = new Proxy({}, {
            get(_target, prop: string | symbol) {
                if (prop === "then") {
                    calls.push(call);
                    const result = { data: null, error: null, ...respond(call) };
                    return (resolve: (value: FakeResult) => void) => resolve(result);
                }
                return (...args: unknown[]) => {
                    if (typeof prop === "string" && WRITES.has(prop)) {
                        call.op = prop as FakeCall["op"];
                        call.payload = args[0];
                    } else if (typeof prop === "string") {
                        call.filters.push({ method: prop, args });
                    }
                    return chain;
                };
            },
        });
        return chain;
    }

    const client = {
        from,
        rpc: async (name: string, args: unknown) => {
            rpcCalls.push({ name, args });
            return { data: null, error: null, ...authOptions.rpc?.(name, args) };
        },
        auth: {
            signInWithOtp: async (input: { email: string; options?: { shouldCreateUser?: boolean } }) => {
                otps.push(input);
                return { data: null, error: authOptions.otpError ?? null };
            },
            admin: {
                inviteUserByEmail: async (email: string) => {
                    invited.push(email);
                    return { data: null, error: authOptions.inviteError ?? null };
                },
                createUser: async (input: { email?: string }) => {
                    created.push(input);
                    if (authOptions.createUserError) return { data: { user: null }, error: authOptions.createUserError };
                    return { data: { user: { id: "new-user-id" } }, error: null };
                },
                deleteUser: async (id: string) => {
                    deletedUsers.push(id);
                    return { data: null, error: null };
                },
            },
        },
    };

    return { client, calls, created, deletedUsers, invited, otps, rpcCalls };
}
