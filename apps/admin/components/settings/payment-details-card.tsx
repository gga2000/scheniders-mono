"use client";

import { useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { z } from "zod";
import { Check, Landmark, Loader2 } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";
import { cn } from "@/lib/utils";
import { EMPTY_PAYMENT_DETAILS, paymentDetailsSchema, type PaymentDetails } from "@/lib/topup-queue";

const responseSchema = z.object({ details: paymentDetailsSchema, updated_at: z.string().nullable() });

/** Shared with the Settings page, which starts the read before the card is drawn. */
export const paymentDetailsQuery = queryOptions({
  queryKey: ["admin", "payment-details"] as const,
  queryFn: async () => responseSchema.parse(await okOrLoadFailure(await adminFetch("/api/settings/payment-details"), "the payment details").json()),
});

const FIELDS: { key: keyof PaymentDetails; label: string; hint: string; ltr?: boolean }[] = [
  { key: "qi_card", label: "Qi card number", hint: "Shops transfer to this number.", ltr: true },
  { key: "qi_card_name", label: "Name on the Qi account", hint: "So the shop can check it before sending." },
  { key: "zain_cash", label: "Zain Cash number", hint: "Leave empty to hide Zain Cash.", ltr: true },
  { key: "support_whatsapp", label: "Support WhatsApp", hint: "Digits with the country code, like 9647701234567.", ltr: true },
  { key: "working_hours", label: "Working hours", hint: "Shown after a shop sends a receipt, like «Sat–Thu, 10 am–6 pm»." },
  { key: "legal_name", label: "Legal name on receipts", hint: "Printed at the top of every payment receipt." },
];

/**
 * «How shops pay us» (Fermi B3): where shops send money and what their printed
 * receipts name. Every shop sees these. Super admins edit them.
 */
export function PaymentDetailsCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery(paymentDetailsQuery);

  const save = useMutation({
    mutationFn: async (details: PaymentDetails) => {
      const res = await adminFetch("/api/settings/payment-details", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(details),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `Save failed: ${res.status}`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: paymentDetailsQuery.queryKey }),
  });

  return (
    <div className="pastel-card p-6" data-testid="payment-details-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
          <Landmark className="w-4 h-4 text-foreground/70" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">How shops pay us</h2>
          <p className="text-xs text-foreground/70">
            Every shop sees these when it pays by transfer. {canEdit ? "" : "Only a super admin can change them."}
          </p>
        </div>
      </div>

      {isLoading ? (
        // The empty form, greyed, holds the card's height until the details arrive.
        <PaymentDetailsForm saved={EMPTY_PAYMENT_DETAILS} canEdit={canEdit} save={save} loading />
      ) : isError || !data ? (
        <p className="text-xs text-[var(--ink-red)]">Could not load the payment details. Reload the page.</p>
      ) : (
        // A new save gives a new updated_at, so the form starts again from what was saved.
        <PaymentDetailsForm key={data.updated_at ?? "unsaved"} saved={data.details} canEdit={canEdit} save={save} />
      )}
    </div>
  );
}

function PaymentDetailsForm({
  saved,
  canEdit,
  save,
  loading = false,
}: {
  saved: PaymentDetails;
  canEdit: boolean;
  save: UseMutationResult<void, Error, PaymentDetails>;
  loading?: boolean;
}) {
  const [form, setForm] = useState<PaymentDetails>(saved);
  const dirty = (Object.keys(form) as (keyof PaymentDetails)[]).some((k) => form[k] !== saved[k]);
  const valid = paymentDetailsSchema.safeParse(form);

  return (
    <form
      aria-busy={loading || undefined}
      className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", loading && "opacity-50")}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid.success) save.mutate(valid.data);
      }}
    >
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-foreground">{f.label}</span>
          <input
            type="text"
            dir={f.ltr ? "ltr" : "auto"}
            value={form[f.key]}
            disabled={!canEdit || loading}
            onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
            className="rounded-xl bg-white/80 px-3 py-1.5 text-sm ring-1 ring-foreground/10 outline-none focus:ring-foreground/30 disabled:opacity-60 dark:bg-white/10"
            data-testid={`payment-details-${f.key}`}
          />
          <span className="text-xs text-foreground/70">{f.hint}</span>
        </label>
      ))}
      {canEdit && (
        <div className="md:col-span-2 flex items-center justify-end gap-3">
          {!loading && !valid.success && <span className="text-xs text-[var(--ink-red)]">{valid.error.issues[0]?.message}</span>}
          {save.isError && <span className="text-xs text-[var(--ink-red)]">{save.error.message}</span>}
          {save.isSuccess && !dirty && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--ink-green)]">
              <Check className="w-3 h-3" />
              Saved
            </span>
          )}
          <button
            type="submit"
            disabled={loading || !dirty || !valid.success || save.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-40"
          >
            {save.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            Save
          </button>
        </div>
      )}
    </form>
  );
}
