"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  FileDown,
  CheckSquare,
  Square,
  Save,
  FolderOpen,
  Trash2,
  Loader2,
  ChevronDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";
import { toast } from "sonner";

// =============================================
// TYPES
// =============================================

interface ExportBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  productIds?: string[];
  totalCount: number;
}

type ExportFormat = "csv" | "xlsx" | "pdf";

interface ExportColumn {
  key: string;
  label: string;
  checked: boolean;
}

interface ExportTemplate {
  name: string;
  columns: string[];
  format: ExportFormat;
  includeVariants: boolean;
  includeInventoryHistory: boolean;
}

const STORAGE_KEY = "product-export-templates";

const ALL_COLUMNS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "sku", label: "SKU" },
  { key: "price", label: "Price" },
  { key: "cost", label: "Cost" },
  { key: "stock_quantity", label: "Stock" },
  { key: "category", label: "Category" },
  { key: "status", label: "Status" },
  { key: "description", label: "Description" },
  { key: "barcode", label: "Barcode" },
  { key: "weight", label: "Weight" },
  { key: "product_type", label: "Product Type" },
  { key: "created_at", label: "Created Date" },
  { key: "updated_at", label: "Updated Date" },
  { key: "slug", label: "Slug" },
  { key: "short_description", label: "Short Description" },
];

// =============================================
// COMPONENT
// =============================================

