"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE_CHROME } from "@/lib/animation-constants";
import {
  X,
  Upload,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface LeadImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

const LEAD_FIELDS = [
  { value: "merchant_name", label: "Merchant Name" },
  { value: "platform", label: "Platform" },
  { value: "platform_url", label: "Platform URL" },
  { value: "follower_count", label: "Follower Count" },
  { value: "management_name", label: "Management Name" },
  { value: "management_info", label: "Management Info" },
  { value: "page_phone", label: "Page Phone" },
  { value: "avg_view_count", label: "Avg View Count" },
  { value: "avg_like_count", label: "Avg Like Count" },
  { value: "avg_comments_count", label: "Avg Comments Count" },
  { value: "address", label: "Address" },
  { value: "city", label: "City" },
  { value: "priority", label: "Priority" },
  { value: "tags", label: "Tags (comma-separated)" },
  { value: "__skip__", label: "Skip this column" },
] as const;

type LeadFieldValue = (typeof LEAD_FIELDS)[number]["value"];

// Header similarity mapping for auto-detection
const HEADER_ALIASES: Record<string, LeadFieldValue> = {
  name: "merchant_name",
  merchant_name: "merchant_name",
  merchant: "merchant_name",
  business: "merchant_name",
  business_name: "merchant_name",
  store: "merchant_name",
  platform: "platform",
  source: "platform",
  platform_url: "platform_url",
  url: "platform_url",
  link: "platform_url",
  profile_url: "platform_url",
  followers: "follower_count",
  follower_count: "follower_count",
  follower: "follower_count",
  management_name: "management_name",
  manager: "management_name",
  contact: "management_name",
  contact_name: "management_name",
  management_info: "management_info",
  manager_info: "management_info",
  phone: "page_phone",
  page_phone: "page_phone",
  phone_number: "page_phone",
  mobile: "page_phone",
  views: "avg_view_count",
  avg_views: "avg_view_count",
  avg_view_count: "avg_view_count",
  likes: "avg_like_count",
  avg_likes: "avg_like_count",
  avg_like_count: "avg_like_count",
  comments: "avg_comments_count",
  avg_comments: "avg_comments_count",
  avg_comments_count: "avg_comments_count",
  address: "address",
  location: "address",
  city: "city",
  priority: "priority",
  tags: "tags",
  tag: "tags",
};

interface ParsedRow {
  [key: string]: string;
}

interface ValidationResult {
  index: number;
  row: Record<string, string>;
  valid: boolean;
  warnings: string[];
}

// ── CSV Parser ─────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.trim() || lines.length > 0) {
        lines.push(current);
      }
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    lines.push(current);
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const splitRow = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === "," && !quoted) {
        fields.push(field.trim());
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const headers = splitRow(lines[0]);
  const rows = lines.slice(1).map(splitRow).filter((row) => row.some((cell) => cell.length > 0));

  return { headers, rows };
}

