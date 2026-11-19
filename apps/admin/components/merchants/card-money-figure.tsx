import { fittedFontSize } from "@/lib/figure-fit";
import { formatCount } from "@/lib/format";

/**
 * One of the Merchants card's two headline money figures. It is always whole:
 * a long figure takes a smaller size to fit its column (lib/figure-fit.ts),
 * and "IQD" goes under the number when the column has no room for both.
 * The column around it must be an `@container`.
 */
export function CardMoneyFigure({ value }: { value: number }) {
  const figure = formatCount(value);
  return (
    <p className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 mt-1 leading-none" title={`${figure} IQD`}>
      <span
        className="font-black text-foreground tabular-nums whitespace-nowrap"
        style={{ fontSize: fittedFontSize(figure, 1.125) }}
      >
        {figure}
      </span>
      <span className="text-xs font-bold text-foreground/70">IQD</span>
    </p>
  );
}
