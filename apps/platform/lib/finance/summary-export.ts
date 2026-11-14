import { buildStatement, dayProfit, productRows, type FinanceSummary } from "@/lib/finance/summary";

type Row = (string | number)[];

/**
 * The summary as one spreadsheet table: the profit statement, then the days,
 * then the products. `label` turns a string key into the reader's language.
 */
export function summaryCsvTable(summary: FinanceSummary, label: (key: string) => string): { headers: string[]; rows: Row[] } {
    const statement = buildStatement(summary);
    const blank: Row = [];
    const rows: Row[] = [
        [label("fin.line.sales"), statement.sales],
        ...statement.lines.map((line): Row => [label(`fin.line.${line.id}`), line.amount === 0 ? 0 : -line.amount]),
        [label("fin.line.net"), statement.netProfit],
        blank,
        [label("fin.daily.title.day"), label("fin.products.col.units"), label("fin.daily.sales"), label("fin.daily.profit")],
        ...summary.daily.map((d): Row => [d.day, d.orders, d.revenue, dayProfit(d)]),
        blank,
        [
            label("fin.products.col.product"), label("fin.products.col.units"), label("fin.products.col.sales"),
            label("fin.products.col.cost"), label("fin.products.col.profit"),
        ],
        ...productRows(summary).map((p): Row => [p.name || label("fin.products.unnamed"), p.units, p.sales, p.cost, p.profit]),
    ];
    return { headers: [label("fin.statement.title"), `${summary.from} / ${summary.to}`], rows };
}
