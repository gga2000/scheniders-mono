"use client";

import { useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { adminFetch } from "@/lib/admin-fetch";
import { formatCount as count } from "@/lib/format";
import { IMPORT_MAX_FILE_BYTES, IMPORT_MAX_ROWS } from "@/lib/product-import";
import { readAnswerSchema, type ReadAnswer } from "@/lib/product-import-run";
import { cn } from "@/lib/utils";

/** Step 1: the merchant's file goes to the console, which reads it and answers its rows. */
export function ImportFileStep({
  shopId,
  read,
  onRead,
}: {
  shopId: string;
  /** The file read last, if any. */
  read: { fileName: string; answer: ReadAnswer } | null;
  onRead: (fileName: string, answer: ReadAnswer) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function readFile(file: File) {
    setError(null);
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      setError("The file is bigger than 4 MB. Split it into smaller files.");
      return;
    }
    setBusy(file.name);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await adminFetch(`/api/merchants/${shopId}/product-import/read`, { method: "POST", body: form });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : null;
        setError(message ?? "The file could not be read. Try again.");
        return;
      }
      const answer = readAnswerSchema.safeParse(body);
      if (!answer.success) {
        setError("The console's answer could not be read. Try again.");
        return;
      }
      onRead(file.name, answer.data);
    } catch {
      setError("The console could not be reached. Check the connection and try again.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) void readFile(file);
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Drop the merchant&apos;s file</h2>
        <p className="mt-0.5 text-[13px] text-foreground/70">
          Excel (.xlsx) or CSV, up to 4 MB and {count(IMPORT_MAX_ROWS)} rows. The first sheet with rows is read; the first row that is not empty holds the column names.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv,.txt"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-[13px] transition-colors disabled:cursor-wait",
          over ? "border-[var(--ink-blue)] bg-[var(--ink-blue)]/[0.04]" : "border-[var(--card-border)] hover:bg-foreground/[0.03]",
        )}
      >
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-foreground/70" aria-hidden />
            <span className="text-foreground">Reading {busy}...</span>
          </>
        ) : (
          <>
            <FileSpreadsheet className="h-6 w-6 text-foreground/70" aria-hidden />
            <span className="text-foreground">
              Drop the file here, or <span className="font-semibold underline underline-offset-2">pick a file</span>
            </span>
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-[var(--ink-red)]">
          {error}
        </p>
      )}
      {read && !busy && (
        <p className="text-[13px] text-foreground/75">
          Read: <span className="font-semibold text-foreground">{read.fileName}</span>
          {read.answer.file.sheet ? `, sheet "${read.answer.file.sheet}"` : ""},{" "}
          {count(read.answer.file.rows.filter((row) => row.some((cell) => cell.trim())).length)} rows,{" "}
          {count(read.answer.file.headers.length)} columns.
        </p>
      )}
    </div>
  );
}
