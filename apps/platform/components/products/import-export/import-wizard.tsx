"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  FileSpreadsheet,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  FileText,
  Trash2,
  ChevronDown,
  Merge,
  SkipForward,
  RefreshCw,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// =============================================
// TYPES
// =============================================

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (count: number) => void;
}

type Step = "upload" | "mapping" | "validation" | "conflicts" | "progress";

interface ParsedFile {
  name: string;
  size: number;
  headers: string[];
  rows: Record<string, string>[];
}

const PRODUCT_FIELDS = [
  { value: "name", label: "Name", required: true },
  { value: "sku", label: "SKU" },
  { value: "price", label: "Price" },
  { value: "cost", label: "Cost" },
  { value: "stock_quantity", label: "Stock Quantity" },
  { value: "category", label: "Category" },
  { value: "description", label: "Description" },
  { value: "short_description", label: "Short Description" },
  { value: "barcode", label: "Barcode" },
  { value: "weight", label: "Weight" },
  { value: "status", label: "Status" },
  { value: "product_type", label: "Product Type" },
  { value: "__skip__", label: "-- Skip --" },
] as const;

type FieldValue = (typeof PRODUCT_FIELDS)[number]["value"];

interface RowValidation {
  index: number;
  data: Record<string, string>;
  mapped: Record<string, string>;
  status: "valid" | "warning" | "error";
  messages: string[];
}

type ConflictStrategy = "skip" | "overwrite" | "merge";

interface ConflictRow {
  index: number;
  sku: string;
  existingName: string;
  incomingName: string;
  strategy: ConflictStrategy;
}

// =============================================
// AUTO-DETECT HELPERS
// =============================================

const AUTO_DETECT_MAP: Record<string, FieldValue> = {
  name: "name",
  product: "name",
  title: "name",
  sku: "sku",
  "product code": "sku",
  code: "sku",
  price: "price",
  "unit price": "price",
  "selling price": "price",
  cost: "cost",
  "cost price": "cost",
  stock: "stock_quantity",
  quantity: "stock_quantity",
  "stock quantity": "stock_quantity",
  qty: "stock_quantity",
  category: "category",
  description: "description",
  "short description": "short_description",
  barcode: "barcode",
  upc: "barcode",
  ean: "barcode",
  weight: "weight",
  status: "status",
  type: "product_type",
  "product type": "product_type",
};