export function ExportBuilder({
  isOpen,
  onClose,
  productIds,
  totalCount,
}: ExportBuilderProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();

  // Column selection
  const [columns, setColumns] = useState<ExportColumn[]>(
    ALL_COLUMNS.map((c) => ({
      ...c,
      checked: ["name", "sku", "price", "cost", "stock_quantity", "status"].includes(c.key),
    }))
  );

  // Format & scope
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [scope, setScope] = useState<"selected" | "all">(
    productIds && productIds.length > 0 ? "selected" : "all"
  );

  // Include options
  const [includeVariants, setIncludeVariants] = useState(false);
  const [includeInventoryHistory, setIncludeInventoryHistory] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Load templates from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTemplates(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  const selectedColumns = useMemo(
    () => columns.filter((c) => c.checked),
    [columns]
  );

  const toggleColumn = useCallback((key: string) => {
    setColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, checked: !c.checked } : c))
    );
  }, []);

  const toggleAll = useCallback(() => {
    const allChecked = columns.every((c) => c.checked);
    setColumns((prev) => prev.map((c) => ({ ...c, checked: !allChecked })));
  }, [columns]);

  // ---- Templates ----
  const saveTemplate = useCallback(() => {
    if (!templateName.trim()) return;
    const newTemplate: ExportTemplate = {
      name: templateName.trim(),
      columns: selectedColumns.map((c) => c.key),
      format,
      includeVariants,
      includeInventoryHistory,
    };
    const updated = [...templates.filter((t) => t.name !== newTemplate.name), newTemplate];
    setTemplates(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setTemplateName("");
    setShowSaveTemplate(false);
    toast.success(`Template "${newTemplate.name}" saved`);
  }, [templateName, selectedColumns, format, includeVariants, includeInventoryHistory, templates]);

  const loadTemplate = useCallback(
    (template: ExportTemplate) => {
      setColumns((prev) =>
        prev.map((c) => ({
          ...c,
          checked: template.columns.includes(c.key),
        }))
      );
      setFormat(template.format);
      setIncludeVariants(template.includeVariants);
      setIncludeInventoryHistory(template.includeInventoryHistory);
      toast.success(`Template "${template.name}" loaded`);
    },
    []
  );

  const deleteTemplate = useCallback(
    (name: string) => {
      const updated = templates.filter((t) => t.name !== name);
      setTemplates(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      toast.success("Template deleted");
    },
    [templates]
  );

  // ---- Data fetching ----
  const fetchProducts = useCallback(async () => {
    if (!tenantId) return [];

    // TODO: implement variant and history export when data model supports it
    let query = supabase
      .from("products")
      .select("*, categories:category_id(name)")
      .eq("tenant_id", tenantId);

    if (scope === "selected" && productIds && productIds.length > 0) {
      query = query.in("id", productIds);
    }

    const { data, error } = await query;
    if (error) {
      toast.error(`Failed to fetch products: ${error.message}`);
      return [];
    }
    return data || [];
  }, [tenantId, scope, productIds]);

  // ---- Export handlers ----
  const mapRow = useCallback(
    (product: Record<string, unknown>) => {
      const row: Record<string, unknown> = {};
      for (const col of selectedColumns) {
        if (col.key === "category") {
          const cat = product.categories as { name?: string } | null;
          row[col.label] = cat?.name || "";
        } else if (col.key === "created_at" || col.key === "updated_at") {
          const val = product[col.key] as string | null;
          row[col.label] = val
            ? new Date(val).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "";
        } else if (col.key === "price" || col.key === "cost") {
          row[col.label] = product[col.key] ?? "";
        } else {
          row[col.label] = product[col.key] ?? "";
        }
      }
      return row;
    },
    [selectedColumns]
  );

  const exportCSV = useCallback(
    (rows: Record<string, unknown>[]) => {
      if (rows.length === 0) return;
      const headers = selectedColumns.map((c) => c.label);
      const csvLines = [headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(",")];

      for (const row of rows) {
        const line = headers
          .map((h) => {
            const val = String(row[h] ?? "").replace(/"/g, '""');
            return `"${val}"`;
          })
          .join(",");
        csvLines.push(line);
      }

      const blob = new Blob(["\uFEFF" + csvLines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      downloadBlob(blob, "products-export.csv");
    },
    [selectedColumns]
  );

  const exportExcel = useCallback(
    (rows: Record<string, unknown>[]) => {
      if (rows.length === 0) return;
      const ws = XLSX.utils.json_to_sheet(rows);

      // Style header row width
      const colWidths = selectedColumns.map((c) => ({
        wch: Math.max(c.label.length + 4, 15),
      }));
      ws["!cols"] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");
      const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadBlob(blob, "products-export.xlsx");
    },
    [selectedColumns]
  );

  const exportPDF = useCallback(
    async (rows: Record<string, unknown>[]) => {
      if (rows.length === 0) return;

      try {
        const jsPDFModule = await import("jspdf");
        const jsPDF = jsPDFModule.default;
        const { default: autoTable } = await import("jspdf-autotable");

        const doc = new jsPDF({ orientation: rows[0] && Object.keys(rows[0]).length > 6 ? "landscape" : "portrait" });
        const headers = selectedColumns.map((c) => c.label);

        doc.setFontSize(16);
        doc.text("Products Export", 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
        doc.text(`Total: ${rows.length} products`, 14, 34);

        autoTable(doc, {
          startY: 40,
          head: [headers],
          body: rows.map((row) => headers.map((h) => String(row[h] ?? ""))),
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: {
            fillColor: [255, 243, 176],
            textColor: [120, 90, 0],
            fontStyle: "bold",
          },
          alternateRowStyles: { fillColor: [250, 250, 250] },
          margin: { left: 14, right: 14 },
        });

        doc.save("products-export.pdf");
      } catch {
        toast.error("PDF export requires jspdf and jspdf-autotable packages.");
      }
    },
    [selectedColumns]
  );

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = useCallback(async () => {
    if (selectedColumns.length === 0) {
      toast.error("Please select at least one column");
      return;
    }

    setIsExporting(true);
    setExportProgress(10);

    try {
      const products = await fetchProducts();
      setExportProgress(50);

      if (products.length === 0) {
        toast.error("No products found to export");
        setIsExporting(false);
        return;
      }

      const rows = products.map(mapRow);
      setExportProgress(75);

      switch (format) {
        case "csv":
          exportCSV(rows);
          break;
        case "xlsx":
          exportExcel(rows);
          break;
        case "pdf":
          await exportPDF(rows);
          break;
      }

      setExportProgress(100);
      toast.success(
        `Exported ${products.length} products as ${format.toUpperCase()}`
      );

      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        onClose();
      }, 600);
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Export failed. Please try again.");
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [selectedColumns, fetchProducts, mapRow, format, exportCSV, exportExcel, exportPDF, onClose]);

  if (!isOpen) return null;

  const exportCount =
    scope === "selected" && productIds ? productIds.length : totalCount;

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
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-2xl max-h-[90vh] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center">
                  <Download className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("products.export.title") || "Export Products"}
                  </h2>
                  <p className="text-sm text-muted">
                    {t("products.export.subtitle") ||
                      `${exportCount} products available`}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
              >
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Scope selection */}
              {productIds && productIds.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Scope
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScope("selected")}
                      className={cn(
                        "flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left",
                        scope === "selected"
                          ? "bg-[var(--pastel-yellow)] border-yellow-300 text-yellow-800"
                          : "bg-[var(--background)] border-[var(--card-border)] text-foreground hover:bg-[var(--card-bg)]"
                      )}
                    >
                      Selected products ({productIds.length})
                    </button>
                    <button
                      onClick={() => setScope("all")}
                      className={cn(
                        "flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors text-left",
                        scope === "all"
                          ? "bg-[var(--pastel-yellow)] border-yellow-300 text-yellow-800"
                          : "bg-[var(--background)] border-[var(--card-border)] text-foreground hover:bg-[var(--card-bg)]"
                      )}
                    >
                      All filtered products ({totalCount})
                    </button>
                  </div>
                </div>
              )}

              {/* Format selection */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Format
                </label>
                <div className="flex gap-2">
                  {(
                    [
                      { value: "csv" as ExportFormat, label: "CSV", icon: FileText },
                      { value: "xlsx" as ExportFormat, label: "Excel (.xlsx)", icon: FileSpreadsheet },
                      { value: "pdf" as ExportFormat, label: "PDF Report", icon: FileDown },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setFormat(f.value)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors",
                        format === f.value
                          ? "bg-[var(--pastel-yellow)] border-yellow-300 text-yellow-800"
                          : "bg-[var(--background)] border-[var(--card-border)] text-foreground hover:bg-[var(--card-bg)]"
                      )}
                    >
                      <f.icon className="w-4 h-4" />
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Column selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">
                    Columns ({selectedColumns.length}/{columns.length})
                  </label>
                  <button
                    onClick={toggleAll}
                    className="text-xs text-muted hover:text-foreground transition-colors"
                  >
                    {columns.every((c) => c.checked)
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {columns.map((col) => (
                    <button
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors text-left",
                        col.checked
                          ? "bg-[var(--pastel-blue)]/30 border-blue-200 text-foreground"
                          : "bg-[var(--background)] border-[var(--card-border)] text-muted hover:text-foreground"
                      )}
                    >
                      {col.checked ? (
                        <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 flex-shrink-0" />
                      )}
                      {col.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Include options */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Include
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <input
                      type="checkbox"
                      checked={includeVariants}
                      onChange={(e) => setIncludeVariants(e.target.checked)}
                      className="w-4 h-4 rounded border-[var(--card-border)] accent-[var(--pastel-yellow)]"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Include variants
                      </p>
                      <p className="text-xs text-muted">
                        Export variant rows under each product
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[var(--background)] border border-[var(--card-border)]">
                    <input
                      type="checkbox"
                      checked={includeInventoryHistory}
                      onChange={(e) =>
                        setIncludeInventoryHistory(e.target.checked)
                      }
                      className="w-4 h-4 rounded border-[var(--card-border)] accent-[var(--pastel-yellow)]"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Include inventory history
                      </p>
                      <p className="text-xs text-muted">
                        Add stock change log columns
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Templates */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">
                    Templates
                  </label>
                  <button
                    onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                    className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save as template
                  </button>
                </div>

                {/* Save template input */}
                <AnimatePresence>
                  {showSaveTemplate && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mb-2"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder="Template name..."
                          className="flex-1 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveTemplate();
                          }}
                        />
                        <button
                          onClick={saveTemplate}
                          disabled={!templateName.trim()}
                          className={cn(
                            "px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                            templateName.trim()
                              ? "bg-[var(--pastel-yellow)] text-yellow-800"
                              : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          )}
                        >
                          Save
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Template list */}
                {templates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {templates.map((tmpl) => (
                      <div
                        key={tmpl.name}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--background)] border border-[var(--card-border)] text-sm group"
                      >
                        <button
                          onClick={() => loadTemplate(tmpl)}
                          className="flex items-center gap-1.5 text-foreground hover:text-blue-600 transition-colors"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          {tmpl.name}
                        </button>
                        <button
                          onClick={() => deleteTemplate(tmpl.name)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-red-400 hover:text-red-600 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {templates.length === 0 && !showSaveTemplate && (
                  <p className="text-xs text-muted">
                    No saved templates. Save your column selection for quick
                    access.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--card-border)] flex items-center justify-between">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
              >
                Cancel
              </button>

              <div className="flex items-center gap-3">
                {isExporting && (
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-[var(--background)] rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="h-full bg-[var(--pastel-green)] rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${exportProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <span className="text-xs text-muted">{exportProgress}%</span>
                  </div>
                )}
                <button
                  onClick={handleExport}
                  disabled={isExporting || selectedColumns.length === 0}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all",
                    isExporting || selectedColumns.length === 0
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-[var(--pastel-green)] text-green-800 hover:opacity-90"
                  )}
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {isExporting
                    ? "Exporting..."
                    : `Export ${exportCount} products`}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
