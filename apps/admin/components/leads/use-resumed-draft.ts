import { useState } from "react";
import { toast } from "sonner";
import { useUpdateLead } from "@/hooks/use-lead-mutations";
import { draftNotSavedText } from "@/lib/lead-update";
import type { Lead, LeadFormData } from "@/types/leads";
import { DRAFT_PLACEHOLDER_NAME, leadToFormData, listsAsOpened } from "./lead-form-data";
import type { LeadFormDraftSave } from "./use-lead-form-controller";

/**
 * A draft lead reopened in the lead form from the list (desktop and phone).
 * Its two saves follow the lead page's rules (staff console audit, round 13):
 * only the fields this person changed, with the lists among them as the draft
 * opened, so a colleague's change made meanwhile is refused, not written
 * over. Save makes it a lead; closing it with changes keeps it a draft and
 * says so when that fails. The draft is the list's copy, so after a refused
 * save the form takes the colleague's lists in.
 */
export function useResumedDraft(leads: readonly Lead[]) {
  const [opened, setOpened] = useState<Lead | null>(null);
  const updateLead = useUpdateLead();

  // The list's copy once it is read again (a refused save reads it again); the one clicked until then.
  const draft = opened ? (leads.find((lead) => lead.id === opened.id) ?? opened) : null;
  const initialData = draft ? leadToFormData(draft) : undefined;

  const onSubmit = async (_data: LeadFormData, changes: Partial<LeadFormData>, asOpened: LeadFormData) => {
    if (!draft) return false;
    await updateLead.mutateAsync({ id: draft.id, data: { ...changes, is_draft: false }, was: listsAsOpened(asOpened, changes) });
    return true;
  };

  const onSaveDraft: LeadFormDraftSave = (_data, changes, asOpened) => {
    if (!draft || Object.keys(changes).length === 0) return;
    // A lead needs a name: a cleared one keeps the draft's placeholder.
    const data = changes.merchant_name === "" ? { ...changes, merchant_name: DRAFT_PLACEHOLDER_NAME } : changes;
    updateLead.mutate(
      { id: draft.id, data, was: listsAsOpened(asOpened, changes) },
      { onError: (error) => toast.error(draftNotSavedText(error)) },
    );
  };

  return {
    /** Open a draft row in the form. */
    resume: setOpened,
    /** The form's `key`: a new draft starts a new form. */
    formKey: opened?.id ?? "no-draft",
    form: {
      open: opened !== null,
      onOpenChange: (open: boolean) => {
        if (!open) setOpened(null);
      },
      initialData,
      onSubmit,
      onSaveDraft,
    },
  };
}