function autoDetectMapping(headers: string[]): Record<number, LeadFieldValue> {
  const mapping: Record<number, LeadFieldValue> = {};
  const usedFields = new Set<LeadFieldValue>();

  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const match = HEADER_ALIASES[normalized];
    if (match && !usedFields.has(match)) {
      mapping[index] = match;
      usedFields.add(match);
    }
  });

  return mapping;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Step Indicator ─────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { num: 1, label: "Upload" },
    { num: 2, label: "Map" },
    { num: 3, label: "Review" },
    { num: 4, label: "Import" },
  ];

  return (
    <div className="flex items-center justify-center gap-0 px-6 py-4 border-b border-[var(--card-border)]">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                step.num < currentStep
                  ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                  : step.num === currentStep
                    ? "bg-[var(--primary)] text-[var(--primary-fg)] ring-4 ring-[var(--primary)]/20"
                    : "bg-[var(--foreground)]/10 text-[var(--muted)]"
              )}
            >
              {step.num < currentStep ? <Check className="w-4 h-4" /> : step.num}
            </div>
            <span
              className={cn(
                "text-[10px] font-semibold transition-colors",
                step.num <= currentStep ? "text-[var(--foreground)]" : "text-[var(--muted)]"
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "w-12 h-0.5 mx-2 mb-4 rounded-full transition-colors",
                step.num < currentStep ? "bg-[var(--primary)]" : "bg-[var(--foreground)]/10"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export function LeadImportDialog({ isOpen, onClose }: LeadImportDialogProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Step 1: Upload state
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Column mapping
  const [columnMapping, setColumnMapping] = useState<Record<number, LeadFieldValue>>({});

  // Step 3: Validation
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);

  // Step 4: Import
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setDirection(1);
      setFile(null);
      setHeaders([]);
      setRows([]);
      setIsDragging(false);
      setColumnMapping({});
      setValidationResults([]);
      setImportProgress(0);
      setIsImporting(false);
      setImportResult(null);
    }
  }, [isOpen]);

  // ── File handling ──────────────────────────────────────────────────

  const processFile = useCallback((f: File) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows: r } = parseCSV(text);
      setHeaders(h);
      setRows(r);
      const detectedMapping = autoDetectMapping(h);
      setColumnMapping(detectedMapping);
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && (droppedFile.name.endsWith(".csv") || droppedFile.name.endsWith(".xlsx"))) {
        processFile(droppedFile);
      }
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) processFile(selected);
    },
    [processFile]
  );

  // ── Navigation ─────────────────────────────────────────────────────

  const goNext = () => {
    if (step === 2) {
      // Validate before moving to step 3
      const results = buildValidationResults();
      setValidationResults(results);
    }
    setDirection(1);
    setStep((s) => Math.min(s + 1, 4) as WizardStep);
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => Math.max(s - 1, 1) as WizardStep);
  };

  // ── Validation ─────────────────────────────────────────────────────

  const buildValidationResults = useCallback((): ValidationResult[] => {
    return rows.map((row, index) => {
      const mapped: Record<string, string> = {};
      headers.forEach((_, colIdx) => {
        const field = columnMapping[colIdx];
        if (field && field !== "__skip__") {
          mapped[field] = row[colIdx] || "";
        }
      });

      const warnings: string[] = [];
      if (!mapped.merchant_name?.trim()) {
        warnings.push("Missing merchant name");
      }
      if (!mapped.platform?.trim()) {
        warnings.push("Missing platform");
      }

      return {
        index,
        row: mapped,
        valid: warnings.length === 0,
        warnings,
      };
    });
  }, [rows, headers, columnMapping]);

  // ── Import ─────────────────────────────────────────────────────────

  const handleImport = async () => {
    setIsImporting(true);
    setImportProgress(0);

    const mappedLeads = validationResults.map((vr) => {
      const lead: Record<string, unknown> = { ...vr.row };
      // Convert numeric fields
      const numericFields = ["follower_count", "avg_view_count", "avg_like_count", "avg_comments_count"];
      numericFields.forEach((f) => {
        if (lead[f]) lead[f] = parseInt(lead[f] as string, 10) || 0;
      });
      // Convert tags from comma-separated to array
      if (lead.tags && typeof lead.tags === "string") {
        lead.tags = (lead.tags as string).split(",").map((t) => t.trim()).filter(Boolean);
      }
      return lead;
    });

    // Simulate progress while the request is in flight
    const progressInterval = setInterval(() => {
      setImportProgress((p) => {
        if (p >= 90) return p;
        return p + Math.random() * 15;
      });
    }, 200);

    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: mappedLeads }),
      });

      clearInterval(progressInterval);
      setImportProgress(100);

      if (res.ok) {
        const data = await res.json();
        setImportResult({
          success: data.imported ?? mappedLeads.length,
          errors: data.errors ?? 0,
        });
      } else {
        setImportResult({
          success: 0,
          errors: mappedLeads.length,
        });
      }
    } catch {
      clearInterval(progressInterval);
      setImportProgress(100);
      setImportResult({
        success: 0,
        errors: mappedLeads.length,
      });
    } finally {
      setIsImporting(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────

  const previewRows = useMemo(() => rows.slice(0, 3), [rows]);
  const validCount = useMemo(
    () => validationResults.filter((r) => r.valid).length,
    [validationResults]
  );
  const warningCount = useMemo(
    () => validationResults.filter((r) => !r.valid).length,
    [validationResults]
  );

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 24 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Header ────────────────────────────────────── */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                  <h2 className="text-lg font-bold text-[var(--foreground)]">
                    Import Leads
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── Step Indicator ─────────────────────────────── */}
              <StepIndicator currentStep={step} />

              {/* ── Content Area ───────────────────────────────── */}
              <div className="flex-1 overflow-y-auto relative">
                <AnimatePresence mode="wait" custom={direction}>
                  {/* ── Step 1: Upload ────────────────────────── */}
                  {step === 1 && (
                    <motion.div
                      key="step-1"
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.2, ease: EASE_CHROME }}
                      className="px-6 py-6 space-y-5"
                    >
                      {/* Drop zone */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        className={cn(
                          "relative flex flex-col items-center justify-center gap-4 p-10 rounded-2xl border-2 border-dashed transition-all cursor-pointer",
                          isDragging
                            ? "border-[var(--primary)] bg-[var(--primary)]/5"
                            : file
                              ? "border-emerald-500/50 bg-emerald-500/5"
                              : "border-[var(--card-border)] bg-[var(--foreground)]/[0.02] hover:border-[var(--foreground)]/20"
                        )}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.xlsx"
                          onChange={handleFileInput}
                          className="hidden"
                        />

                        {file ? (
                          <>
                            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                              <FileSpreadsheet className="w-7 h-7 text-emerald-500" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-semibold text-[var(--foreground)]">
                                {file.name}
                              </p>
                              <p className="text-xs text-[var(--muted)] mt-1">
                                {formatFileSize(file.size)} &middot; {rows.length} rows detected
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFile(null);
                                setHeaders([]);
                                setRows([]);
                                setColumnMapping({});
                              }}
                              className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                            >
                              Choose a different file
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="w-14 h-14 rounded-2xl bg-[var(--foreground)]/5 flex items-center justify-center">
                              <Upload className="w-7 h-7 text-[var(--muted)]" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm font-semibold text-[var(--foreground)]">
                                Drag and drop your file here
                              </p>
                              <p className="text-xs text-[var(--muted)] mt-1">
                                or click to browse. Supports .csv and .xlsx files
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                              }}
                              className="px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                            >
                              Choose File
                            </button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* ── Step 2: Column Mapping ────────────────── */}
                  {step === 2 && (
                    <motion.div
                      key="step-2"
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.2, ease: EASE_CHROME }}
                      className="px-6 py-6 space-y-5"
                    >
                      {/* Preview Table */}
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                          Data Preview (first 3 rows)
                        </h3>
                        <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-[var(--foreground)]/[0.03]">
                                {headers.map((h, i) => (
                                  <th
                                    key={i}
                                    className="px-3 py-2 text-left font-semibold text-[var(--foreground)] border-b border-[var(--card-border)] whitespace-nowrap"
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewRows.map((row, ri) => (
                                <tr key={ri} className="border-b border-[var(--card-border)] last:border-0">
                                  {headers.map((_, ci) => (
                                    <td
                                      key={ci}
                                      className="px-3 py-2 text-[var(--muted)] whitespace-nowrap max-w-[200px] truncate"
                                    >
                                      {row[ci] || "-"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Column Mapping */}
                      <div>
                        <h3 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
                          Column Mapping
                        </h3>
                        <div className="space-y-2">
                          {headers.map((header, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[var(--foreground)]/[0.02] border border-[var(--card-border)]"
                            >
                              <span className="text-sm font-medium text-[var(--foreground)] min-w-[140px] truncate">
                                {header}
                              </span>
                              <ChevronRight className="w-4 h-4 text-[var(--muted)] shrink-0" />
                              <select
                                value={columnMapping[index] || "__skip__"}
                                onChange={(e) => {
                                  setColumnMapping((prev) => ({
                                    ...prev,
                                    [index]: e.target.value as LeadFieldValue,
                                  }));
                                }}
                                className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow"
                              >
                                {LEAD_FIELDS.map((field) => (
                                  <option key={field.value} value={field.value}>
                                    {field.label}
                                  </option>
                                ))}
                              </select>
                              {columnMapping[index] && columnMapping[index] !== "__skip__" && (
                                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Step 3: Review ────────────────────────── */}
                  {step === 3 && (
                    <motion.div
                      key="step-3"
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.2, ease: EASE_CHROME }}
                      className="px-6 py-6 space-y-5"
                    >
                      {/* Summary */}
                      <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--card-border)]">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-[var(--foreground)]">
                            {validationResults.length}
                          </div>
                          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                            Total
                          </div>
                        </div>
                        <div className="w-px h-8 bg-[var(--card-border)]" />
                        <div className="text-center">
                          <div className="text-2xl font-bold text-emerald-500">{validCount}</div>
                          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                            Valid
                          </div>
                        </div>
                        {warningCount > 0 && (
                          <>
                            <div className="w-px h-8 bg-[var(--card-border)]" />
                            <div className="text-center">
                              <div className="text-2xl font-bold text-amber-500">{warningCount}</div>
                              <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                                Warnings
                              </div>
                            </div>
                          </>
                        )}
                        <div className="ml-auto">
                          <p className="text-sm font-semibold text-[var(--foreground)]">
                            {validationResults.length} leads ready to import
                          </p>
                        </div>
                      </div>

                      {/* Validation Warnings */}
                      {warningCount > 0 && (
                        <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                              {warningCount} lead{warningCount > 1 ? "s" : ""} with warnings
                            </span>
                          </div>
                          <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                            Leads with warnings will still be imported, but some fields may be empty.
                          </p>
                        </div>
                      )}

                      {/* Lead List */}
                      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                        {validationResults.map((result) => (
                          <div
                            key={result.index}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.01]"
                          >
                            {result.valid ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <span className="text-sm text-[var(--foreground)] font-medium truncate min-w-0">
                              {result.row.merchant_name || `Row ${result.index + 1}`}
                            </span>
                            {result.row.platform && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--foreground)]/5 text-[var(--muted)] shrink-0">
                                {result.row.platform}
                              </span>
                            )}
                            {!result.valid && (
                              <span className="ml-auto text-[10px] text-amber-500 shrink-0">
                                {result.warnings.join(", ")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* ── Step 4: Processing ────────────────────── */}
                  {step === 4 && (
                    <motion.div
                      key="step-4"
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.2, ease: EASE_CHROME }}
                      className="px-6 py-10 flex flex-col items-center justify-center gap-6"
                    >
                      {!importResult ? (
                        <>
                          {/* Progress */}
                          <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
                          </div>
                          <div className="text-center">
                            <h3 className="text-base font-bold text-[var(--foreground)] mb-1">
                              Importing leads...
                            </h3>
                            <p className="text-xs text-[var(--muted)]">
                              Please wait while we process your data
                            </p>
                          </div>
                          <div className="w-full max-w-sm">
                            <div className="h-2 rounded-full bg-[var(--foreground)]/10 overflow-hidden">
                              <motion.div
                                className="h-full rounded-full bg-[var(--primary)]"
                                initial={{ width: "0%" }}
                                animate={{ width: `${Math.min(importProgress, 100)}%` }}
                                transition={{ duration: 0.3, ease: "easeOut" }}
                              />
                            </div>
                            <p className="text-[10px] text-[var(--muted)] text-center mt-1.5">
                              {Math.round(importProgress)}%
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Result */}
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: [0, 1.15, 1] }}
                            transition={{ duration: 0.4, times: [0, 0.6, 1] }}
                            className={cn(
                              "w-16 h-16 rounded-2xl flex items-center justify-center",
                              importResult.errors === 0
                                ? "bg-emerald-500/10"
                                : importResult.success === 0
                                  ? "bg-red-500/10"
                                  : "bg-amber-500/10"
                            )}
                          >
                            {importResult.errors === 0 ? (
                              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                            ) : importResult.success === 0 ? (
                              <XCircle className="w-8 h-8 text-red-500" />
                            ) : (
                              <AlertTriangle className="w-8 h-8 text-amber-500" />
                            )}
                          </motion.div>
                          <div className="text-center">
                            <h3 className="text-base font-bold text-[var(--foreground)] mb-1">
                              Import Complete
                            </h3>
                            <div className="flex items-center gap-4 justify-center mt-2">
                              {importResult.success > 0 && (
                                <span className="flex items-center gap-1.5 text-sm text-emerald-500 font-semibold">
                                  <CheckCircle2 className="w-4 h-4" />
                                  {importResult.success} imported
                                </span>
                              )}
                              {importResult.errors > 0 && (
                                <span className="flex items-center gap-1.5 text-sm text-red-500 font-semibold">
                                  <XCircle className="w-4 h-4" />
                                  {importResult.errors} failed
                                </span>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ────────────────────────────────────── */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--card-border)]">
                <div>
                  {step > 1 && step < 4 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Back
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {step < 3 && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                    >
                      Cancel
                    </button>
                  )}

                  {step === 1 && (
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={!file || rows.length === 0}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all",
                        "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90",
                        "disabled:opacity-40 disabled:cursor-not-allowed"
                      )}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                  {step === 2 && (
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={
                        !Object.values(columnMapping).some((v) => v && v !== "__skip__")
                      }
                      className={cn(
                        "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all",
                        "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90",
                        "disabled:opacity-40 disabled:cursor-not-allowed"
                      )}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                  {step === 3 && (
                    <>
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          goNext();
                          // Start import after transition
                          setTimeout(() => handleImport(), 300);
                        }}
                        className={cn(
                          "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all",
                          "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90"
                        )}
                      >
                        <Upload className="w-4 h-4" />
                        Import
                      </button>
                    </>
                  )}

                  {step === 4 && importResult && (
                    <button
                      type="button"
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all",
                        "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90"
                      )}
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
