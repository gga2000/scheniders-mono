"use client";

import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, type ColumnMapping, type ImportField } from "@/lib/product-import";
import { firstValue, missingFields, setColumn } from "@/lib/product-import-run";

const SKIP = "";

/** Step 2: which product field each column of the file fills, guessed from its name. */
export function ImportColumnsStep({
  headers,
  rows,
  mapping,
  onChange,
  onNext,
}: {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  onNext: () => void;
}) {
  const missing = missingFields(mapping);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Match the file&apos;s columns</h2>
        <p className="mt-0.5 text-[13px] text-foreground/70">
          Guessed from the column names. Change any that are wrong; leave unused ones on &quot;Skip&quot;. Rows with the same name and a size or
          colour become one product with choices.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--card-border)] text-left text-foreground/70">
              <th className="py-2 pr-4 font-medium">Column in the file</th>
              <th className="py-2 pr-4 font-medium">First value</th>
              <th className="py-2 font-medium">Goes to</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header, column) => {
              const sample = firstValue(rows, column);
              return (
                <tr key={column} className="border-b border-[var(--card-border)] last:border-0">
                  <td className="py-2 pr-4 font-medium text-foreground">
                    {header || <span className="text-foreground/70">Column {column + 1}, no name</span>}
                  </td>
                  <td className="max-w-[18rem] truncate py-2 pr-4 text-foreground/75" title={sample}>
                    {sample || "empty"}
                  </td>
                  <td className="py-2">
                    <select
                      aria-label={`What "${header || `column ${column + 1}`}" holds`}
                      value={mapping[column] ?? SKIP}
                      onChange={(event) =>
                        onChange(setColumn(mapping, column, event.target.value === SKIP ? null : (event.target.value as ImportField)))
                      }
                      className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/40"
                    >
                      <option value={SKIP}>Skip</option>
                      {IMPORT_FIELDS.map((field) => (
                        <option key={field} value={field}>
                          {IMPORT_FIELD_LABELS[field]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onNext}
          disabled={missing.length > 0}
          className="rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          Check the rows
        </button>
        {missing.length > 0 && (
          <p className="text-[13px] text-[var(--ink-red)]">
            Choose the column that holds the {missing.map((field) => IMPORT_FIELD_LABELS[field].toLowerCase()).join(" and the ")}.
          </p>
        )}
      </div>
    </div>
  );
}
