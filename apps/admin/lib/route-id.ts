import { NextResponse } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every [id] in the console's API names a uuid row. Any other value names no
 * record, so the route answers 404 before the database sees it: Postgres
 * would reject the value and the route would answer 500, which the pages
 * retry and report as a broken server.
 *
 * Returns the answer to send, or null when every id is a uuid.
 */
export function notAnId(...ids: string[]): NextResponse | null {
  return ids.every((id) => UUID.test(id)) ? null : NextResponse.json({ error: "Not found" }, { status: 404 });
}
