import { useState } from "react";
import { toast } from "sonner";
import { useLeadDetail } from "@/hooks/use-lead-detail";
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
 * says so when that fails.
 *
 * The form shows the draft as read by its id (round 14): after a refused save
 * the draft may have left the list's page or filter, and its own read is what
 * a refused save reads again, so the form takes the colleague's lists in. A
 * draft reopened while its own close save runs waits for that save and the
 * read after it: the copy from before would make its next save refused over
 * this person's own change.
 */
export function useResumedDraft(leads: readonly Lead[]) {
  const [opened, setOpened] = useState<Lead | null>(null);
  // Whether the form is showing the opened draft. Once shown it stays, so a
  // Save in flight does not close it.
  const [shown, setShown] = useState(false);
  // The draft's last close save, and when it answered.
  const [lastSave, setLastSave] = useState<{ id: string; at: number } | null>(null);
  const updateLead = useUpdateLead();
  const id = opened?.id ?? null;
  const read = useLeadDetail(id);

  // Its own read once it answered; the list's copy, or the one clicked, until then.
  const draft = opened ? (read.data?.lead ?? leads.find((lead) => lead.id === opened.id) ?? opened) : null;
  const initialData = draft ? leadToFormData(draft) : undefined;

  const saving = updateLead.isPending && updateLead.variables?.id === id;
  const readSinceSave =
    lastSave?.id !== id || read.isError || (read.data !== undefined && read.dataUpdatedAt >= lastSave.at);
  if (opened && !shown && !saving && readSinceSave) setShown(true);

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
      {
        onError: (error) => toast.error(draftNotSavedText(error)),
        onSettled: () => setLastSave({ id: draft.id, at: Date.now() }),
      },
    );
  };

  return {
    /** Open a draft row in the form. */
    resume: (lead: Lead) => {
      setOpened(lead);
      setShown(false);
    },
    /** The form's `key`: a new draft starts a new form. */
    formKey: id ?? "no-draft",
    form: {
      open: opened !== null && shown,
      onOpenChange: (open: boolean) => {
        if (open) return;
        setOpened(null);
        setShown(false);
      },
      initialData,
      onSubmit,
      onSaveDraft,
    },
  };
}
