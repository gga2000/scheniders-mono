import { cn } from "@/lib/utils";

export type ImportStep = 1 | 2 | 3;

const STEPS: Array<{ step: ImportStep; label: string }> = [
  { step: 1, label: "File" },
  { step: 2, label: "Columns" },
  { step: 3, label: "Check" },
];

/** The three steps of an import; a step is open once the one before it is done. */
export function ImportStepChips({
  current,
  reachable,
  onGo,
}: {
  current: ImportStep;
  /** The last step that may be opened now. */
  reachable: ImportStep;
  onGo: (step: ImportStep) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Import steps">
      {STEPS.map(({ step, label }) => (
        <li key={step}>
          <button
            type="button"
            onClick={() => onGo(step)}
            disabled={step > reachable}
            aria-current={step === current ? "step" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed",
              step === current
                ? "bg-foreground text-background"
                : "bg-foreground/[0.06] text-foreground/75 hover:bg-foreground/10 disabled:hover:bg-foreground/[0.06]",
            )}
          >
            {step} {label}
          </button>
        </li>
      ))}
    </ol>
  );
}
