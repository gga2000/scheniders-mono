"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileJson, ChevronDown } from "lucide-react";

interface ExportButtonProps {
  type: "merchants" | "transactions" | "trials";
  label?: string;
}

export function ExportButton({ type, label }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleExport(format: "csv" | "json") {
    window.open(`/api/export?type=${type}&format=${format}`);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-[var(--card-border)] text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-all flex items-center gap-1.5"
      >
        <Download className="h-3.5 w-3.5" />
        {label ?? "Export"}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg py-1 min-w-[140px] z-10">
          <button
            onClick={() => handleExport("csv")}
            className="w-full px-3 py-2 text-xs hover:bg-foreground/5 cursor-pointer flex items-center gap-2 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={() => handleExport("json")}
            className="w-full px-3 py-2 text-xs hover:bg-foreground/5 cursor-pointer flex items-center gap-2 transition-colors"
          >
            <FileJson className="h-3.5 w-3.5" />
            Export JSON
          </button>
        </div>
      )}
    </div>
  );
}
