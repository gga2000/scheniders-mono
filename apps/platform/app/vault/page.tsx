"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
    CloudUpload
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { CloudTimeline } from "@/components/vault/cloud-timeline";
import { FormatCard } from "@/components/vault/format-card";
import { BackupHealth } from "@/components/vault/backup-health";
import { isVaultKeyLongEnough } from "@/lib/vault-paths";
import { describeVaultError, describeVaultProgress } from "@/lib/vault-messages";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
    generateVaultBackup,
    parseVaultFile,
    calculateVaultDiff,
    VaultData,
    executeVaultRestore,
    uploadVaultToCloud,
    fetchCloudVaults,
    downloadCloudVault,
    deleteCloudVault,
    fetchVaultActivity,
    type VaultActivityEntry
} from "@/lib/vault-utils";

// Types mapping for Export Format
type ExportFormat = "vault" | "excel" | "csv";
// Derive UI types from the source functions so they stay in sync (no `any`).
type VaultDiff = Awaited<ReturnType<typeof calculateVaultDiff>>;
type CloudVault = Awaited<ReturnType<typeof fetchCloudVaults>>[number];

export default function VaultPage() {
    const { t } = useLanguage();
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
    // A typo in an encryption key makes the backup unrecoverable, so the key is typed twice.
    const [confirmKey, setConfirmKey] = useState("");
    const keyReady = isVaultKeyLongEnough(vaultKey) && vaultKey === confirmKey;
    const keyMismatch = confirmKey !== "" && vaultKey !== confirmKey;
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
    const strengthLabels = [0, 1, 2, 3, 4].map((level) => t(`vault.strength.${level}`));

    // Restore State
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [restoreKey, setRestoreKey] = useState("");
    const [showRestoreKey, setShowRestoreKey] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [diffResult, setDiffResult] = useState<VaultDiff | null>(null);
    const [parsedVaultData, setParsedVaultData] = useState<VaultData | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);
    // Restore overwrites live rows: the red button stays off until the person says they understand.
    const [restoreAcknowledged, setRestoreAcknowledged] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cloud State
    const [cloudVaults, setCloudVaults] = useState<CloudVault[]>([]);
    const [isFetchingCloud, setIsFetchingCloud] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDownloadingCloud, setIsDownloadingCloud] = useState<string | null>(null);
    const [isDeletingCloud, setIsDeletingCloud] = useState<string | null>(null);
    const [activity, setActivity] = useState<VaultActivityEntry[]>([]);
    const [isLoadingActivity, setIsLoadingActivity] = useState(true);
    const [activityFailed, setActivityFailed] = useState(false);

    const loadActivity = useCallback(async () => {
        try {
            setActivity(await fetchVaultActivity());
            setActivityFailed(false);
        } catch {
            setActivityFailed(true);
        } finally {
            setIsLoadingActivity(false);
        }
    }, []);

    const handleCloudDelete = async (filename: string) => {
        setIsDeletingCloud(filename);
        try {
            await deleteCloudVault(filename);
            toast.success(t("vault.toast.deleted", "Cloud backup deleted."));
            await Promise.all([loadCloudVaults(), loadActivity()]);
        } catch (error: unknown) {
            toast.error(describeVaultError(error, t, t("vault.error.delete", "Could not delete this backup.")));
        } finally {
            setIsDeletingCloud(null);
        }
    };

    const loadCloudVaults = useCallback(async () => {
        setIsFetchingCloud(true);
        try {
            const vaults = await fetchCloudVaults();
            setCloudVaults(vaults);
        } catch (error: unknown) {
            toast.error(describeVaultError(error, t, t("vault.error.loadCloud", "Could not load cloud backups.")));
        } finally {
            setIsFetchingCloud(false);
        }
    }, [t]);

    useEffect(() => {
        loadCloudVaults();
        loadActivity();
    }, [loadCloudVaults, loadActivity]);

    const keyToastMessage = () => {
        if (!vaultKey) return t("vault.toast.keyRequired", "Vault Key is required for encrypted backups.");
        if (!isVaultKeyLongEnough(vaultKey)) return t("vault.error.weakKey", "The vault key must be at least 10 characters.");
        return t("vault.key.mismatch", "The two keys do not match.");
    };

    // Handlers: Create Backup & Sync
    const handleGenerateBackup = async () => {
        if (exportFormat === "vault" && !keyReady) {
            toast.error(keyToastMessage());
            return;
        }

        setIsGenerating(true);
        setGenerationStep("Starting...");
        try {
            await generateVaultBackup(exportFormat, vaultKey, {
                includeOrders: true,
                includeProducts: true,
                includeCustomers: true
            }, (step) => setGenerationStep(describeVaultProgress(step, t)));
            toast.success(t("vault.toast.backupDone", "Backup generated successfully in {format} format.", { format: exportFormat.toUpperCase() }));
        } catch (error: unknown) {
            const message = describeVaultError(error, t, t("vault.error.backup", "Failed to generate backup."));
            toast.error(message);
        } finally {
            setIsGenerating(false);
            setGenerationStep("");
        }
    };

    const handleCloudSync = async () => {
        if (!keyReady) {
            toast.error(keyToastMessage());
            return;
        }

        setIsSyncing(true);
        setGenerationStep("Starting Cloud Sync...");
        try {
            await uploadVaultToCloud(vaultKey, {
                includeOrders: true,
                includeProducts: true,
                includeCustomers: true
            }, (step) => setGenerationStep(describeVaultProgress(step, t)));
            toast.success(t("vault.toast.synced", "Successfully synced backup to the secure cloud."));
            loadCloudVaults(); // Refresh timeline
            loadActivity();
        } catch (error: unknown) {
            const message = describeVaultError(error, t, t("vault.error.sync", "Failed to sync to cloud."));
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
            toast.success(t("vault.toast.downloaded", "Vault file downloaded from cloud. Please enter Vault Key to unlock."));
        } catch (error: unknown) {
            const message = describeVaultError(error, t, t("vault.error.download", "Failed to download cloud vault."));
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
            toast.error(t("vault.toast.badFormat", "Invalid file format. Please upload a .scheniders or .xlsx vault file."));
            return;
        }
        setRestoreFile(file);
    };

    const handleAnalyzeRestore = async () => {
        if (!restoreFile) return;
        const isExcel = restoreFile.name.endsWith(".xlsx");
        if (!isExcel && !restoreKey) {
            toast.error(t("vault.toast.enterKey", "Please enter the Vault Key to unlock this file."));
            return;
        }

        setIsAnalyzing(true);
        try {
            const parsedData = await parseVaultFile(restoreFile, isExcel ? undefined : restoreKey);
            const diff = await calculateVaultDiff(parsedData);
            setParsedVaultData(parsedData);
            setDiffResult(diff);
            toast.success(isExcel ? t("vault.toast.analyzedExcel", "Excel file analyzed successfully.") : t("vault.toast.unlocked", "File unlocked and analyzed successfully."));
        } catch (error: unknown) {
            const message = describeVaultError(error, t, isExcel ? t("vault.error.parseExcel", "Failed to parse Excel file.") : t("vault.error.wrongKey", "Failed to unlock the vault. Wrong key or damaged file."));
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
            await executeVaultRestore(parsedVaultData, (step) => toast.loading(describeVaultProgress(step, t), { id: "restore-progress" }));
            toast.dismiss("restore-progress");
            toast.success(t("vault.toast.restored", "Data successfully restored from vault."));
            clearRestore();
        } catch (error: unknown) {
            toast.dismiss("restore-progress");
            const message = describeVaultError(error, t, t("vault.error.unknown", "Unknown error"));
            toast.error(t("vault.toast.restoreFailed", "Restore failed: {message}", { message }));
        } finally {
            setIsRestoring(false);
        }
    };

    const clearRestore = () => {
        setRestoreFile(null);
        setRestoreKey("");
        setDiffResult(null);
        setParsedVaultData(null);
        setRestoreAcknowledged(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <div className="vault-page flex-1 flex flex-col h-full overflow-y-auto text-[var(--foreground)]">
            {/* Title bar — a plain div (not <header>) so it isn't caught by global header overrides */}
            <div className="flex-shrink-0 border-b border-[var(--card-border)] bg-[var(--background)]/70 backdrop-blur-xl sticky top-0 z-30">
                <div className="flex items-center px-6 md:px-8 h-[80px] max-w-[1600px] mx-auto w-full">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-[var(--vault-soft)] text-[var(--vault-accent)] border border-[var(--vault-border)] flex items-center justify-center">
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{t("nav.vault", "Data Vault")}</h1>
                            <div className="flex items-center gap-1.5 mt-1">
                                <ShieldCheck className="w-4 h-4 text-[var(--vault-accent)]" />
                                <span className="text-sm text-[var(--foreground-muted)]">{t("vault.subtitle", "Secure Backup & Restore Center")}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 p-6 md:p-8 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

                {/* First thing to see: is my data protected? */}
                <div className="lg:col-span-3">
                    <BackupHealth activity={activity} isLoading={isLoadingActivity} failed={activityFailed} />
                </div>

                {/* CREATE BACKUP SECTION */}
                <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-[var(--card-bg)] rounded-3xl border border-[var(--card-border)] p-6 md:p-8 flex flex-col relative overflow-hidden group shadow-[var(--card-shadow)]"
                >
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                            <Download className="w-5 h-5 text-[var(--foreground-muted)]" />
                        </div>
                        <h2 className="text-xl font-semibold">{t("vault.create.title", "Create Backup")}</h2>
                    </div>

                    <div className="space-y-6 flex-1">
                        {/* Format Selection & Options */}
                        <div className="space-y-4">
                            <label className="text-sm font-medium text-[var(--foreground-muted)]">{t("vault.format.label", "Export Format")}</label>
                            <div className="grid grid-cols-3 gap-3">
                                <FormatCard
                                    active={exportFormat === "vault"}
                                    onClick={() => setExportFormat("vault")}
                                    icon={<Lock className={cn("w-5 h-5", exportFormat === "vault" ? "text-[var(--vault-accent)]" : "text-[var(--foreground-subtle)]")} />}
                                    label={t("vault.format.vault", "Encrypted Vault")}
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
                                    label={t("vault.format.csv", "CSV Raw")}
                                    ext=".csv"
                                />
                            </div>
                            {exportFormat !== "vault" && (
                                <p className="text-sm rounded-xl border border-amber-500/40 bg-amber-500/10 text-[var(--foreground)] px-4 py-3 flex gap-2">
                                    <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                                    <span>{t("vault.format.plainWarning", "This file is not encrypted. It holds customer names, phone numbers and addresses: keep it somewhere private.")}</span>
                                </p>
                            )}
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
                                        {t("vault.key.required", "Vault Key required for encryption")}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showVaultKey ? "text" : "password"}
                                            value={vaultKey}
                                            onChange={(e) => setVaultKey(e.target.value)}
                                            placeholder={t("vault.key.placeholder", "Enter a strong password to lock this backup")}
                                            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--vault-ring)] focus:border-[var(--vault-accent)] transition-all"
                                        />
                                        <button
                                            onClick={() => setShowVaultKey(!showVaultKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors"
                                            aria-label={showVaultKey ? t("vault.key.hide", "Hide vault key") : t("vault.key.show", "Show vault key")}
                                        >
                                            {showVaultKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {vaultKey && !isVaultKeyLongEnough(vaultKey) && (
                                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{t("vault.key.minLength", "At least 10 characters.")}</p>
                                    )}
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
                                            <div className={cn("text-xs font-medium text-right", strengthTextColors[keyStrength])}>
                                                {strengthLabels[keyStrength]}
                                            </div>
                                        </div>
                                    )}
                                    <label className="text-sm font-medium text-[var(--foreground-muted)] block mt-4 mb-2" htmlFor="vault-key-confirm">
                                        {t("vault.key.confirmLabel", "Type the key again")}
                                    </label>
                                    <input
                                        id="vault-key-confirm"
                                        type={showVaultKey ? "text" : "password"}
                                        value={confirmKey}
                                        onChange={(e) => setConfirmKey(e.target.value)}
                                        aria-invalid={keyMismatch}
                                        className={cn(
                                            "w-full bg-[var(--background)] border rounded-xl px-4 py-3 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--vault-ring)] transition-all",
                                            keyMismatch ? "border-red-500" : "border-[var(--card-border)] focus:border-[var(--vault-accent)]"
                                        )}
                                    />
                                    {keyMismatch && (
                                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{t("vault.key.mismatch", "The two keys do not match.")}</p>
                                    )}
                                    <p className="text-sm mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-[var(--foreground)] px-4 py-3 flex gap-2">
                                        <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                                        <span>{t("vault.key.warning", "This key does not leave your browser. If you lose it, the backup cannot be restored.")}</span>
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {exportFormat === "vault" && (
                            <button
                                onClick={handleCloudSync}
                                disabled={isSyncing || !keyReady}
                                className={cn(
                                    "mt-4 w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300 relative overflow-hidden",
                                    "bg-[var(--vault-soft)] text-[var(--vault-accent)] border border-[var(--vault-border)] hover:border-[var(--vault-accent)]",
                                    (isSyncing || !keyReady) && "opacity-60 cursor-not-allowed hover:shadow-none"
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
                                            {t("vault.sync.busy", "Syncing to Cloud...")}
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
                                            {t("vault.sync.idle", "Sync to Cloud")}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </button>
                        )}
                    </div>

                    <button
                        onClick={handleGenerateBackup}
                        disabled={isGenerating || (exportFormat === "vault" && !keyReady)}
                        className={cn(
                            "mt-8 w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 relative overflow-hidden",
                            "bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[var(--button-primary-hover)] hover:shadow-lg",
                            (isGenerating || (exportFormat === "vault" && !keyReady)) && "opacity-60 cursor-not-allowed hover:shadow-none"
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
                                    {generationStep || t("vault.processing", "Processing...")}
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
                                    {exportFormat === "vault" ? t("vault.export.vault", "Export Encrypted Vault") : t("vault.export.other", "Export {format}", { format: exportFormat.toUpperCase() })}
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

                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-[var(--background)] border border-[var(--card-border)] flex items-center justify-center">
                            <UploadCloud className="w-5 h-5 text-[var(--foreground-muted)]" />
                        </div>
                        <h2 className="text-xl font-semibold">{t("vault.restore.title", "Restore Backup")}</h2>
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
                            <h3 className="font-medium mb-1">{t("vault.restore.upload", "Upload Vault File")}</h3>
                            <p className="text-sm text-[var(--foreground-muted)] text-center max-w-[220px]">
                                {t("vault.restore.drop", "Drag & drop your .scheniders or .xlsx file here, or click to browse")}
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-2xl p-6 relative">
                                <button
                                    onClick={clearRestore}
                                    className="absolute top-4 right-4 text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors text-sm"
                                >
                                    {t("vault.cancel", "Cancel")}
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
                                                    {t("vault.restore.enterKey", "Enter Vault Key to Unlock")}
                                                </label>
                                                <div className="relative">
                                                    <input
                                                        type={showRestoreKey ? "text" : "password"}
                                                        value={restoreKey}
                                                        onChange={(e) => setRestoreKey(e.target.value)}
                                                        placeholder={t("vault.restore.passwordPlaceholder", "Enter password...")}
                                                        className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--foreground-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--vault-ring)] focus:border-[var(--vault-accent)] transition-all"
                                                    />
                                                    <button
                                                        onClick={() => setShowRestoreKey(!showRestoreKey)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--foreground-subtle)] hover:text-[var(--foreground)] transition-colors"
                                                        aria-label={showRestoreKey ? t("vault.key.hide", "Hide vault key") : t("vault.key.show", "Show vault key")}
                                                    >
                                                        {showRestoreKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        {restoreFile.name.endsWith(".xlsx") && (
                                            <div className="bg-[var(--vault-soft)] border border-[var(--vault-border)] p-4 rounded-xl">
                                                <p className="text-sm text-[var(--foreground-muted)]">
                                                    {t("vault.restore.excelReady", "Excel backup ready for analysis. No password required.")}
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
                                                    {restoreFile.name.endsWith(".xlsx") ? t("vault.restore.analyzingExcel", "Analyzing Excel...") : t("vault.restore.decrypting", "Decrypting & Analyzing...")}
                                                </>
                                            ) : (
                                                <>
                                                    {restoreFile.name.endsWith(".xlsx") ? t("vault.restore.analyzeExcel", "Analyze Excel Data") : t("vault.restore.unlock", "Unlock & Preview Restore")} <ChevronRight className="w-5 h-5" />
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
                                                {restoreFile?.name.endsWith(".xlsx") ? t("vault.restore.parsed", "Excel Successfully Parsed") : t("vault.restore.unlocked", "Vault Unlocked Successfully")}
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                                <div className="bg-[var(--card-bg)] rounded-lg p-2 border border-[var(--card-border)]">
                                                    <div className="font-semibold">{diffResult.orders.total}</div>
                                                    <div className="text-[var(--foreground-subtle)] text-xs">{t("vault.restore.counts", "{create} new · {overwrite} overwritten", { create: diffResult.orders.create, overwrite: diffResult.orders.overwrite })}</div>
                                                    <div className="text-[var(--foreground-subtle)] text-xs uppercase tracking-wide">{t("nav.orders", "Orders")}</div>
                                                </div>
                                                <div className="bg-[var(--card-bg)] rounded-lg p-2 border border-[var(--card-border)]">
                                                    <div className="font-semibold">{diffResult.products.total}</div>
                                                    <div className="text-[var(--foreground-subtle)] text-xs">{t("vault.restore.counts", "{create} new · {overwrite} overwritten", { create: diffResult.products.create, overwrite: diffResult.products.overwrite })}</div>
                                                    <div className="text-[var(--foreground-subtle)] text-xs uppercase tracking-wide">{t("nav.products", "Products")}</div>
                                                </div>
                                                <div className="bg-[var(--card-bg)] rounded-lg p-2 border border-[var(--card-border)]">
                                                    <div className="font-semibold">{diffResult.customers.total}</div>
                                                    <div className="text-[var(--foreground-subtle)] text-xs">{t("vault.restore.counts", "{create} new · {overwrite} overwritten", { create: diffResult.customers.create, overwrite: diffResult.customers.overwrite })}</div>
                                                    <div className="text-[var(--foreground-subtle)] text-xs uppercase tracking-wide">{t("nav.customers", "Customers")}</div>
                                                </div>
                                            </div>
                                            {Object.values(diffResult.extras).some((count) => count > 0) && (
                                                <div className="text-xs text-[var(--foreground-muted)] mb-2">
                                                    {t("vault.restore.extras", "Also in this file: {categories} categories, {tags} tags, {assignments} tag assignments, {notes} notes, {expenses} expenses.", {
                                                        categories: diffResult.extras.categories,
                                                        tags: diffResult.extras.customer_tags,
                                                        assignments: diffResult.extras.customer_tag_assignments,
                                                        notes: diffResult.extras.customer_notes,
                                                        expenses: diffResult.extras.expenses,
                                                    })}
                                                </div>
                                            )}
                                            <div className="text-xs text-[var(--foreground-muted)]">
                                                {t("vault.restore.stockNote", "Stock counts and costs of products that already exist are kept as they are now.")}
                                            </div>
                                            <div className="text-xs text-[var(--foreground-muted)] mt-2">
                                                {t("vault.restore.createdOn", "Backup created on:")} <span className="text-[var(--foreground)] font-medium">{new Date(diffResult.timestamp).toLocaleString()}</span>
                                            </div>
                                        </div>

                                        <label className="flex items-start gap-3 text-sm rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={restoreAcknowledged}
                                                onChange={(e) => setRestoreAcknowledged(e.target.checked)}
                                                className="mt-0.5 h-4 w-4 accent-red-600"
                                            />
                                            <span>
                                                {t("vault.restore.acknowledge", "I understand this overwrites {count} existing rows in my live store.", {
                                                    count: diffResult.orders.overwrite + diffResult.products.overwrite + diffResult.customers.overwrite,
                                                })}
                                            </span>
                                        </label>

                                        <button
                                            onClick={handleExecuteRestore}
                                            disabled={isRestoring || !restoreAcknowledged}
                                            className={cn(
                                                "w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300",
                                                "bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-400 ",
                                                (isRestoring || !restoreAcknowledged) && "opacity-60 cursor-not-allowed"
                                            )}
                                        >
                                            {isRestoring ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    {t("vault.restore.busy", "Restoring Database...")}
                                                </>
                                            ) : (
                                                <>
                                                    <ShieldAlert className="w-5 h-5" />
                                                    {t("vault.restore.confirm", "Confirm & Execute Restore")}
                                                </>
                                            )}
                                        </button>
                                        <p className="text-xs text-center text-red-600 dark:text-red-400">
                                            {t("vault.restore.warning", "Warning: This will overwrite live data")}
                                        </p>
                                    </motion.div>
                                )}
                            </div>
                        </div>
                    )}
                </motion.section>

                <CloudTimeline
                    vaults={cloudVaults}
                    isLoading={isFetchingCloud}
                    downloading={isDownloadingCloud}
                    onSelect={handleCloudFileSelect}
                    deleting={isDeletingCloud}
                    onDelete={handleCloudDelete}
                />

            </main>
        </div>
    );
}
