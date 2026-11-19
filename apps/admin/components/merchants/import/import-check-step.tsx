"use client";

import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import type { CheckRow } from "@/lib/product-import-run";
import { cn } from "@/lib/utils";

const count = (n: number) => new Intl.NumberFormat("en-IQ").format(n);
const products = (n: number) => `${count(n)} ${n === 1 ? "product" : "products"}`;

/** Step 3: what the import will add and what it leaves out, row by row, and the button that adds it. */
export function ImportCheckStep({
  shopName,
  lines,
  withChoices,
  importing,
  done,
  onImport,
}: {
  shopName: string;
  lines: readonly CheckRow[];
  /** Products to add that have sizes or colours. */
  withChoices: number;
  importing: boolean;
  /** The import ran: the button is gone and the lines stay for reference. */
  done: boolean;
  onImport: () => void;
}) {
  const toAdd = lines.filter((line) => line.status === "add").length;
  const problems = lines.filter((line) => line.status === "problem").length;
  const inShop = lines.filter((line) => line.status === "in_shop").length;

  return (
    <div className="space-y-4">
      <h2 className="text-[15px] font-semibold text-foreground">Check, then import</h2>
      <NumberStrip columns={4} label="What the import adds">
        <NumberCell label="Products to add" value={count(toAdd)} />
        <NumberCell label="With sizes or colours" value={count(withChoices)} />
        <NumberCell label="Rows with a problem: left out" value={count(problems)} alert={problems > 0} />
        <NumberCell label="Already in the shop: left out" value={count(inShop)} />
      </NumberStrip>

      <div className="max-h-[28rem] overflow-auto rounded-lg border border-[var(--card-border)]">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-[var(--card-bg)]">
            <tr className="border-b border-[var(--card-border)] text-left text-foreground/70">
              <th className="px-3 py-2 font-medium">Row</th>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Price (IQD)</th>
              <th className="px-3 py-2 font-medium">Stock</th>
              <th className="px-3 py-2 font-medium">What happens</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.status}-${line.row}`} className="border-b border-[var(--card-border)] align-top last:border-0">
                <td className="px-3 py-2 tabular-nums text-foreground/75">{line.row}</td>
                <td className="px-3 py-2 text-foreground">
                  {line.name || <span className="text-foreground/70">no name</span>}
                  {line.choices > 0 && <span className="text-foreground/70"> ({count(line.choices)} choices)</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-foreground">{line.price || <span className="text-foreground/70">empty</span>}</td>
                <td className="px-3 py-2 tabular-nums text-foreground">{line.stock || <span className="text-foreground/70">empty</span>}</td>
                <td
                  className={cn(
                    "px-3 py-2",
                    line.status === "add" && "text-[var(--ink-green)]",
                    line.status === "problem" && "text-[var(--ink-red)]",
                    line.status === "in_shop" && "text-foreground/75",
                  )}
                >
                  {line.status === "add" ? "Add" : line.note}
                  {line.status === "add" && line.note && <span className="block text-foreground/75">{line.note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!done && (
        <div className="space-y-2">
          <p className="text-[13px] leading-snug text-foreground/75">
            {toAdd > 0
              ? `Adds ${products(toAdd)} to ${shopName}, on sale in the store straight away. Rows with a problem and names already in the shop are left out. Image links are fetched and saved after the products.`
              : "Nothing to add: every row has a problem or is already in the shop."}
          </p>
          <button
            type="button"
            onClick={onImport}
            disabled={toAdd === 0 || importing}
            className="rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import {products(toAdd)}
          </button>
        </div>
      )}
    </div>
  );
}
