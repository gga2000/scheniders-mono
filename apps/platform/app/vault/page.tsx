"use client";

import { useState, useRef, useEffect } from "react";
import {
    Database,
    Download,
    UploadCloud,
    Lock,
    FileSpreadsheet,
    KeyRound,
    ShieldCheck,
    ShieldAlert,
    Eye,
    EyeOff,
    FileText,
    ChevronRight,
    Loader2,
    Cloud,
    CloudUpload,
    History,
    Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
    generateVaultBackup,
    parseVaultFile,
    calculateVaultDiff,
    VaultData,
    executeVaultRestore,
    uploadVaultToCloud,
    fetchCloudVaults,
    downloadCloudVault
} from "@/lib/vault-utils";

// Types mapping for Export Format
type ExportFormat = "vault" | "excel" | "csv";
// Derive UI types from the source functions so they stay in sync (no `any`).
type VaultDiff = Awaited<ReturnType<typeof calculateVaultDiff>>;
type CloudVault = Awaited<ReturnType<typeof fetchCloudVaults>>[number];

export default function VaultPage() {
    // Backup State
    const [exportFormat, setExportFormat] = useState<ExportFormat>("vault");
    const [vaultKey, setVaultKey] = useState("");
    const [showVaultKey, setShowVaultKey] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationStep, setGenerationStep] = useState("");

    // Vault Key Strength
    const calculateStrength = (pass: string) => {
        if (!pass) return -1;
        let score = 0;
        if (pass.length > 8) score += 1;
        if (/[A-Z]/.test(pass)) score += 1;
        if (/[0-9]/.test(pass)) score += 1;
        if (/[^A-Za-z0-9]/.test(pass)) score += 1;
        return score; // 0-4
    };
    const keyStrength = calculateStrength(vaultKey);
    // Security progression: weak → strong reads red → amber → emerald, theme-aware.
    const strengthColors = [
        "bg-red-500 dark:bg-red-400",
        "bg-orange-500 dark:bg-orange-400",
        "bg-amber-500 dark:bg-amber-400",
        "bg-emerald-500 dark:bg-emerald-400",
        "bg-emerald-600 dark:bg-emerald-300"
    ];
    const strengthTextColors = [
        "text-red-600 dark:text-red-400",
        "text-orange-600 dark:text-orange-400",
        "text-amber-600 dark:text-amber-400",
        "text-emerald-600 dark:text-emerald-400",
        "text-emerald-600 dark:text-emerald-300"
    ];
    const strengthLabels = ["Weak", "Fair", "Good", "Strong", "Very Strong"];

    // Restore State
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [restoreKey, setRestoreKey] = useState("");
    const [showRestoreKey, setShowRestoreKey] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [diffResult, setDiffResult] = useState<VaultDiff | null>(null);
    const [parsedVaultData, setParsedVaultData] = useState<VaultData | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cloud State
    const [cloudVaults, setCloudVaults] = useState<CloudVault[]>([]);
    const [isFetchingCloud, setIsFetchingCloud] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDownloadingCloud, setIsDownloadingCloud] = useState<string | null>(null);

    useEffect(() => {
        loadCloudVaults();
    }, []);

    const loadCloudVaults = async () => {
        setIsFetchingCloud(true);
        try {
            const vaults = await fetchCloudVaults();
            setCloudVaults(vaults);
        } catch {
            // Cloud vault loading failed silently
        } finally {
            setIsFetchingCloud(false);
        }
    };

    // Handlers: Create Backup & Sync
    const handleGenerateBackup = async () => {
        if (exportFormat === "vault" && !vaultKey) {
            toast.error("Vault Key is required for encrypted backups.");
            return;
        }

        setIsGenerating(true);
        setGenerationStep("Starting...");
        try {
            await generateVaultBackup(exportFormat, vaultKey, {
                includeOrders: true,
                includeProducts: true,
                includeCustomers: true
            }, (step) => setGenerationStep(step));
            toast.success(`Backup generated successfully in ${exportFormat.toUpperCase()} format.`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to generate backup.";
            toast.error(message);
        } finally {
            setIsGenerating(false);
            setGenerationStep("");
        }
    };

    const handleCloudSync = async () => {
        if (!vaultKey) {
            toast.error("Vault Key is required for Cloud Sync.");
            return;
        }

        setIsSyncing(true);
        setGenerationStep("Starting Cloud Sync...");
        try {
            await uploadVaultToCloud(vaultKey, {
                includeOrders: true,
                includeProducts: true,
                includeCustomers: true
            }, (step) => setGenerationStep(step));
            toast.success("Successfully synced backup to the secure cloud.");
            loadCloudVaults(); // Refresh timeline
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to sync to cloud.";
            toast.error(message);
        } finally {
            setIsSyncing(false);
            setGenerationStep("");
        }
    };

    // Handlers: Restore Dropzone & Cloud
    const handleCloudFileSelect = async (filename: string) => {
        setIsDownloadingCloud(filename);
        try {
            const blob = await downloadCloudVault(filename);
            const file = new File([blob], filename, { type: "application/octet-stream" });
            setRestoreFile(file);
            toast.success("Vault file downloaded from cloud. Please enter Vault Key to unlock.");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to download cloud vault.";
            toast.error(message);
        } finally {
            setIsDownloadingCloud(null);
        }
    };
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        handleFileSelect(file);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handleFileSelect = (file: File) => {
        if (!file.name.endsWith(".scheniders") && !file.name.endsWith(".json") && !file.name.endsWith(".xlsx")) {
            toast.error("Invalid file format. Please upload a .scheniders or .xlsx vault file.");
            return;
        }
        setRestoreFile(file);
    };

    const handleAnalyzeRestore = async () => {
        if (!restoreFile) return;
        const isExcel = restoreFile.name.endsWith(".xlsx");
        if (!isExcel && !restoreKey) {
            toast.error("Please enter the Vault Key to unlock this file.");
            return;
        }

        setIsAnalyzing(true);
        try {
            const parsedData = await parseVaultFile(restoreFile, isExcel ? undefined : restoreKey);
            const diff = await calculateVaultDiff(parsedData);
            setParsedVaultData(parsedData);
            setDiffResult(diff);
            toast.success(isExcel ? "Excel file analyzed successfully." : "File unlocked and analyzed successfully.");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : (isExcel ? "Failed to parse Excel file." : "Failed to unlock vault. Incorrect key or corrupted file.");
            toast.error(message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleExecuteRestore = async () => {
        if (!parsedVaultData) return;

        setIsRestoring(true);
        try {
            // Actual database UPSERT execution
            await executeVaultRestore(parsedVaultData, (step) => toast.loading(step, { id: "restore-progress" }));
            toast.dismiss("restore-progress");
            toast.success("Data successfully restored from vault.");
            clearRestore();
        } catch (error: unknown) {
            toast.dismiss("restore-progress");
            const message = error instanceof Error ? error.message : "Unknown error";
            toast.error("Restore failed: " + message);
        } finally {
            setIsRestoring(false);
        }
    };

    const clearRestore = () => {
        setRestoreFile(null);
        setRestoreKey("");
        setDiffResult(null);
        setParsedVaultData(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <div className="vault-page flex-1 flex flex-col h-full overflow-y-auto text-[var(--foreground)]">
            {/* Title bar — a plain div (not <header>) so it isn't caught by global header overrides */}
            <div className="flex-shrink-0 border-b border-[var(--card-border)] bg-[var(--background)]/70 backdrop-blur-xl sticky top-0 z-30">
                <div className="flex items-center px-6 md:px-8 h-[80px] max-w-[1600px] mx-auto w-full">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--vault-soft)] text-[var(--vault-accent)] border border-[var(--vault-border)] flex items-center justify-center shadow-[0_0_24px_var(--vault-glow)]">
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Data Vault</h1>
                            <div className="flex items-center gap-1.5 mt-1">
                                <ShieldCheck className="w-4 h-4 text-[var(--vault-accent)]" />
                                <span className="text-sm text-[var(--foreground-muted)]">Secure Backup &amp; Restore Center</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 p-6 md:p-8 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

                {/* CREATE BACKUP SECTION */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-[var(--card-bg)] rounded-3xl border border-[var(--card-border)] p-6 md:p-8 flex flex-col relative overflow-hidden group shadow-[var(--card-shadow)]"
                >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--vault-glow)] rounded-full blur-[80px] -z-10 opacity-70 group-hover:opacity-100 transition-opacity duration-700" />

                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                            <Download className="w-5 h-5 text-[var(--foreground-muted)]" />
                        </div>
                        <h2 className="text-xl font-semibold">Create Backup</h2>
                    </div>

                    <div className="space-y-6 flex-1">
                        {/* Format Selection & Options */}
                        <div className="space-y-4">
                            <label className="text-sm font-medium text-[var(--foreground-muted)]">Export Format</label>
                            <div className="grid grid-cols-3 gap-3">
                                <FormatCard
                                    active={exportFormat === "vault"}
                                    onClick={() => setExportFormat("vault")}
                                    icon={<Lock className={cn("w-5 h-5", exportFormat === "vault" ? "text-[var(--vault-accent)]" : "text-[var(--foreground-subtle)]")} />}
                                    label="Encrypted Vault"
                                    ext=".scheniders"
                                />
                                <FormatCard
                                    active={exportFormat === "excel"}
                                    onClick={() => setExportFormat("excel")}
                                    icon={<FileSpreadsheet className={cn("w-5 h-5", exportFormat === "excel" ? "text-green-600 dark:text-green-400" : "text-[var(--foreground-subtle)]")} />}
                                    label="Excel"
                                    ext=".xlsx"
                                />
                                <FormatCard
                                    active={exportFormat === "csv"}
                                    onClick={() => setExportFormat("csv")}
                                    icon={<FileText className={cn("w-5 h-5", exportFormat === "csv" ? "text-blue-600 dark:text-blue-400" : "text-[var(--foreground-subtle)]")} />}
                                    label="CSV Raw"
                                    ext=".csv"
                                />
                            </div>
                        </div>

                        {/* Vault Key Input (Conditional) */}
                        <AnimatePresence mode="wait">
                            {exportFormat === "vault" && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="pt-4"
                                >
                                    <label className="text-sm font-medium text-[var(--vault-accent)] flex items-center gap-2 mb-2">
                                        <KeyRound className="w-4 h-4" />
                                        Vault Key required for encryption
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showVaultKey ? "text" : "password"}
                                            value={vaultKey}
                                            onChange={(e) => setVaultKey(e.target.value)}
                                            placeholder="Enter a strong password to lock this backup"
                                            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--vault-ring)] focus:border-[var(--vault-accent)] transition-all"
                                        />
                                        <button
                                            onClick={() => setShowVaultKey(!showVaultKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors"
                                            aria-label={showVaultKey ? "Hide vault key" : "Show vault key"}
                                        >
                                            {showVaultKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {keyStrength >= 0 && (
                                        <div className="mt-3 space-y-1.5">
                                            <div className="flex gap-1 h-1.5">
                                                {[0, 1, 2, 3].map((level) => (
                                                    <div
                                                        key={level}
                                                        className={cn(
                                                            "flex-1 rounded-full transition-all duration-300",
                                                            keyStrength >= level ? strengthColors[keyStrength] : "bg-[var(--card-border)]"
                                                        )}
                                                    />
                                                ))}
                                            </div>
                                            <div className={cn("text-[10px] font-medium text-right", strengthTextColors[keyStrength])}>
                                                {strengthLabels[keyStrength]}
                                            </div>
                                        </div>
                                    )}
                                    <p className="text-xs text-[var(--foreground-subtle)] mt-2 ml-1">
                                        This key does not leave your browser. If you lose it, the backup cannot be restored.
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {exportFormat === "vault" && (
                            <button
                                onClick={handleCloudSync}
                                disabled={isSyncing || !vaultKey}
                                className={cn(
                                    "mt-4 w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300 relative overflow-hidden",
                                    "bg-[var(--vault-soft)] text-[var(--vault-accent)] border border-[var(--vault-border)] hover:border-[var(--vault-accent)] hover:shadow-[0_0_20px_var(--vault-glow)]",
                                    (isSyncing || !vaultKey) && "opacity-60 cursor-not-allowed hover:shadow-none"
                                )}
                            >
                                <AnimatePresence mode="wait">
                                    {isSyncing ? (
                                        <motion.div
                                            key="syncing"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="flex items-center gap-2"
                                        >
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Syncing to Cloud...
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="idle-sync"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex items-center gap-2"
                                        >
                                            <CloudUpload className="w-5 h-5" />
                                            Sync to Cloud
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </button>
                        )}
                    </div>

                    <button
                        onClick={handleGenerateBackup}
                        disabled={isGenerating || (exportFormat === "vault" && !vaultKey)}
                        className={cn(
                            "mt-8 w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 relative overflow-hidden",
                            "bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[var(--button-primary-hover)] hover:shadow-lg",
                            (isGenerating || (exportFormat === "vault" && !vaultKey)) && "opacity-60 cursor-not-allowed hover:shadow-none"
                        )}
                    >
                        <AnimatePresence mode="wait">
                            {isGenerating ? (
                                <motion.div
                                    key="generating"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex items-center gap-2"
                                >
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {generationStep || "Processing..."}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="idle"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-2"
                                >
                                    {exportFormat === "vault" ? <Lock className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                                    Export {exportFormat === "vault" ? "Encrypted Vault" : exportFormat.toUpperCase()}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </button>
                </motion.section>

                {/* RESTORE BACKUP SECTION */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
                    className="bg-[var(--card-bg)] rounded-3xl border border-[var(--card-border)] p-6 md:p-8 flex flex-col relative overflow-hidden shadow-[var(--card-shadow)]"
                >
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-[var(--vault-glow)] rounded-full blur-[80px] -z-10" />

                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                            <UploadCloud className="w-5 h-5 text-[var(--foreground-muted)]" />
                        </div>
                        <h2 className="text-xl font-semibold">Restore Backup</h2>
                    </div>

                    {!restoreFile ? (
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                                "flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-all cursor-pointer group min-h-[280px]",
                                isDragging
                                    ? "border-[var(--vault-accent)] bg-[var(--vault-soft)]"
                                    : "border-[var(--card-border)] hover:border-[var(--border-hover)] hover:bg-[var(--background)]"
                            )}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileInput}
                                accept=".scheniders,.json,.xlsx"
                                className="hidden"
                            />
                            <div className="w-16 h-16 rounded-full bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center mb-4 group-hover:scale-110 group-hover:border-[var(--vault-border)] transition-all duration-300">
                                <UploadCloud className="w-8 h-8 text-[var(--foreground-subtle)] group-hover:text-[var(--vault-accent)] transition-colors" />
                            </div>
                            <h3 className="font-medium mb-1">Upload Vault File</h3>
                            <p className="text-sm text-[var(--foreground-muted)] text-center max-w-[220px]">
                                Drag &amp; drop your .scheniders or .xlsx file here, or click to browse
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-2xl p-6 relative">
                                <button
                                    onClick={clearRestore}
                                    className="absolute top-4 right-4 text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 rounded-xl bg-[var(--vault-soft)] border border-[var(--vault-border)] flex items-center justify-center">
                                        <Lock className="w-6 h-6 text-[var(--vault-accent)]" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium truncate max-w-[200px]" title={restoreFile.name}>
                                            {restoreFile.name}
                                        </h3>
                                        <p className="text-xs text-[var(--foreground-muted)]">
                                            {(restoreFile.size / 1024 / 1024).toFixed(2)} MB • {restoreFile.name.endsWith(".xlsx") ? "Excel Backup" : "Encrypted Vault"}
                                        </p>
                                    </div>
                                </div>

                                {!diffResult ? (
                                    <div className="space-y-4">
                                        {!restoreFile.name.endsWith(".xlsx") && (
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-[var(--vault-accent)] flex items-center gap-2">
                                                    <KeyRound className="w-4 h-4" />
                                                    Enter Vault Key to Unlock
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type={showRestoreKey ? "text" : "password"}
                                                        value={restoreKey}
                                                        onChange={(e) => setRestoreKey(e.target.value)}
                                                        placeholder="Enter password..."
                                                        className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--vault-ring)] focus:border-[var(--vault-accent)] transition-all"
                                                    />
                                                    <button
                                                        onClick={() => setShowRestoreKey(!showRestoreKey)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors"
                                                        aria-label={showRestoreKey ? "Hide vault key" : "Show vault key"}
                                                    >
                                                        {showRestoreKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        {restoreFile.name.endsWith(".xlsx") && (
                                            <div className="bg-[var(--vault-soft)] border border-[var(--vault-border)] p-4 rounded-xl">
                                                <p className="text-sm text-[var(--foreground-muted)]">
                                                    Excel backup ready for analysis. No password required.
                                                </p>
                                            </div>
                                        )}
                                        <button
                                            onClick={handleAnalyzeRestore}
                                            disabled={!restoreFile || (!restoreFile.name.endsWith(".xlsx") && !restoreKey) || isAnalyzing}
                                            className={cn(
                                                "w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300",
                                                restoreFile && (restoreFile.name.endsWith(".xlsx") || restoreKey)
                                                    ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[var(--button-primary-hover)] shadow-lg"
                                                    : "bg-[var(--card-border)] text-[var(--foreground-subtle)] cursor-not-allowed",
                                                isAnalyzing && "opacity-70 cursor-not-allowed"
                                            )}
                                        >
                                            {isAnalyzing ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    {restoreFile.name.endsWith(".xlsx") ? "Analyzing Excel..." : "Decrypting & Analyzing..."}
                                                </>
                                            ) : (
                                                <>
                                                    {restoreFile.name.endsWith(".xlsx") ? "Analyze Excel Data" : "Unlock & Preview Restore"} <ChevronRight className="w-5 h-5" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ) : (
                                    /* Diff Preview State */
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="space-y-4"
                                    >
                                        <div className="bg-[var(--vault-soft)] border border-[var(--vault-border)] p-4 rounded-xl space-y-3">
                                            <div className="flex items-center gap-2 text-[var(--vault-accent)] text-sm font-medium mb-1">
                                                <ShieldCheck className="w-4 h-4" />
                                                {restoreFile?.name.endsWith(".xlsx") ? "Excel Successfully Parsed" : "Vault Unlocked Successfully"}
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                                <div className="bg-[var(--card-bg)] rounded-lg p-2 border border-[var(--card-border)]">
                                                    <div className="font-semibold">{diffResult.ordersToRestore}</div>
                                                    <div className="text-[var(--foreground-subtle)] text-[10px] uppercase tracking-wide">Orders</div>
                                                </div>
                                                <div className="bg-[var(--card-bg)] rounded-lg p-2 border border-[var(--card-border)]">
                                                    <div className="font-semibold">{diffResult.productsToRestore}</div>
                                                    <div className="text-[var(--foreground-subtle)] text-[10px] uppercase tracking-wide">Products</div>
                                                </div>
                                                <div className="bg-[var(--card-bg)] rounded-lg p-2 border border-[var(--card-border)]">
                                                    <div className="font-semibold">{diffResult.customersToRestore}</div>
                                                    <div className="text-[var(--foreground-subtle)] text-[10px] uppercase tracking-wide">Customers</div>
                                                </div>
                                            </div>
                                            <div className="text-xs text-[var(--foreground-muted)] mt-2">
                                                Backup created on: <span className="text-[var(--foreground)] font-medium">{new Date(diffResult.timestamp).toLocaleString()}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleExecuteRestore}
                                            disabled={isRestoring}
                                            className={cn(
                                                "w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300",
                                                "bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-400 shadow-[0_0_24px_rgba(239,68,68,0.22)]",
                                                isRestoring && "opacity-70 cursor-not-allowed"
                                            )}
                                        >
                                            {isRestoring ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Restoring Database...
                                                </>
                                            ) : (
                                                <>
                                                    <ShieldAlert className="w-5 h-5" />
                                                    Confirm & Execute Restore
                                                </>
                                            )}
                                        </button>
                                        <p className="text-[10px] text-center text-red-600/80 dark:text-red-400/80 uppercase tracking-wide">
                                            Warning: This will overwrite live data
                                        </p>
                                    </motion.div>
                                )}
                            </div>
                        </div>
                    )}
                </motion.section>

                {/* CLOUD TIMELINE SECTION */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.16 }}
                    className="bg-[var(--card-bg)] rounded-3xl border border-[var(--card-border)] p-6 md:p-8 flex flex-col relative overflow-hidden shadow-[var(--card-shadow)] lg:col-span-1"
                >
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-[var(--vault-soft)] border border-[var(--vault-border)] flex items-center justify-center">
                            <History className="w-5 h-5 text-[var(--vault-accent)]" />
                        </div>
                        <h2 className="text-xl font-semibold">Cloud Time Machine</h2>
                    </div>

                    <p className="text-sm text-[var(--foreground-muted)] mb-6">
                        Restore from secure, zero-knowledge snapshots saved in your cloud bucket.
                    </p>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-[200px] scrollbar-thin scrollbar-thumb-[var(--card-border)] scrollbar-track-transparent">
                        {isFetchingCloud ? (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="w-6 h-6 animate-spin text-[var(--vault-accent)]" />
                            </div>
                        ) : cloudVaults.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-12 h-12 rounded-full bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center mb-3">
                                    <Cloud className="w-6 h-6 text-[var(--foreground-subtle)]" />
                                </div>
                                <p className="text-sm text-[var(--foreground-muted)]">No cloud backups found.</p>
                                <p className="text-xs text-[var(--foreground-subtle)] mt-1 max-w-[200px]">Sync an encrypted vault to start your timeline.</p>
                            </div>
                        ) : (
                            cloudVaults.map((vault) => (
                                <div key={vault.name} className="bg-[var(--background)] border border-[var(--card-border)] p-4 rounded-xl flex items-center justify-between group hover:border-[var(--vault-border)] transition-all">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <Cloud className="w-8 h-8 text-[var(--foreground-subtle)] group-hover:text-[var(--vault-accent)] flex-shrink-0 transition-colors" />
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-medium truncate">{vault.created_at ? new Date(vault.created_at).toLocaleString() : vault.name}</p>
                                            <p className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wide">{((vault.metadata?.size ?? 0) / 1024 / 1024).toFixed(2)} MB • Sync</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleCloudFileSelect(vault.name)}
                                        disabled={isDownloadingCloud === vault.name}
                                        className="w-9 h-9 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center hover:bg-[var(--vault-accent)] hover:text-[var(--vault-accent-contrast)] hover:border-transparent text-[var(--foreground-muted)] transition-colors flex-shrink-0 disabled:opacity-50"
                                        aria-label="Download cloud backup"
                                    >
                                        {isDownloadingCloud === vault.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </motion.section>

            </main>
        </div>
    );
}

// Sub-component for Format Cards
function FormatCard({
    active,
    onClick,
    icon,
    label,
    ext
}: {
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    ext: string
}) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-200 relative",
                active
                    ? "bg-[var(--card-bg)] border-[var(--vault-border)] shadow-[var(--card-shadow)] ring-1 ring-[var(--vault-border)]"
                    : "bg-[var(--background)] border-[var(--card-border)] hover:border-[var(--border-hover)]"
            )}
        >
            {active && (
                <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[var(--vault-accent)] text-[var(--vault-accent-contrast)] flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
            )}
            {icon}
            <div className="text-center mt-1">
                <div className={cn("text-sm font-medium", active ? "text-[var(--foreground)]" : "text-[var(--foreground-muted)]")}>{label}</div>
                <div className="text-[10px] text-[var(--foreground-subtle)] mt-0.5 uppercase tracking-wide">{ext}</div>
            </div>
        </button>
    );
}
