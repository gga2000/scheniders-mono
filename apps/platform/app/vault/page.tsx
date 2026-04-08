"use client";

import { useState, useRef, useEffect } from "react";
import {
    Database,
    Download,
    UploadCloud,
    Lock,
    FileJson,
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
    History
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
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
    const strengthColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-teal-500", "bg-teal-400"];
    const strengthTextColors = ["text-red-500", "text-orange-500", "text-yellow-500", "text-teal-500", "text-teal-400"];
    const strengthLabels = ["Weak", "Fair", "Good", "Strong", "Very Strong"];

    // Restore State
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [restoreKey, setRestoreKey] = useState("");
    const [showRestoreKey, setShowRestoreKey] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [diffResult, setDiffResult] = useState<any>(null);
    const [parsedVaultData, setParsedVaultData] = useState<VaultData | null>(null);
    const [isRestoring, setIsRestoring] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cloud State
    const [cloudVaults, setCloudVaults] = useState<any[]>([]);
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
        if (!file.name.endsWith(".scheniders") && !file.name.endsWith(".json")) {
            toast.error("Invalid file format. Please upload a .scheniders vault file.");
            return;
        }
        setRestoreFile(file);
    };

    const handleAnalyzeRestore = async () => {
        if (!restoreFile) return;
        if (!restoreKey) {
            toast.error("Please enter the Vault Key to unlock this file.");
            return;
        }

        setIsAnalyzing(true);
        try {
            const parsedData = await parseVaultFile(restoreFile, restoreKey);
            const diff = await calculateVaultDiff(parsedData);
            setParsedVaultData(parsedData);
            setDiffResult(diff);
            toast.success("File unlocked and analyzed successfully.");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to unlock vault. Incorrect key or corrupted file.";
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
        <div className="flex-1 flex flex-col h-full bg-[#121212] overflow-y-auto">
            {/* Header */}
            <header className="flex-shrink-0 border-b border-white/5 bg-[#1E1E1E]/80 backdrop-blur-xl sticky top-0 z-30">
                <div className="flex items-center px-8 h-[80px]">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center shadow-[0_0_20px_rgba(45,212,191,0.2)]">
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">Data Vault</h1>
                            <div className="flex items-center gap-2 mt-1">
                                <ShieldCheck className="w-4 h-4 text-teal-400" />
                                <span className="text-sm text-zinc-400">Secure Backup & Restore Center</span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-8 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* CREATE BACKUP SECTION */}
                <section className="bg-[#1E1E1E] rounded-[32px] border border-white/5 p-8 flex flex-col relative overflow-hidden group shadow-xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full blur-[80px] -z-10 group-hover:bg-teal-500/10 transition-colors duration-700" />

                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                            <Download className="w-5 h-5 text-zinc-300" />
                        </div>
                        <h2 className="text-xl font-semibold text-white">Create Backup</h2>
                    </div>

                    <div className="space-y-6 flex-1">
                        {/* Format Selection & Options */}
                        <div className="space-y-4">
                            <label className="text-sm font-medium text-zinc-400">Export Format</label>
                            <div className="grid grid-cols-3 gap-3">
                                <FormatCard
                                    active={exportFormat === "vault"}
                                    onClick={() => setExportFormat("vault")}
                                    icon={<Lock className={cn("w-5 h-5", exportFormat === "vault" ? "text-teal-400" : "text-zinc-500")} />}
                                    label="Encrypted Vault"
                                    ext=".scheniders"
                                />
                                <FormatCard
                                    active={exportFormat === "excel"}
                                    onClick={() => setExportFormat("excel")}
                                    icon={<FileSpreadsheet className={cn("w-5 h-5", exportFormat === "excel" ? "text-green-400" : "text-zinc-500")} />}
                                    label="Excel"
                                    ext=".xlsx"
                                />
                                <FormatCard
                                    active={exportFormat === "csv"}
                                    onClick={() => setExportFormat("csv")}
                                    icon={<FileText className={cn("w-5 h-5", exportFormat === "csv" ? "text-blue-400" : "text-zinc-500")} />}
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
                                    <label className="text-sm font-medium text-teal-400 flex items-center gap-2 mb-2">
                                        <KeyRound className="w-4 h-4" />
                                        Vault Key required for encryption
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showVaultKey ? "text" : "password"}
                                            value={vaultKey}
                                            onChange={(e) => setVaultKey(e.target.value)}
                                            placeholder="Enter a strong password to lock this backup"
                                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                                        />
                                        <button
                                            onClick={() => setShowVaultKey(!showVaultKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
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
                                                            keyStrength >= level ? strengthColors[keyStrength] : "bg-white/10"
                                                        )}
                                                    />
                                                ))}
                                            </div>
                                            <div className={cn("text-[10px] font-medium text-right", strengthTextColors[keyStrength])}>
                                                {strengthLabels[keyStrength]}
                                            </div>
                                        </div>
                                    )}
                                    <p className="text-xs text-zinc-500 mt-2 ml-1">
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
                                    "mt-4 w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-lg relative overflow-hidden",
                                    "bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20",
                                    (isSyncing || !vaultKey) && "opacity-70 cursor-not-allowed"
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
                            "mt-8 w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300 hover:shadow-lg relative overflow-hidden",
                            exportFormat === "vault"
                                ? "bg-teal-500 hover:bg-teal-400 text-teal-950 shadow-teal-500/20"
                                : "bg-white text-black hover:bg-zinc-200",
                            (isGenerating || (exportFormat === "vault" && !vaultKey)) && "opacity-70 cursor-not-allowed"
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
                </section>

                {/* RESTORE BACKUP SECTION */}
                <section className="bg-[#1E1E1E] rounded-[32px] border border-white/5 p-8 flex flex-col relative overflow-hidden shadow-xl">
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-[80px] -z-10 transition-colors duration-700" />

                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                            <UploadCloud className="w-5 h-5 text-zinc-300" />
                        </div>
                        <h2 className="text-xl font-semibold text-white">Restore Backup</h2>
                    </div>

                    {!restoreFile ? (
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                                "flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-all cursor-pointer group",
                                isDragging
                                    ? "border-teal-500 bg-teal-500/5"
                                    : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]"
                            )}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileInput}
                                accept=".scheniders,.json"
                                className="hidden"
                            />
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                <UploadCloud className="w-8 h-8 text-zinc-400 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-white font-medium mb-1">Upload Vault File</h3>
                            <p className="text-sm text-zinc-500 text-center max-w-[200px]">
                                Drag & drop your .scheniders file here, or click to browse
                            </p>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="bg-black/20 border border-white/10 rounded-2xl p-6 relative">
                                <button
                                    onClick={clearRestore}
                                    className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors text-sm"
                                >
                                    Cancel
                                </button>
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center">
                                        <Lock className="w-6 h-6 text-teal-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-medium truncate max-w-[200px]" title={restoreFile.name}>
                                            {restoreFile.name}
                                        </h3>
                                        <p className="text-xs text-zinc-500">
                                            {(restoreFile.size / 1024 / 1024).toFixed(2)} MB • Encrypted Vault
                                        </p>
                                    </div>
                                </div>

                                {!diffResult ? (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-teal-400 flex items-center gap-2">
                                                <KeyRound className="w-4 h-4" />
                                                Enter Vault Key to Unlock
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type={showRestoreKey ? "text" : "password"}
                                                    value={restoreKey}
                                                    onChange={(e) => setRestoreKey(e.target.value)}
                                                    placeholder="Enter password..."
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
                                                />
                                                <button
                                                    onClick={() => setShowRestoreKey(!showRestoreKey)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                                                >
                                                    {showRestoreKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleAnalyzeRestore}
                                            disabled={!restoreFile || !restoreKey || isAnalyzing}
                                            className={cn(
                                                "w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300",
                                                restoreFile && restoreKey
                                                    ? "bg-white text-black hover:bg-zinc-200 shadow-lg"
                                                    : "bg-white/5 text-zinc-500 cursor-not-allowed",
                                                isAnalyzing && "opacity-70 cursor-not-allowed"
                                            )}
                                        >
                                            {isAnalyzing ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Decrypting & Analyzing...
                                                </>
                                            ) : (
                                                <>
                                                    Unlock & Preview Restore <ChevronRight className="w-5 h-5" />
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
                                        <div className="bg-white/5 border border-white/10 p-4 rounded-xl space-y-3">
                                            <div className="flex items-center gap-2 text-teal-400 text-sm font-medium mb-1">
                                                <ShieldCheck className="w-4 h-4" />
                                                Vault Unlocked Successfully
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                                <div className="bg-black/30 rounded-lg p-2 border border-white/5">
                                                    <div className="text-white font-semibold">{diffResult.ordersToRestore}</div>
                                                    <div className="text-zinc-500 text-[10px] uppercase">Orders</div>
                                                </div>
                                                <div className="bg-black/30 rounded-lg p-2 border border-white/5">
                                                    <div className="text-white font-semibold">{diffResult.productsToRestore}</div>
                                                    <div className="text-zinc-500 text-[10px] uppercase">Products</div>
                                                </div>
                                                <div className="bg-black/30 rounded-lg p-2 border border-white/5">
                                                    <div className="text-white font-semibold">{diffResult.customersToRestore}</div>
                                                    <div className="text-zinc-500 text-[10px] uppercase">Customers</div>
                                                </div>
                                            </div>
                                            <div className="text-xs text-zinc-400 mt-2">
                                                Backup created on: <span className="text-white">{new Date(diffResult.timestamp).toLocaleString()}</span>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleExecuteRestore}
                                            disabled={isRestoring}
                                            className={cn(
                                                "w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-300",
                                                "bg-red-500 hover:bg-red-400 text-white shadow-[0_0_20px_rgba(239,68,68,0.2)]",
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
                                        <p className="text-[10px] text-center text-red-400/80 uppercase tracking-wide">
                                            Warning: This will overwrite live data
                                        </p>
                                    </motion.div>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                {/* CLOUD TIMELINE SECTION */}
                <section className="bg-[#1E1E1E] rounded-[32px] border border-white/5 p-8 flex flex-col relative overflow-hidden shadow-xl lg:col-span-1">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                            <History className="w-5 h-5 text-teal-400" />
                        </div>
                        <h2 className="text-xl font-semibold text-white">Cloud Time Machine</h2>
                    </div>

                    <p className="text-sm text-zinc-400 mb-6">
                        Restore from secure, zero-knowledge snapshots saved in your cloud bucket.
                    </p>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {isFetchingCloud ? (
                            <div className="flex justify-center items-center py-10">
                                <Loader2 className="w-6 h-6 animate-spin text-teal-500/50" />
                            </div>
                        ) : cloudVaults.length === 0 ? (
                            <div className="text-center py-10 text-sm text-zinc-500">
                                No cloud backups found.
                            </div>
                        ) : (
                            cloudVaults.map((vault) => (
                                <div key={vault.name} className="bg-black/20 border border-white/5 p-4 rounded-xl flex items-center justify-between group hover:border-teal-500/30 hover:bg-black/40 transition-all">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <Cloud className="w-8 h-8 text-zinc-600 group-hover:text-teal-500/50 flex-shrink-0 transition-colors" />
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-medium text-white truncate">{new Date(vault.created_at).toLocaleString()}</p>
                                            <p className="text-[10px] text-zinc-500 uppercase">{(vault.metadata?.size / 1024 / 1024).toFixed(2)} MB • Sync</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleCloudFileSelect(vault.name)}
                                        disabled={isDownloadingCloud === vault.name}
                                        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-teal-500 hover:text-white text-zinc-400 transition-colors flex-shrink-0 disabled:opacity-50"
                                    >
                                        {isDownloadingCloud === vault.name ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </section>

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
            className={cn(
                "flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all duration-200",
                active
                    ? "bg-white/10 border-white/20 shadow-inner"
                    : "bg-black/20 border-white/5 hover:bg-white/[0.03] hover:border-white/10"
            )}
        >
            {icon}
            <div className="text-center mt-1">
                <div className={cn("text-sm font-medium", active ? "text-white" : "text-zinc-400")}>{label}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5 uppercase">{ext}</div>
            </div>
        </button>
    );
}
