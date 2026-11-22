"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AnswerLost, postJson, useStillDrawn } from "@/components/merchants/detail/action-ui";
import { useLeaveGuard } from "@/hooks/use-leave-guard";
import { planImport, type ColumnMapping } from "@/lib/product-import";
import { checkRows, importOutcome, runProductImport, type Answer, type ImportProgress, type ReadAnswer } from "@/lib/product-import-run";
import { ImportCheckStep } from "./import-check-step";
import { ImportColumnsStep } from "./import-columns-step";
import { ImportFileStep } from "./import-file-step";
import { ImportRunPanel } from "./import-run-panel";
import { ImportStepChips, type ImportStep } from "./import-step-chips";

/** One console call, as the run reads it: its JSON, the route's own error, or a lost answer. */
async function answer(url: string, body: unknown): Promise<Answer> {
  try {
    return { ok: true, body: await postJson(url, body) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
      lost: error instanceof AnswerLost,
    };
  }
}

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
  useLeaveGuard(running);
  // Leaving by the sidebar keeps the run going (nothing doubles); how it
  // ended is then said where staff are, as a toast.
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
    const done = await runProductImport({
      fileName: read.fileName,
      products: plan.products,
      photosOnly: plan.photosOnly,
      calls: {
        importBatch: (body) => answer(`/api/merchants/${shopId}/product-import`, body),
        saveImages: (body) => answer(`/api/merchants/${shopId}/product-import/images`, body),
      },
      onProgress: setProgress,
    });
    if (!stillDrawn()) {
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
