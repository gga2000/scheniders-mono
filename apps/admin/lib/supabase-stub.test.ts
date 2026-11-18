import { describe, expect, it } from "vitest";
import { supabaseStub } from "./supabase-stub.test-data";

/*
 * The route tests trust the stub to filter and sort as the API does. Before
 * round 3 of the staff console audit gte, lt, lte and order only recorded the
 * call, so a wrong date window or a wrong sort passed every test.
 */

const rows = [
  { id: "a", at: "2026-11-16T08:00:00Z", n: 3 },
  { id: "b", at: "2026-11-15T09:00:00+00:00", n: 1 },
  { id: "c", at: null, n: 2 },
  { id: "d", at: "2026-11-15T08:59:00Z", n: 2 },
];

function read(build: (query: ReturnType<ReturnType<typeof supabaseStub>["client"]["from"]>) => unknown) {
  const stub = supabaseStub();
  stub.state.tables.t = rows;
  return build(stub.client.from("t")) as PromiseLike<{ data: Array<{ id: string }> }>;
}

const ids = async (query: PromiseLike<{ data: Array<{ id: string }> }>) => (await query).data.map((row) => row.id);

describe("supabase stub", () => {
  it("compares timestamps by time, whatever the offset is written as, and never matches an empty value", async () => {
    expect(await ids(read((q) => q.select("*").gte("at", "2026-11-15T09:00:00.000Z")))).toEqual(["a", "b"]);
    expect(await ids(read((q) => q.select("*").lt("at", "2026-11-15T09:00:00Z")))).toEqual(["d"]);
    expect(await ids(read((q) => q.select("*").lte("at", "2026-11-15T09:00:00Z")))).toEqual(["b", "d"]);
    expect(await ids(read((q) => q.select("*").gt("n", 1)))).toEqual(["a", "c", "d"]);
  });

  it("sorts before it cuts a page, by the first order() first, empty values last when ascending", async () => {
    expect(await ids(read((q) => q.select("*").order("at")))).toEqual(["d", "b", "a", "c"]);
    expect(await ids(read((q) => q.select("*").order("at", { ascending: false })))).toEqual(["c", "a", "b", "d"]);
    expect(await ids(read((q) => q.select("*").order("n", { ascending: false }).order("id").range(0, 1)))).toEqual([
      "a",
      "c",
    ]);
  });

  it("refuses to compare two kinds of value Postgres would not", () => {
    expect(() => read((q) => q.select("*").gte("n", "2026-11-15"))).toThrow("cannot compare");
  });
});
