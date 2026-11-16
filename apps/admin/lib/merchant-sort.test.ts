import { describe, expect, it } from "vitest";
import { MERCHANT_COLUMNS } from "@/types/admin";
import { DEFAULT_MERCHANT_SORT, isSortableMerchantColumn, readMerchantSort } from "./merchant-sort";

/*
 * A click on the Business, Balance, Health, Orders or Revenue header sent that
 * name to the database, which has no such column, and the merchant list
 * turned into "Could not load the merchants".
 */

describe("readMerchantSort", () => {
  it("orders on the database's name for each column the screen shows", () => {
    expect(readMerchantSort("business:asc,balance:desc,health:desc")).toEqual([
      { column: "business_name", ascending: true },
      { column: "wallet(balance_iqd)", ascending: false },
      { column: "staff_health_score", ascending: false },
    ]);
    expect(readMerchantSort(DEFAULT_MERCHANT_SORT)).toEqual([{ column: "created_at", ascending: false }]);
  });

  it("refuses a column that cannot sort every shop, and says which", () => {
    for (const column of ["orders", "revenue", "lastActive", "team", "tags", "sparkline", "actions", "row", "toString"]) {
      expect(readMerchantSort(`${column}:desc`)).toEqual({ error: `The list cannot be sorted by "${column}"` });
    }
  });

  it("refuses a direction other than asc or desc", () => {
    expect(readMerchantSort("plan")).toEqual({ error: 'Sort direction must be asc or desc, not ""' });
    expect(readMerchantSort("plan:up")).toEqual({ error: 'Sort direction must be asc or desc, not "up"' });
  });
});

describe("the table's headers", () => {
  it("sort only where the database can order every shop", () => {
    const sortable = MERCHANT_COLUMNS.map((c) => c.id).filter(isSortableMerchantColumn);
    expect(sortable).toEqual(["business", "plan", "status", "city", "balance", "health"]);
  });
});
