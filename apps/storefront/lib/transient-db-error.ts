// =====================================================================
// Was a failed Supabase call the platform's fault, or the request's?
// =====================================================================
// The checkout answers the two differently. A request the database refused
// (bad data, a constraint, a permission, a function's RAISE) fails the same
// way every time: a 422 the shopper must act on. A call that never completed
// (no connection, a timeout, a deadlock, PostgREST unable to reach Postgres)
// may succeed on the next attempt: a 503 the client may resend with the same
// idempotency key — which the server answers with the order if one landed.
//
// Classified by SQLSTATE class: 22 data exception · 23 integrity violation ·
// 42 syntax/permission · P0 raised by a function — permanent; every other
// class — transient. An error with no code never reached Postgres (the fetch
// itself failed). PostgREST's own codes are permanent except PGRST000–009,
// which mean it could not reach the database or get a connection.
// =====================================================================

export interface DbErrorLike {
  code?: string | null;
}

const PERMANENT_SQLSTATE_CLASSES = ["22", "23", "42", "P0"] as const;
const POSTGREST_CONNECTION_ERROR = /^PGRST00\d$/;

export function isTransientDbError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "") return true;
  if (code.startsWith("PGRST")) return POSTGREST_CONNECTION_ERROR.test(code);
  return !PERMANENT_SQLSTATE_CLASSES.some((cls) => code.startsWith(cls));
}
