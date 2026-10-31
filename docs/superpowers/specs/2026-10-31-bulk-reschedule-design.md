# Bulk reschedule (postpone) orders

Ali asked to move many orders from one day to another in one go.

## Behaviour
- Tick orders on the orders page, press **Postpone** in the selection bar.
- Dialog: pick a day (today or later), or use Tomorrow / In 3 days / Clear postponement.
- Preview line: "N orders → date" and "M skipped (finished or already shipped)".
- Skipped: settled statuses (completed, delivered, rejected, cancelled, refund_delivered) and `in_transit`. They are never written; they stay selected and are counted in the result toast.
- Writes `orders.scheduled_date` in small sequential batches (same engine as bulk status), with the `version` guard. A row changed by someone else fails as a conflict; failures stay selected with a Retry toast.
- One history line per order: "Updated: Scheduled Date: old → new" (same text as a single-order edit).
- Clear postponement writes `null`.

## Not in scope
- No DB migration (column and index exist). Desktop only.
