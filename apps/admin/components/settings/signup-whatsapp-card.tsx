"use client";

import { useState } from "react";
import { queryOptions, useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { z } from "zod";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { PLATFORM_WHATSAPP_TEMPLATES } from "@scheniders/shared/whatsapp-templates";
import { SIGNUP_WHATSAPP_OFF, signupWhatsAppSettingsSchema, type SignupWhatsAppSettings } from "@scheniders/shared/signup-whatsapp";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";
import { cn } from "@/lib/utils";

const responseSchema = z.object({ settings: signupWhatsAppSettingsSchema, updated_at: z.string().nullable() });

/** Shared with the Settings page, which starts the read before the card is drawn. */
export const signupWhatsAppQuery = queryOptions({
  queryKey: ["admin", "signup-whatsapp"] as const,
  queryFn: async () =>
    responseSchema.parse(await okOrLoadFailure(await adminFetch("/api/settings/signup-whatsapp"), "the signup WhatsApp settings").json()),
});

/**
 * «WhatsApp at signup» (Fermi B11): the code a new owner proves their number
 * with, and the welcome with the store link and the short video. Each stays
 * off until Interakt approves its template under the name shown. Super
 * admins switch them.
 */
export function SignupWhatsAppCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery(signupWhatsAppQuery);

  const save = useMutation({
    mutationFn: async (settings: SignupWhatsAppSettings) => {
      const res = await adminFetch("/api/settings/signup-whatsapp", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `Save failed: ${res.status}`);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: signupWhatsAppQuery.queryKey }),
  });

  return (
    <div className="pastel-card p-6" data-testid="signup-whatsapp-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
          <MessageCircle className="w-4 h-4 text-foreground/70" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">WhatsApp at signup</h2>
          <p className="text-xs text-foreground/70">
            Sent from our own number and paid by us, never by the shop. Turn each on only after Interakt approves its template.{" "}
            {canEdit ? "" : "Only a super admin can change them."}
          </p>
        </div>
      </div>

      {isLoading ? (
        // The form, greyed and switched off, holds the card's height until the settings arrive.
        <SignupWhatsAppForm saved={SIGNUP_WHATSAPP_OFF} canEdit={canEdit} save={save} loading />
      ) : isError || !data ? (
        <p className="text-xs text-[var(--ink-red)]">Could not load the signup WhatsApp settings. Reload the page.</p>
      ) : (
        <SignupWhatsAppForm key={data.updated_at ?? "unsaved"} saved={data.settings} canEdit={canEdit} save={save} />
      )}
    </div>
  );
}

function Switch({
  checked,
  disabled,
  onChange,
  title,
  hint,
  testId,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  hint: string;
  testId: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-foreground disabled:opacity-50"
        data-testid={testId}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <span className="text-xs text-foreground/70">{hint}</span>
      </span>
    </label>
  );
}

function SignupWhatsAppForm({
  saved,
  canEdit,
  save,
  loading = false,
}: {
  saved: SignupWhatsAppSettings;
  canEdit: boolean;
  save: UseMutationResult<void, Error, SignupWhatsAppSettings>;
  loading?: boolean;
}) {
  const editable = canEdit && !loading;
  const [form, setForm] = useState<SignupWhatsAppSettings>(saved);
  const dirty = form.phone_code !== saved.phone_code || form.welcome !== saved.welcome || form.welcome_video_url !== saved.welcome_video_url;
  const valid = signupWhatsAppSettingsSchema.safeParse(form);

  return (
    <form
      aria-busy={loading || undefined}
      className={cn("grid gap-4", loading && "opacity-50")}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid.success) save.mutate(valid.data);
      }}
    >
      <Switch
        checked={form.phone_code}
        disabled={!editable}
        onChange={(on) => setForm((prev) => ({ ...prev, phone_code: on, welcome: on && prev.welcome }))}
        title="Ask for a WhatsApp code at signup"
        hint={`A new owner must type the 6-digit code we send before the store is made. Template: ${PLATFORM_WHATSAPP_TEMPLATES.signupCode.name} (Authentication, Arabic).`}
        testId="signup-whatsapp-code"
      />
      <Switch
        checked={form.welcome}
        disabled={!editable || !form.phone_code}
        onChange={(on) => setForm((prev) => ({ ...prev, welcome: on }))}
        title="Send the welcome message"
        hint={`After signup, the proven number gets the store link and the video below. Needs the code on. Template: ${PLATFORM_WHATSAPP_TEMPLATES.welcome.name} (Utility, Arabic).`}
        testId="signup-whatsapp-welcome"
      />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-foreground">How-to video link</span>
        <input
          type="url"
          dir="ltr"
          value={form.welcome_video_url ?? ""}
          disabled={!editable}
          placeholder="https://youtu.be/…"
          onChange={(e) => setForm((prev) => ({ ...prev, welcome_video_url: e.target.value.trim() === "" ? null : e.target.value.trim() }))}
          className="rounded-xl bg-white/80 px-3 py-1.5 text-sm ring-1 ring-foreground/10 outline-none focus:ring-foreground/30 disabled:opacity-60 dark:bg-white/10"
          data-testid="signup-whatsapp-video"
        />
        <span className="text-xs text-foreground/70">The 60-second video sent in the welcome. An https link.</span>
      </label>
      {canEdit && (
        <div className="flex items-center justify-end gap-3">
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
