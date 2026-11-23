"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AnswerLost, postJson, useStillDrawn } from "@/components/merchants/detail/action-ui";
import { holdLeaveGuard, useLinkLeaveQuestion } from "@/hooks/use-leave-guard";
import { signedInUserId } from "@/lib/admin-fetch";
import { planImport, type ColumnMapping } from "@/lib/product-import";
import { checkRows, importOutcome, runProductImport, type Answer, type ImportProgress, type ReadAnswer } from "@/lib/product-import-run";
import { ImportCheckStep } from "./import-check-step";
import { ImportColumnsStep } from "./import-columns-step";
import { ImportFileStep } from "./import-file-step";
import { ImportRunPanel } from "./import-run-panel";
import { ImportStepChips, type ImportStep } from "./import-step-chips";

/** Said for each call left once the person who started the import is no longer the one signed in. */
const SIGNED_OUT = "The import stopped: the person who started it is no longer signed in on this tab.";

/**
 * One console call, as the run reads it: its JSON, the route's own error, or
 * a lost answer. It is sent only while the person who started the run
 * (`starter`) is still the one signed in on this tab. Signing out and in are
 * moves inside the tab, so the run outlives them, and each call carries
 * whoever is signed in when it leaves: without this, the next person to sign
 * in would send the rest of the import and be logged for it (console audit
 * round 24).
 */
async function answer(url: string, body: unknown, starter: Promise<string | null>): Promise<Answer> {
  try {
    const [startedBy, now] = await Promise.all([starter, signedInUserId()]);
    if (startedBy === null || now !== startedBy) return { ok: false, error: SIGNED_OUT, lost: false };
    return { ok: true, body: await postJson(url, body) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
      lost: error instanceof AnswerLost,
    };
  }
}

/** Asked before a link moves staff off the page while an import runs. */
const LEAVE_QUESTION =
  "Products are still being imported. Leave this page? The import keeps going, and a message says how it ended.";

/**
 * The product import for the setup service (Fermi B12 item 7): the
 * merchant's file, its columns, then the check and the import, in three
 * steps on one shop. Nothing is saved before the import button.
 */
export function ProductImportFlow({ shopId, shopName }: { shopId: string; shopName: string }) {
  const [step, setStep] = useState<ImportStep>(1);
  const [read, setRead] = useState<{ fileName: string; answer: ReadAnswer } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const running = progress !== null && progress.phase !== "done";
  // Leaving by the sidebar keeps the run going (nothing doubles); how it
  // ended is then said where staff are, as a toast. Staff are asked first,
  // and a reload or a closed tab asks for as long as the run goes on, from
  // any page (startImport).
  useLinkLeaveQuestion(running ? LEAVE_QUESTION : null);
  const stillDrawn = useStillDrawn();

  const plan = useMemo(() => {
    if (!read) return null;
    const { file, shop } = read.answer;
    return planImport({ headers: file.headers, rows: file.rows, firstRow: file.firstRow, mapping, shop });
  }, [read, mapping]);
  const lines = useMemo(() => (plan && read ? checkRows(plan, read.answer.file, mapping) : []), [plan, read, mapping]);

  // Once an import has run, the file and its columns stay as they were.
  const locked = progress !== null;
  const reachable: ImportStep = !read ? 1 : locked || step === 3 ? 3 : 2;

  async function startImport() {
    if (!plan || !read || locked) return;
    // Let go of the guard in the same step that shows the run as done, so
    // the words "done" never sit beside a question about leaving.
    const release = holdLeaveGuard();
    // Read now, awaited by the first call, so nothing waits before the run
    // shows as started (a second press finds it locked).
    const starter = signedInUserId().catch(() => null);
    const done = await runProductImport({
      fileName: read.fileName,
      products: plan.products,
      photosOnly: plan.photosOnly,
      calls: {
        importBatch: (body) => answer(`/api/merchants/${shopId}/product-import`, body, starter),
        saveImages: (body) => answer(`/api/merchants/${shopId}/product-import/images`, body, starter),
      },
      onProgress: (next) => {
        if (next.phase === "done") release();
        setProgress(next);
      },
    }).finally(release);
    // Said where staff are, and only to the person who started it: someone
    // else signed in on this tab since is not told of it.
    if (!stillDrawn() && (await starter) === (await signedInUserId().catch(() => null))) {
      const outcome = importOutcome(shopName, done);
      (outcome.ok ? toast.success : toast.error)(outcome.title, outcome.description ? { description: outcome.description } : undefined);
    }
  }

  function startOver() {
    setRead(null);
    setMapping([]);
    setProgress(null);
    setStep(1);
  }

  return (
    <div className="pastel-card space-y-5 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ImportStepChips current={step} reachable={reachable} onGo={(next) => !locked && setStep(next)} />
        {progress?.phase === "done" && (
          <button
            type="button"
            onClick={startOver}
            className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.05]"
          >
            Import another file
          </button>
        )}
      </div>

      {step === 1 && (
        <ImportFileStep
          shopId={shopId}
          read={read}
          onRead={(fileName, readAnswer) => {
            setRead({ fileName, answer: readAnswer });
            setMapping(readAnswer.mapping);
            setStep(2);
          }}
        />
      )}
      {step === 2 && read && (
        <ImportColumnsStep
          headers={read.answer.file.headers}
          rows={read.answer.file.rows}
          mapping={mapping}
          onChange={setMapping}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && plan && (
        <>
          <ImportCheckStep
            shopName={shopName}
            lines={lines}
            withChoices={plan.products.filter((product) => product.variants.length > 0).length}
            photosFor={plan.photosOnly.length}
            importing={running}
            done={locked}
            onImport={() => void startImport()}
          />
          {progress && <ImportRunPanel progress={progress} />}
        </>
      )}
    </div>
  );
}
