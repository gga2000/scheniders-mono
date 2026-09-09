"use client";

import { InlineEditCell } from "@/components/orders/table/inline-edit-cell";
import {
    useOrderInlineEdit,
    inlineFieldValidator,
    type InlineEditableField,
} from "@/hooks/use-order-inline-edit";

/**
 * One inline-editable order field, already wired to the mutation and to the
 * per-field validation rules.
 *
 * WF-4: the table and the card views both render this, so a rule added here —
 * the phone check, say — reaches every surface at once instead of being
 * reimplemented on the second one.
 */
export function OrderInlineEdit({
    orderId,
    field,
    value,
    className,
}: {
    orderId: string;
    field: InlineEditableField;
    value: string;
    className?: string;
}) {
    const { saveField, stopEdit } = useOrderInlineEdit();

    return (
        <InlineEditCell
            value={value}
            orderId={orderId}
            field={field}
            onSave={saveField}
            onClose={stopEdit}
            className={className}
            validate={inlineFieldValidator(field)}
        />
    );
}
