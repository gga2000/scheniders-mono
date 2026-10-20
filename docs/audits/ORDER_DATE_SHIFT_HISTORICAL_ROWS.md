# Historical orders still carrying a shifted placement date

**Status:** open decision, no action taken. Recorded 2026-09-07.

## Background

Until 2026-09-07 employees postponed an order by editing its order date forward,
which overwrote `orders.created_at`. That is now impossible: a database trigger
rejects a future `created_at`, and postponing is `scheduled_date`. See migration
`20260907164150_orders_schedule_not_created_at`.

That migration repaired only the **8 orders that were still live or still dated in
the future**. It deliberately left the **168 terminal orders** (completed, delivered,
rejected, cancelled, refund_delivered) alone, because their dates are already in the
past and no longer mislead anyone in the queue, while rewriting them moves historical
revenue between reporting periods.

## What the leftover rows look like

All 168 belong to a single tenant, Scheniders Iraq.

| Measure | Value |
| --- | --- |
| Orders | 168 |
| Real placement dates span | 2026-01-01 to 2026-06-30 |
| Average forward shift | 5.7 days |
| Orders reported in the wrong month | 21 |
| Value of those 21 orders | 825,500 IQD |
| Completed-order value across all 168 | 4,784,750 IQD |

The 21 that cross a month boundary, by real month and the month they are currently
reported in:

| Real month | Reported as | Orders | Value (IQD) |
| --- | --- | --- | --- |
| 2026-01 | 2026-03 | 5 | 217,000 |
| 2026-01 | 2026-04 | 1 | 36,750 |
| 2026-01 | 2026-05 | 1 | 36,750 |
| 2026-02 | 2026-03 | 1 | 44,750 |
| 2026-03 | 2026-04 | 2 | 89,500 |
| 2026-04 | 2026-05 | 9 | 329,250 |
| 2026-05 | 2026-06 | 2 | 71,500 |

This matters because `get_orders_aggregates` buckets revenue on `created_at`, so
those orders currently count toward the wrong month. Payroll is unaffected: it
buckets completed orders on `completed_at`.

## The decision

**Leave them.** Monthly figures already reported to anyone stay as they were. The
`date edited` badge on each order stays honest about what happened, and the tooltip
shows the original date.

**Or repair them**, which makes every historical report match reality but changes
numbers that may already have been shared. If you want that, run the statement
below. It is not in `packages/supabase/migrations/` on purpose, so nothing applies
it automatically.

```sql
-- Restore the real placement date on the remaining historical rows.
-- Take a backup first: this rewrites dates that historical reports are built on.
UPDATE public.orders o
SET
    scheduled_date      = COALESCE(o.scheduled_date, (o.created_at AT TIME ZONE 'Asia/Baghdad')::date),
    created_at          = o.original_created_at,
    original_created_at = NULL
WHERE o.original_created_at IS NOT NULL
  AND o.created_at > o.original_created_at
  AND o.deleted_at IS NULL;
```

The 37 orders whose date was corrected **backwards** are genuine corrections of
mistyped dates. They are not in scope here and should not be touched.
