import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLeadDetail } from "@/hooks/use-lead-detail";
import { useUpdateLead } from "@/hooks/use-lead-mutations";
import { LEAD_GONE, LEAD_GONE_TOAST, LeadGoneError, draftNotSavedText } from "@/lib/lead-update";
import { LoadFailure } from "@/lib/load-failure";
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
 *
 * A draft a colleague deleted (its read or a save answers 404, round 15) does
 * not open, or closes: it says so once, in the lead page's words, and the list
 * reads again without it.
 *
 * Each save keeps its own answer (round 15): a second save while one runs (a
 * close save of draft A, then Save on draft B) used to replace the first one's
 * callbacks, so A's refusal said nothing and A reopened at once with its old
 * copy. So saves are counted, and their answer times kept, by draft id.
 */
export function useResumedDraft(leads: readonly Lead[]) {
  const [opened, setOpened] = useState<Lead | null>(null);
  // Whether the form is showing the opened draft. Once shown it stays, so a
  // Save in flight does not close it.
  const [shown, setShown] = useState(false);
  // Saves still running, and when the last one answered, by draft id.
  const [running, setRunning] = useState<ReadonlyMap<string, number>>(new Map());
  const [answeredAt, setAnsweredAt] = useState<ReadonlyMap<string, number>>(new Map());
  const updateLead = useUpdateLead();
  const save = (variables: Parameters<typeof updateLead.mutateAsync>[0]) => {
    const count = (by: number) => (now: ReadonlyMap<string, number>) =>
      new Map(now).set(variables.id, (now.get(variables.id) ?? 0) + by);
    setRunning(count(1));
    return updateLead.mutateAsync(variables).finally(() => {
      setRunning(count(-1));
      setAnsweredAt((now) => new Map(now).set(variables.id, Date.now()));
    });
  };
  const queryClient = useQueryClient();
  const id = opened?.id ?? null;
  const read = useLeadDetail(id);
  const gone = opened !== null && read.error instanceof LoadFailure && read.error.status === 404;
  useEffect(() => {
    if (!gone) return;
    toast.error(LEAD_GONE, { id: LEAD_GONE_TOAST });
    void queryClient.invalidateQueries({ queryKey: ["leads"] });
  }, [gone, queryClient]);

  // Its own read once it answered; the list's copy, or the one clicked, until then.
  const draft = opened ? (read.data?.lead ?? leads.find((lead) => lead.id === opened.id) ?? opened) : null;
  const initialData = draft ? leadToFormData(draft) : undefined;

  const saving = id !== null && (running.get(id) ?? 0) > 0;
  const savedAt = id === null ? undefined : answeredAt.get(id);
  // A read since the save answered. useUpdateLead marks the lead's read stale
  // as the save answers, before its promise settles here, so a fresh read is
  // one that answered after it, however fast it came back.
  const readSinceSave =
    savedAt === undefined ||
    read.isError ||
    (read.data !== undefined && (!read.isStale || read.dataUpdatedAt >= savedAt));
  if (opened && !shown && !saving && readSinceSave) setShown(true);

  const onSubmit = async (_data: LeadFormData, changes: Partial<LeadFormData>, asOpened: LeadFormData) => {
    if (!draft) return false;
    await save({ id: draft.id, data: { ...changes, is_draft: false }, was: listsAsOpened(asOpened, changes) });
    return true;
  };

  const onSaveDraft: LeadFormDraftSave = (_data, changes, asOpened) => {
    if (!draft || Object.keys(changes).length === 0) return;
    // A lead needs a name: a cleared one keeps the draft's placeholder.
    const data = changes.merchant_name === "" ? { ...changes, merchant_name: DRAFT_PLACEHOLDER_NAME } : changes;
    save({ id: draft.id, data, was: listsAsOpened(asOpened, changes) }).catch((error: Error) => {
      if (error instanceof LeadGoneError) toast.error(LEAD_GONE, { id: LEAD_GONE_TOAST });
      else toast.error(draftNotSavedText(error));
    });
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
      open: opened !== null && shown && !gone,
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
