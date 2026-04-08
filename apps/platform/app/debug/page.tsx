'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

export default function WebhookDebugPage() {
    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [testing, setTesting] = useState(false);

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/debug/webhook-status');
            const data = await response.json();
            setStatus(data);
        } catch (error) {
            console.error('Error fetching status:', error);
        }
        setLoading(false);
    };

    const processCheckouts = async () => {
        setProcessing(true);
        try {
            const response = await fetch('/api/cron/process-checkouts-manual');
            const data = await response.json();
            alert(`✅ Processed ${data.processed || 0} checkout(s)\n${data.failed || 0} failed`);
            fetchStatus(); // Refresh status
        } catch (error) {
            alert('❌ Error processing checkouts: ' + error);
        }
        setProcessing(false);
    };

    const testWebhook = async () => {
        setTesting(true);
        try {
            const response = await fetch('/api/debug/test-webhook');
            const data = await response.json();
            if (data.success) {
                alert('✅ Test webhook successful! Check your orders page for the test order.');
            } else {
                alert('❌ Test webhook failed:\n' + JSON.stringify(data.response, null, 2));
            }
            fetchStatus(); // Refresh status
        } catch (error) {
            alert('❌ Error testing webhook: ' + error);
        }
        setTesting(false);
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const StatusIcon = ({ status }: { status: string }) => {
        if (status === 'ok') return <CheckCircle2 className="h-6 w-6 text-green-500" />;
        if (status === 'warning') return <AlertTriangle className="h-6 w-6 text-yellow-500" />;
        return <XCircle className="h-6 w-6 text-red-500" />;
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Lightfunnels Webhook Diagnostics
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">
                            Last checked: {status?.timestamp ? new Date(status.timestamp).toLocaleString() : 'Never'}
                        </p>
                    </div>
                    <Button onClick={fetchStatus} variant="outline">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>

                {/* Overall Status */}
                <Card className="p-6">
                    <div className="flex items-center gap-4">
                        <StatusIcon status={status?.status} />
                        <div>
                            <h2 className="text-xl font-semibold">
                                Overall Status: {status?.status?.toUpperCase()}
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400">
                                {status?.status === 'ok' && '✅ Everything is working correctly'}
                                {status?.status === 'warning' && '⚠️ Minor issues detected'}
                                {status?.status === 'error' && '❌ Critical issues preventing imports'}
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Quick Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Button
                        onClick={testWebhook}
                        disabled={testing}
                        className="h-auto py-4 flex flex-col items-center gap-2"
                    >
                        {testing ? <Loader2 className="h-5 w-5 animate-spin" /> : '🧪'}
                        <span className="font-semibold">Test Webhook</span>
                        <span className="text-xs opacity-80">Send test order</span>
                    </Button>

                    <Button
                        onClick={processCheckouts}
                        disabled={processing}
                        className="h-auto py-4 flex flex-col items-center gap-2"
                        variant="secondary"
                    >
                        {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : '⚡'}
                        <span className="font-semibold">Process Queue</span>
                        <span className="text-xs opacity-80">
                            {status?.checkoutQueue?.pending || 0} pending
                        </span>
                    </Button>

                    <Button
                        onClick={() => window.open('/api/lightfunnels/sync', '_blank')}
                        className="h-auto py-4 flex flex-col items-center gap-2"
                        variant="outline"
                    >
                        🔄
                        <span className="font-semibold">Sync Orders</span>
                        <span className="text-xs opacity-80">Pull from API</span>
                    </Button>
                </div>

                {/* Issues */}
                {status?.issues && status.issues.length > 0 && (
                    <Card className="p-6 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                        <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-3">
                            ❌ Critical Issues ({status.issues.length})
                        </h3>
                        <ul className="space-y-2">
                            {status.issues.map((issue: string, i: number) => (
                                <li key={i} className="text-red-800 dark:text-red-200 flex items-start gap-2">
                                    <span>•</span>
                                    <span>{issue}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}

                {/* Warnings */}
                {status?.warnings && status.warnings.length > 0 && (
                    <Card className="p-6 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
                        <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
                            ⚠️ Warnings ({status.warnings.length})
                        </h3>
                        <ul className="space-y-2">
                            {status.warnings.map((warning: string, i: number) => (
                                <li key={i} className="text-yellow-800 dark:text-yellow-200 flex items-start gap-2">
                                    <span>•</span>
                                    <span>{warning}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                )}

                {/* Orders Summary */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">📊 Orders (Last 24 Hours)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                            <div className="text-3xl font-bold text-blue-600">
                                {status?.ordersLast24h?.total || 0}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Total Orders</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-green-600">
                                {status?.ordersLast24h?.fromLightfunnels || 0}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">From Lightfunnels</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-purple-600">
                                {status?.ordersLast24h?.completedOrders || 0}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-orange-600">
                                {status?.ordersLast24h?.abandonedCheckouts || 0}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Checkouts</div>
                        </div>
                    </div>

                    {status?.recentOrders && status.recentOrders.length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                            <h4 className="font-semibold mb-2">Recent Orders:</h4>
                            <div className="space-y-2">
                                {status.recentOrders.map((order: any, i: number) => (
                                    <div key={i} className="text-sm bg-gray-100 dark:bg-gray-800 p-2 rounded">
                                        <span className="font-mono text-blue-600">{order.orderId}</span>
                                        {' - '}
                                        <span>{order.customer}</span>
                                        {' '}
                                        <span className="text-gray-500">({order.status})</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>

                {/* Checkout Queue */}
                {status?.checkoutQueue && (
                    <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4">📦 Checkout Queue</h3>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <div className="text-3xl font-bold text-yellow-600">
                                    {status.checkoutQueue.pending || 0}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">Pending</div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-red-600">
                                    {status.checkoutQueue.failed || 0}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
                            </div>
                        </div>

                        {status?.pendingCheckouts && status.pendingCheckouts.length > 0 && (
                            <div className="space-y-2">
                                <h4 className="font-semibold">Pending Checkouts:</h4>
                                {status.pendingCheckouts.map((checkout: any, i: number) => (
                                    <div key={i} className="text-sm bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded">
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono">{checkout.checkoutId}</span>
                                            {checkout.isReady ? (
                                                <span className="text-green-600 font-semibold">🔴 READY</span>
                                            ) : (
                                                <span className="text-gray-500">⏳ Waiting</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                            Attempts: {checkout.attempts} | Process after: {new Date(checkout.processAfter).toLocaleString()}
                                        </div>
                                        {checkout.lastError && (
                                            <div className="text-xs text-red-600 mt-1">Error: {checkout.lastError}</div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                )}

                {/* Environment */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">⚙️ Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {status?.environment && Object.entries(status.environment).map(([key, value]: [string, any]) => (
                            <div key={key} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                <span className="text-sm font-mono">{key}</span>
                                {typeof value === 'boolean' ? (
                                    value ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                    )
                                ) : (
                                    <span className="text-sm text-gray-600 dark:text-gray-400">{value}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Recommendations */}
                {status?.recommendations && status.recommendations.length > 0 && (
                    <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4">💡 Recommendations</h3>
                        <div className="space-y-4">
                            {status.recommendations.map((rec: any, i: number) => (
                                <div key={i} className="border-l-4 border-blue-500 pl-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                            rec.priority === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                                            rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                            'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                        }`}>
                                            {rec.priority?.toUpperCase()}
                                        </span>
                                    </div>
                                    <p className="font-semibold">{rec.action}</p>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">{rec.reason}</p>
                                    {rec.steps && (
                                        <ul className="mt-2 text-sm space-y-1">
                                            {rec.steps.map((step: string, j: number) => (
                                                <li key={j} className="text-gray-700 dark:text-gray-300">
                                                    {j + 1}. {step}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Raw Data */}
                <details className="bg-gray-100 dark:bg-gray-800 p-4 rounded">
                    <summary className="cursor-pointer font-semibold">🔍 Raw Data (for debugging)</summary>
                    <pre className="mt-4 text-xs overflow-auto">
                        {JSON.stringify(status, null, 2)}
                    </pre>
                </details>
            </div>
        </div>
    );
}
