import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin-fetch";

/*
 * The parts every shop action panel shares: a title, a row of choices, the
 * line that says what will happen, and the button that does it. Plain fills,
 * text 13px and up.
 */

export function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <p className="text-[15px] font-semibold text-foreground">{children}</p>
      {aside && <p className="text-[13px] text-foreground/70 tabular-nums">{aside}</p>}
    </div>
  );
}

export function Choice({
  selected,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "rounded-lg px-3 py-1.5 text-[13px] font-semibold tabular-nums transition-colors disabled:opacity-50",
        selected
          ? "bg-foreground text-background"
          : "bg-foreground/[0.05] text-foreground hover:bg-foreground/10",
        className,
      )}
      {...props}
    />
  );
}

export function FieldInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-foreground/45 focus:border-foreground/40",
        className,
      )}
      {...props}
    />
  );
}

/** What pressing the button will do, in a sentence, so the press is the confirm. */
export function WillHappen({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[13px] leading-snug text-foreground/75">{children}</p>;
}

export function ConfirmButton({
  tone = "go",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "go" | "stop" }) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "go" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-rose-700 hover:bg-rose-800",
        className,
      )}
      {...props}
    />
  );
}

/**
 * For a panel's write: while the form is drawn its ErrorLine says a refusal.
 * Once it is gone (staff left the page during the write), a toast says it,
 * starting with what did not happen, so the refusal is never said nowhere.
 */
export function useLateRefusal(notDone: string): (error: Error) => void {
  const drawn = useRef(true);
  useEffect(() => {
    drawn.current = true;
    return () => {
      drawn.current = false;
    };
  }, []);
  return (error) => {
    if (!drawn.current) toast.error(`${notDone} ${error.message}`);
  };
}

export function ErrorLine({ error }: { error: Error | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mb-2 text-[13px] font-medium text-[var(--ink-red)]">
      {error.message}
    </p>
  );
}

/** Posts JSON and throws the API's own error message when it refuses. */
export async function postJson(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<unknown> {
  const res = await adminFetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : "Something went wrong.";
    throw new Error(message);
  }
  return data;
}
