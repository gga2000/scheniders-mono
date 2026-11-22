import { fittedFontSize } from "@/lib/figure-fit";
import { formatCount } from "@/lib/format";

/**
 * One of the Merchants card's two headline money figures. It is always whole:
 * a long figure takes a smaller size to fit its column (lib/figure-fit.ts),
 * and "IQD" goes under the number when the column has no room for both.
 * Its own line is the size container, as wide as the column. The column
 * itself must not be one: a container is under layout containment, which
 * turns off the column's subgrid, and the line under the figure (the city,
 * the order count) then got no height and was hidden.
 */
export function CardMoneyFigure({ value }: { value: number }) {
  const figure = formatCount(value);
  return (
    <p className="@container flex flex-wrap items-baseline gap-x-1 gap-y-0.5 mt-1 leading-none" title={`${figure} IQD`}>
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