function autoDetectField(header: string): FieldValue {
  const normalized = header.toLowerCase().trim();
  if (AUTO_DETECT_MAP[normalized]) return AUTO_DETECT_MAP[normalized];
  for (const [key, value] of Object.entries(AUTO_DETECT_MAP)) {
    if (normalized.includes(key)) return value;
  }
  return "__skip__";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// =============================================
// COMPONENT
// =============================================

export function ImportWizard({ isOpen, onClose, onComplete }: ImportWizardProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState<Step>("upload");
  const [direction, setDirection] = useState(1);

  // Upload state
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Mapping state
  const [columnMapping, setColumnMapping] = useState<Record<string, FieldValue>>({});

  // Validation state
  const [validatedRows, setValidatedRows] = useState<RowValidation[]>([]);
  const [skipErrors, setSkipErrors] = useState(true);

  // Conflict state
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [globalStrategy, setGlobalStrategy] = useState<ConflictStrategy>("skip");

  // Progress state
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
  } | null>(null);

  // ---- Navigation ----
  const goNext = useCallback(
    (nextStep: Step) => {
      setDirection(1);
      setStep(nextStep);
    },
    []
  );

  const goBack = useCallback(
    (prevStep: Step) => {
      setDirection(-1);
      setStep(prevStep);
    },
    []
  );

  const resetWizard = useCallback(() => {
    setStep("upload");
    setParsedFile(null);
    setColumnMapping({});
    setValidatedRows([]);
    setConflicts([]);
    setProgress(0);
    setProgressText("");
    setImportResult(null);
    setParseError(null);
    setIsDragging(false);
    setSkipErrors(true);
    setGlobalStrategy("skip");
  }, []);

  const handleClose = useCallback(() => {
    resetWizard();
    onClose();
  }, [resetWizard, onClose]);

  // ---- File parsing ----
  const parseFile = useCallback((file: File) => {
    setParseError(null);

    const allowedTypes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!allowedTypes.includes(file.type) && !["csv", "xlsx", "xls"].includes(ext || "")) {
      setParseError("Unsupported file type. Please upload a CSV or Excel file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
          defval: "",
          raw: false,
        });

        if (jsonData.length === 0) {
          setParseError("The file appears to be empty.");
          return;
        }

        const headers = Object.keys(jsonData[0]);
        const parsed: ParsedFile = {
          name: file.name,
          size: file.size,
          headers,
          rows: jsonData,
        };
        setParsedFile(parsed);

        // Auto-detect column mappings
        const mapping: Record<string, FieldValue> = {};
        const usedFields = new Set<string>();
        headers.forEach((header) => {
          const detected = autoDetectField(header);
          if (detected !== "__skip__" && !usedFields.has(detected)) {
            mapping[header] = detected;
            usedFields.add(detected);
          } else {
            mapping[header] = "__skip__";
          }
        });
        setColumnMapping(mapping);
      } catch {
        setParseError("Failed to parse the file. Please check the file format.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  // ---- Mapping ----
  const updateMapping = useCallback((header: string, field: FieldValue) => {
    setColumnMapping((prev) => ({ ...prev, [header]: field }));
  }, []);

  const isNameMapped = useMemo(
    () => Object.values(columnMapping).includes("name"),
    [columnMapping]
  );

  // ---- Validation ----
  const validateRows = useCallback(async () => {
    if (!parsedFile) return;

    // Build reverse mapping: field -> header
    const fieldToHeader: Record<string, string> = {};
    for (const [header, field] of Object.entries(columnMapping)) {
      if (field !== "__skip__") {
        fieldToHeader[field] = header;
      }
    }

    // Check for existing SKUs
    const skuHeader = fieldToHeader["sku"];
    let existingSkus = new Set<string>();
    if (skuHeader && tenantId) {
      const allSkus = parsedFile.rows
        .map((r) => r[skuHeader])
        .filter(Boolean);
      if (allSkus.length > 0) {
        const { data } = await supabase
          .from("products")
          .select("sku, name")
          .eq("tenant_id", tenantId)
          .in("sku", allSkus);
        if (data) {
          existingSkus = new Set(data.map((d) => d.sku));
        }
      }
    }

    const validated: RowValidation[] = parsedFile.rows.map((row, index) => {
      const mapped: Record<string, string> = {};
      for (const [field, header] of Object.entries(fieldToHeader)) {
        mapped[field] = row[header] || "";
      }

      const messages: string[] = [];
      let status: RowValidation["status"] = "valid";

      // Required: name
      if (!mapped.name?.trim()) {
        messages.push("Missing required field: name");
        status = "error";
      }

      // Validate price
      if (mapped.price && isNaN(Number(mapped.price))) {
        messages.push("Invalid price value");
        status = "error";
      }

      // Validate cost
      if (mapped.cost && isNaN(Number(mapped.cost))) {
        messages.push("Invalid cost value");
        status = "error";
      }

      // Validate stock
      if (mapped.stock_quantity && isNaN(Number(mapped.stock_quantity))) {
        messages.push("Invalid stock quantity");
        status = "error";
      }

      // Validate weight
      if (mapped.weight && isNaN(Number(mapped.weight))) {
        messages.push("Invalid weight value");
        status = "error";
      }

      // SKU conflict warning
      if (mapped.sku && existingSkus.has(mapped.sku) && status !== "error") {
        messages.push("SKU already exists -- will update");
        status = "warning";
      }

      return { index, data: row, mapped, status, messages };
    });

    setValidatedRows(validated);

    // Extract conflicts
    const conflictRows: ConflictRow[] = [];
    if (skuHeader) {
      const { data: existingProducts } = await supabase
        .from("products")
        .select("sku, name")
        .eq("tenant_id", tenantId!)
        .in(
          "sku",
          validated
            .filter((r) => r.status === "warning" && r.mapped.sku)
            .map((r) => r.mapped.sku)
        );
      const existingMap = new Map((existingProducts || []).map((p) => [p.sku, p.name]));

      validated.forEach((row) => {
        if (row.status === "warning" && row.mapped.sku && existingMap.has(row.mapped.sku)) {
          conflictRows.push({
            index: row.index,
            sku: row.mapped.sku,
            existingName: existingMap.get(row.mapped.sku) || "",
            incomingName: row.mapped.name || "",
            strategy: globalStrategy,
          });
        }
      });
    }
    setConflicts(conflictRows);
  }, [parsedFile, columnMapping, tenantId, globalStrategy]);

  // ---- Validation summary ----
  const validCount = validatedRows.filter((r) => r.status === "valid").length;
  const warningCount = validatedRows.filter((r) => r.status === "warning").length;
  const errorCount = validatedRows.filter((r) => r.status === "error").length;

  // ---- Import execution ----
  const executeImport = useCallback(async () => {
    if (!tenantId) return;

    const rowsToImport = validatedRows.filter((r) => {
      if (r.status === "error" && skipErrors) return false;
      return true;
    });

    const conflictMap = new Map(conflicts.map((c) => [c.sku, c.strategy]));
    const BATCH_SIZE = 50;
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const total = rowsToImport.length;

    setProgress(0);
    setProgressText(`Preparing import...`);

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = rowsToImport.slice(i, i + BATCH_SIZE);
      const toInsert: Record<string, unknown>[] = [];
      const toUpsert: Record<string, unknown>[] = [];

      for (const row of batch) {
        const product: Record<string, unknown> = {
          tenant_id: tenantId,
          name: row.mapped.name?.trim() || "Untitled",
          description: row.mapped.description || null,
          short_description: row.mapped.short_description || null,
          sku: row.mapped.sku || null,
          price: row.mapped.price ? Number(row.mapped.price) : 0,
          cost: row.mapped.cost ? Number(row.mapped.cost) : null,
          stock_quantity: row.mapped.stock_quantity
            ? Math.floor(Number(row.mapped.stock_quantity))
            : 0,
          barcode: row.mapped.barcode || null,
          weight: row.mapped.weight ? Number(row.mapped.weight) : null,
          status: ["draft", "active", "archived"].includes(row.mapped.status?.toLowerCase())
            ? row.mapped.status.toLowerCase()
            : "active",
          product_type: ["physical", "digital", "service", "bundle"].includes(
            row.mapped.product_type?.toLowerCase()
          )
            ? row.mapped.product_type.toLowerCase()
            : "physical",
        };

        const strategy = row.mapped.sku ? conflictMap.get(row.mapped.sku) : undefined;

        if (strategy === "skip") {
          skipped++;
          continue;
        }

        if (strategy === "overwrite" || strategy === "merge") {
          if (strategy === "merge") {
            // Fetch existing product and only fill empty fields
            const { data: existing } = await supabase
              .from("products")
              .select("*")
              .eq("tenant_id", tenantId)
              .eq("sku", row.mapped.sku)
              .single();

            if (existing) {
              for (const [key, val] of Object.entries(product)) {
                if (key === "tenant_id") continue;
                if (
                  val === null ||
                  val === undefined ||
                  val === "" ||
                  val === 0
                ) {
                  product[key] = existing[key as keyof typeof existing];
                }
              }
            }
          }
          toUpsert.push(product);
        } else {
          toInsert.push(product);
        }
      }

      // Insert new products
      if (toInsert.length > 0) {
        const { error } = await supabase.from("products").insert(toInsert);
        if (error) {
          console.error("Import insert error:", error);
          toast.error(`Import error: ${error.message}`);
        } else {
          imported += toInsert.length;
        }
      }

      // Upsert conflicting products
      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from("products")
          .upsert(toUpsert, { onConflict: "tenant_id,sku" });
        if (error) {
          console.error("Import upsert error:", error);
          toast.error(`Import error: ${error.message}`);
        } else {
          updated += toUpsert.length;
        }
      }

      const done = Math.min(i + BATCH_SIZE, total);
      setProgress(Math.round((done / total) * 100));
      setProgressText(
        `Importing ${done}/${total} products...`
      );
    }

    setImportResult({ imported, updated, skipped });
    setProgress(100);
    setProgressText("Import complete!");
    toast.success(
      `Imported ${imported} products. ${updated} updated. ${skipped} skipped.`
    );
  }, [tenantId, validatedRows, conflicts, skipErrors]);

  // ---- Step transition variants ----
  const stepVariants = {
    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-3xl max-h-[90vh] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--pastel-blue)] flex items-center justify-center">
                  <Upload className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("products.import.title") || "Import Products"}
                  </h2>
                  <p className="text-sm text-muted">
                    {t("products.import.subtitle") || "Import from CSV or Excel file"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
              >
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="px-6 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
              {(
                [
                  { key: "upload", label: "Upload" },
                  { key: "mapping", label: "Mapping" },
                  { key: "validation", label: "Validation" },
                  { key: "conflicts", label: "Conflicts" },
                  { key: "progress", label: "Import" },
                ] as { key: Step; label: string }[]
              ).map((s, i, arr) => {
                const stepIndex = arr.findIndex((a) => a.key === step);
                const isActive = s.key === step;
                const isDone = i < stepIndex;
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                        isActive
                          ? "bg-[var(--pastel-yellow)] text-yellow-800"
                          : isDone
                          ? "bg-green-100 text-green-700"
                          : "bg-[var(--background)] text-muted"
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium hidden sm:inline",
                        isActive ? "text-foreground" : "text-muted"
                      )}
                    >
                      {s.label}
                    </span>
                    {i < arr.length - 1 && (
                      <div className="w-6 h-px bg-[var(--card-border)]" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 min-h-[350px]">
              <AnimatePresence mode="wait" custom={direction}>
                {/* ========== STEP 1: UPLOAD ========== */}
                {step === "upload" && (
                  <motion.div
                    key="upload"
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                  >
                    {!parsedFile ? (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        className={cn(
                          "border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer",
                          isDragging
                            ? "border-[var(--pastel-yellow)] bg-yellow-50/30"
                            : "border-[var(--card-border)] hover:border-[var(--pastel-yellow)]"
                        )}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted" />
                        <p className="text-foreground font-medium mb-1">
                          {t("products.import.dropzone") ||
                            "Drag & drop your file here"}
                        </p>
                        <p className="text-sm text-muted mb-4">
                          or click to browse files
                        </p>
                        <p className="text-xs text-muted">
                          Supported: .csv, .xlsx, .xls
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="hidden"
                          onChange={handleFileSelect}
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)]">
                          <div className="w-12 h-12 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                            <FileText className="w-6 h-6 text-green-700" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-foreground">
                              {parsedFile.name}
                            </p>
                            <p className="text-sm text-muted">
                              {formatFileSize(parsedFile.size)} &middot;{" "}
                              {parsedFile.rows.length} rows &middot;{" "}
                              {parsedFile.headers.length} columns
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setParsedFile(null);
                              setColumnMapping({});
                              if (fileInputRef.current)
                                fileInputRef.current.value = "";
                            }}
                            className="p-2 rounded-xl hover:bg-red-50 text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Preview first 3 rows */}
                        <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-[var(--background)]">
                                {parsedFile.headers.slice(0, 6).map((h) => (
                                  <th
                                    key={h}
                                    className="px-3 py-2 text-left font-medium text-muted whitespace-nowrap"
                                  >
                                    {h}
                                  </th>
                                ))}
                                {parsedFile.headers.length > 6 && (
                                  <th className="px-3 py-2 text-muted">...</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {parsedFile.rows.slice(0, 3).map((row, i) => (
                                <tr
                                  key={i}
                                  className="border-t border-[var(--card-border)]"
                                >
                                  {parsedFile.headers.slice(0, 6).map((h) => (
                                    <td
                                      key={h}
                                      className="px-3 py-2 text-foreground whitespace-nowrap max-w-[150px] truncate"
                                    >
                                      {row[h]}
                                    </td>
                                  ))}
                                  {parsedFile.headers.length > 6 && (
                                    <td className="px-3 py-2 text-muted">
                                      ...
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {parseError && (
                      <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
                        <XCircle className="w-4 h-4 flex-shrink-0" />
                        {parseError}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ========== STEP 2: COLUMN MAPPING ========== */}
                {step === "mapping" && (
                  <motion.div
                    key="mapping"
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                  >
                    <p className="text-sm text-muted mb-4">
                      {t("products.import.mappingDesc") ||
                        "Map your file columns to product fields. Required fields are marked with *"}
                    </p>
                    <div className="space-y-3">
                      {parsedFile?.headers.map((header) => (
                        <div
                          key={header}
                          className="flex items-center gap-4 p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">
                              {header}
                            </p>
                            <p className="text-xs text-muted truncate">
                              e.g. &quot;{parsedFile.rows[0]?.[header] || "—"}&quot;
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted flex-shrink-0" />
                          <div className="relative flex-1">
                            <select
                              value={columnMapping[header] || "__skip__"}
                              onChange={(e) =>
                                updateMapping(
                                  header,
                                  e.target.value as FieldValue
                                )
                              }
                              className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] appearance-none pr-10 text-sm"
                            >
                              {PRODUCT_FIELDS.map((f) => (
                                <option key={f.value} value={f.value}>
                                  {f.value === "__skip__"
                                    ? f.label
                                    : `${f.label}${"required" in f && f.required ? " *" : ""}`}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      ))}
                    </div>

                    {!isNameMapped && (
                      <div className="mt-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        &quot;Name&quot; field must be mapped to proceed.
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ========== STEP 3: VALIDATION PREVIEW ========== */}
                {step === "validation" && (
                  <motion.div
                    key="validation"
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                  >
                    {/* Summary */}
                    <div className="flex items-center gap-4 mb-4 flex-wrap">
                      <div className="flex items-center gap-1.5 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span className="text-green-700 font-medium">
                          {validCount} valid
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <AlertTriangle className="w-4 h-4 text-yellow-600" />
                        <span className="text-yellow-700 font-medium">
                          {warningCount} warnings
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <XCircle className="w-4 h-4 text-red-500" />
                        <span className="text-red-600 font-medium">
                          {errorCount} errors
                        </span>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[var(--background)]">
                            <th className="px-3 py-2 text-left font-medium text-muted w-10">
                              #
                            </th>
                            <th className="px-3 py-2 text-left font-medium text-muted">
                              Status
                            </th>
                            {Object.entries(columnMapping)
                              .filter(([, f]) => f !== "__skip__")
                              .slice(0, 5)
                              .map(([, field]) => (
                                <th
                                  key={field}
                                  className="px-3 py-2 text-left font-medium text-muted whitespace-nowrap"
                                >
                                  {PRODUCT_FIELDS.find(
                                    (f) => f.value === field
                                  )?.label || field}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {validatedRows.slice(0, 20).map((row) => (
                            <tr
                              key={row.index}
                              className={cn(
                                "border-t border-[var(--card-border)]",
                                row.status === "error" && "bg-red-50/50",
                                row.status === "warning" && "bg-yellow-50/50"
                              )}
                            >
                              <td className="px-3 py-2 text-muted">
                                {row.index + 1}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  {row.status === "valid" && (
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  )}
                                  {row.status === "warning" && (
                                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                  )}
                                  {row.status === "error" && (
                                    <XCircle className="w-4 h-4 text-red-500" />
                                  )}
                                  {row.messages.length > 0 && (
                                    <span className="text-xs text-muted max-w-[150px] truncate">
                                      {row.messages[0]}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {Object.entries(columnMapping)
                                .filter(([, f]) => f !== "__skip__")
                                .slice(0, 5)
                                .map(([, field]) => (
                                  <td
                                    key={field}
                                    className="px-3 py-2 text-foreground whitespace-nowrap max-w-[120px] truncate"
                                  >
                                    {row.mapped[field] || "—"}
                                  </td>
                                ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {validatedRows.length > 20 && (
                      <p className="mt-2 text-xs text-muted text-center">
                        Showing first 20 of {validatedRows.length} rows
                      </p>
                    )}

                    {/* Skip errors option */}
                    {errorCount > 0 && (
                      <label className="mt-4 flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={skipErrors}
                          onChange={(e) => setSkipErrors(e.target.checked)}
                          className="w-4 h-4 rounded border-[var(--card-border)] accent-[var(--pastel-yellow)]"
                        />
                        <span className="text-sm text-foreground">
                          Skip rows with errors ({errorCount} rows)
                        </span>
                      </label>
                    )}
                  </motion.div>
                )}

                {/* ========== STEP 4: CONFLICT RESOLUTION ========== */}
                {step === "conflicts" && (
                  <motion.div
                    key="conflicts"
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                  >
                    <p className="text-sm text-muted mb-4">
                      {conflicts.length} product(s) have matching SKUs in your
                      store. Choose how to handle them.
                    </p>

                    {/* Global strategy */}
                    <div className="mb-4 p-4 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                      <p className="text-sm font-medium text-foreground mb-3">
                        Apply to all conflicts:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            {
                              value: "skip" as ConflictStrategy,
                              label: "Skip",
                              icon: SkipForward,
                              desc: "Don't import",
                            },
                            {
                              value: "overwrite" as ConflictStrategy,
                              label: "Overwrite",
                              icon: RefreshCw,
                              desc: "Replace existing",
                            },
                            {
                              value: "merge" as ConflictStrategy,
                              label: "Merge",
                              icon: Merge,
                              desc: "Update non-empty only",
                            },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setGlobalStrategy(opt.value);
                              setConflicts((prev) =>
                                prev.map((c) => ({
                                  ...c,
                                  strategy: opt.value,
                                }))
                              );
                            }}
                            className={cn(
                              "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors",
                              globalStrategy === opt.value
                                ? "bg-[var(--pastel-yellow)] border-yellow-300 text-yellow-800"
                                : "bg-[var(--background)] border-[var(--card-border)] text-foreground hover:bg-[var(--card-bg)]"
                            )}
                          >
                            <opt.icon className="w-4 h-4" />
                            <div className="text-left">
                              <p>{opt.label}</p>
                              <p className="text-xs opacity-70">{opt.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Per-row overrides */}
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                      {conflicts.map((conflict) => (
                        <div
                          key={conflict.sku}
                          className="flex items-center gap-3 p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              SKU: {conflict.sku}
                            </p>
                            <p className="text-xs text-muted truncate">
                              Existing: {conflict.existingName} &rarr; Incoming:{" "}
                              {conflict.incomingName}
                            </p>
                          </div>
                          <select
                            value={conflict.strategy}
                            onChange={(e) => {
                              const value = e.target.value as ConflictStrategy;
                              setConflicts((prev) =>
                                prev.map((c) =>
                                  c.sku === conflict.sku
                                    ? { ...c, strategy: value }
                                    : c
                                )
                              );
                            }}
                            className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                          >
                            <option value="skip">Skip</option>
                            <option value="overwrite">Overwrite</option>
                            <option value="merge">Merge</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* ========== STEP 5: PROGRESS ========== */}
                {step === "progress" && (
                  <motion.div
                    key="progress"
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25 }}
                    className="flex flex-col items-center justify-center py-8"
                  >
                    {!importResult ? (
                      <>
                        <Loader2 className="w-12 h-12 text-[var(--pastel-yellow)] animate-spin mb-6" />
                        <p className="text-foreground font-medium mb-4">
                          {progressText}
                        </p>
                        <div className="w-full max-w-md bg-[var(--background)] rounded-full h-3 overflow-hidden">
                          <motion.div
                            className="h-full bg-[var(--pastel-yellow)] rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>
                        <p className="text-sm text-muted mt-2">{progress}%</p>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                          <CheckCircle2 className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          {t("products.import.complete") || "Import Complete"}
                        </h3>
                        <div className="flex items-center gap-6 mt-2">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">
                              {importResult.imported}
                            </p>
                            <p className="text-xs text-muted">Imported</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">
                              {importResult.updated}
                            </p>
                            <p className="text-xs text-muted">Updated</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold text-gray-500">
                              {importResult.skipped}
                            </p>
                            <p className="text-xs text-muted">Skipped</p>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--card-border)] flex items-center justify-between">
              <div>
                {step === "mapping" && (
                  <button
                    onClick={() => goBack("upload")}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                )}
                {step === "validation" && (
                  <button
                    onClick={() => goBack("mapping")}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                )}
                {step === "conflicts" && (
                  <button
                    onClick={() => goBack("validation")}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                )}
              </div>

              <div>
                {step === "upload" && parsedFile && (
                  <button
                    onClick={() => goNext("mapping")}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[var(--pastel-yellow)] text-yellow-800 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                {step === "mapping" && (
                  <button
                    onClick={async () => {
                      await validateRows();
                      goNext("validation");
                    }}
                    disabled={!isNameMapped}
                    className={cn(
                      "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-opacity",
                      isNameMapped
                        ? "bg-[var(--pastel-yellow)] text-yellow-800 hover:opacity-90"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                {step === "validation" && (
                  <button
                    onClick={() => {
                      if (conflicts.length > 0) {
                        goNext("conflicts");
                      } else {
                        goNext("progress");
                        executeImport();
                      }
                    }}
                    disabled={
                      validCount === 0 && warningCount === 0
                    }
                    className={cn(
                      "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-opacity",
                      validCount + warningCount > 0
                        ? "bg-[var(--pastel-yellow)] text-yellow-800 hover:opacity-90"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    )}
                  >
                    {conflicts.length > 0 ? "Next" : "Import"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                {step === "conflicts" && (
                  <button
                    onClick={() => {
                      goNext("progress");
                      executeImport();
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[var(--pastel-yellow)] text-yellow-800 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Import
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                {step === "progress" && importResult && (
                  <button
                    onClick={() => {
                      onComplete(
                        importResult.imported + importResult.updated
                      );
                      handleClose();
                    }}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[var(--pastel-green)] text-green-800 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Done
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
