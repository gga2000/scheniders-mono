"use client";

import { formatCount as count } from "@/lib/format";
import type { ImportProgress } from "@/lib/product-import-run";
import { ImportProgressBar as Bar } from "./import-progress-bar";

/** How far the import is: the products, then their images, and what did not go in. */
export function ImportRunPanel({ progress }: { progress: ImportProgress }) {
  const { phase, productsTotal, productsSent, added, skippedInShop, stopped, imagesTotal, imagesTried, imagesSaved, imageFailures } = progress;
  const productsDone = phase !== "products";

  return (
    <section aria-label="Import progress" aria-live="polite" className="space-y-4 rounded-lg border border-[var(--card-border)] p-4">
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold text-foreground">
          {productsDone
            ? `Added ${count(added)} of ${count(productsTotal)} ${productsTotal === 1 ? "product" : "products"}.`
            : `Adding products: ${count(productsSent)} of ${count(productsTotal)}...`}
          {skippedInShop > 0 && (
            <span className="font-normal text-foreground/75">
              {" "}
              {count(skippedInShop)} {skippedInShop === 1 ? "was" : "were"} in the shop by then and left out.
            </span>
          )}
        </p>
        <Bar done={productsSent} total={productsTotal} label="Products sent" />
        {stopped && (
          <p role="alert" className="text-[13px] font-medium text-[var(--ink-red)]">
            {stopped}
          </p>
        )}
      </div>

      {productsDone && imagesTotal > 0 && (
        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold text-foreground">
            {phase === "done"
              ? `Images: ${count(imagesSaved)} of ${count(imagesTotal)} saved.`
              : `Fetching images: ${count(imagesTried)} of ${count(imagesTotal)}...`}
          </p>
          <Bar done={imagesTried} total={imagesTotal} label="Image links tried" />
          {imageFailures.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-[13px] text-foreground/75">
                {count(imageFailures.length)} {imageFailures.length === 1 ? "link" : "links"} gave no image; the product is added without it. Ask the
                merchant for these photos, or add them in the shop&apos;s product editor:
              </p>
              <ul className="max-h-48 space-y-0.5 overflow-auto text-[13px]">
                {imageFailures.map((failure, n) => (
                  <li key={`${failure.row}-${n}`} className="text-foreground">
                    <span className="tabular-nums text-foreground/75">Row {failure.row}: </span>
                    {failure.reason}. <span className="break-all text-foreground/75">{failure.link}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {phase === "done" && imagesTotal === 0 && added > 0 && <p className="text-[13px] text-foreground/75">The file had no image links.</p>}
    </section>
  );
}
