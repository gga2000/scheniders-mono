"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Cloud,
    CloudOff,
    RefreshCw,
    Check,
    X,
    AlertCircle,
    Download,
    Loader2,
    Key,
    Calendar,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectionStatus {
    connected: boolean;
    storeName?: string;
    error?: string;
}

interface SyncResult {
    lightfunnelsId: string;
    orderName: string;
    status: "imported" | "duplicate" | "error";
    message?: string;
}

interface SyncSummary {
    total: number;
    imported: number;
    duplicates: number;
    errors: number;
    results: SyncResult[];
}

export function LightfunnelsSettings() {
    const [status, setStatus] = useState<ConnectionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [showTokenInput, setShowTokenInput] = useState(false);
    const [accessToken, setAccessToken] = useState("");
    const [savingToken, setSavingToken] = useState(false);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Check connection status
    const checkStatus = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/lightfunnels/sync");
            const data = await res.json();
            setStatus(data);
        } catch (err) {
            setError("Failed to check connection status");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        checkStatus();
    }, [checkStatus]);

    // Save access token
    const handleSaveToken = async () => {
        if (!accessToken.trim()) return;

        setSavingToken(true);
        setError(null);

        try {
            const res = await fetch("/api/lightfunnels/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "save_token",
                    accessToken: accessToken.trim(),
                }),
            });

            const data = await res.json();

            if (data.success) {
                setShowTokenInput(false);
                setAccessToken("");
                await checkStatus();
            } else {
                setError(data.error || "Failed to save token");
            }
        } catch (err) {
            setError("Failed to save token");
        } finally {
            setSavingToken(false);
        }
    };

    // Disconnect
    const handleDisconnect = async () => {
        if (!confirm("Are you sure you want to disconnect from Lightfunnels?")) return;

        setLoading(true);
        try {
            await fetch("/api/lightfunnels/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "remove_token" }),
            });
            await checkStatus();
        } catch (err) {
            setError("Failed to disconnect");
        } finally {
            setLoading(false);
        }
    };

    // Sync orders
    const handleSync = async () => {
        setSyncing(true);
        setError(null);
        setSyncSummary(null);

        try {
            const res = await fetch("/api/lightfunnels/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "sync",
                    dateFrom: dateFrom || undefined,
                    dateTo: dateTo || undefined,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setSyncSummary(data.summary);
            } else {
                setError(data.error || "Sync failed");
            }
        } catch (err) {
            setError("Failed to sync orders");
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                    <Cloud className="w-6 h-6 text-blue-500" />
                    Lightfunnels Integration
                </h2>
                <p className="text-muted-foreground mt-1">
                    Connect to Lightfunnels to import orders automatically
                </p>
            </div>

            {/* Connection Status Card */}
            <div className="bg-card rounded-lg border p-6">
                <h3 className="font-semibold mb-4">Connection Status</h3>

                {loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Checking connection...
                    </div>
                ) : status?.connected ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-green-600 dark:text-green-500">
                            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <Check className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-medium">Connected</p>
                                <p className="text-sm text-muted-foreground">
                                    Store: {status.storeName}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleDisconnect}
                            className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                        >
                            <Trash2 className="w-3 h-3" />
                            Disconnect
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <CloudOff className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="font-medium">Not Connected</p>
                                <p className="text-sm">Add your access token to connect</p>
                            </div>
                        </div>

                        {!showTokenInput ? (
                            <button
                                onClick={() => setShowTokenInput(true)}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 flex items-center gap-2"
                            >
                                <Key className="w-4 h-4" />
                                Connect with Access Token
                            </button>
                        ) : (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-sm font-medium block mb-1">
                                        Access Token
                                    </label>
                                    <input
                                        type="password"
                                        value={accessToken}
                                        onChange={(e) => setAccessToken(e.target.value)}
                                        placeholder="Enter your Lightfunnels access token"
                                        className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Get this from your Lightfunnels Partners dashboard
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSaveToken}
                                        disabled={!accessToken.trim() || savingToken}
                                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {savingToken ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Check className="w-4 h-4" />
                                        )}
                                        Save & Connect
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowTokenInput(false);
                                            setAccessToken("");
                                        }}
                                        className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-muted"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}
            </div>

            {/* Sync Orders Card */}
            {status?.connected && (
                <div className="bg-card rounded-lg border p-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Download className="w-5 h-5" />
                        Import Orders
                    </h3>

                    {/* Date Range Filter */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="text-sm font-medium block mb-1 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                From Date (optional)
                            </label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium block mb-1 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                To Date (optional)
                            </label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="w-full px-4 py-3 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {syncing ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Syncing Orders...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="w-5 h-5" />
                                Sync Orders Now
                            </>
                        )}
                    </button>

                    {/* Sync Results */}
                    {syncSummary && (
                        <div className="mt-6 space-y-4">
                            <h4 className="font-medium">Sync Results</h4>

                            {/* Summary Stats */}
                            <div className="grid grid-cols-4 gap-3">
                                <div className="p-3 bg-muted rounded-lg text-center">
                                    <p className="text-2xl font-bold">{syncSummary.total}</p>
                                    <p className="text-xs text-muted-foreground">Total</p>
                                </div>
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-green-600">{syncSummary.imported}</p>
                                    <p className="text-xs text-green-600">Imported</p>
                                </div>
                                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-yellow-600">{syncSummary.duplicates}</p>
                                    <p className="text-xs text-yellow-600">Duplicates</p>
                                </div>
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                                    <p className="text-2xl font-bold text-red-600">{syncSummary.errors}</p>
                                    <p className="text-xs text-red-600">Errors</p>
                                </div>
                            </div>

                            {/* Detailed Results */}
                            {syncSummary.results.length > 0 && (
                                <div className="max-h-60 overflow-y-auto border rounded-lg">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted sticky top-0">
                                            <tr>
                                                <th className="text-left px-3 py-2">Order</th>
                                                <th className="text-left px-3 py-2">Status</th>
                                                <th className="text-left px-3 py-2">Message</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {syncSummary.results.map((result, i) => (
                                                <tr key={i} className="border-t">
                                                    <td className="px-3 py-2 font-mono text-xs">
                                                        {result.orderName}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={cn(
                                                            "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
                                                            result.status === "imported" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                                                            result.status === "duplicate" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                                                            result.status === "error" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                        )}>
                                                            {result.status === "imported" && <Check className="w-3 h-3" />}
                                                            {result.status === "duplicate" && <RefreshCw className="w-3 h-3" />}
                                                            {result.status === "error" && <X className="w-3 h-3" />}
                                                            {result.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-muted-foreground">
                                                        {result.message || "-"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Help Section */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">
                    How to get your Access Token
                </h4>
                <ol className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-decimal list-inside">
                    <li>Go to <strong>Lightfunnels Partners</strong> dashboard</li>
                    <li>Create a new app or use existing one</li>
                    <li>Navigate to <strong>App Settings → API Access</strong></li>
                    <li>Generate or copy your <strong>Access Token</strong></li>
                    <li>Paste it in the field above</li>
                </ol>
            </div>
        </div>
    );
}
