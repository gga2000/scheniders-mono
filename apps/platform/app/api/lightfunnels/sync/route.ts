import { NextRequest, NextResponse } from 'next/server';
import {
    testConnection,
    syncOrders,
    getSavedAccessToken,
    saveAccessToken,
    removeAccessToken,
} from '@/lib/lightfunnels-api';

/**
 * POST /api/lightfunnels/sync
 * 
 * Sync orders from Lightfunnels.
 * 
 * Body:
 * - action: 'test' | 'sync' | 'save_token' | 'remove_token'
 * - accessToken?: string (for test/sync if not saved)
 * - dateFrom?: string (for sync)
 * - dateTo?: string (for sync)
 * - maxOrders?: number (for sync, default 500)
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, accessToken, dateFrom, dateTo, maxOrders } = body;

        // Get token from request or database
        const token = accessToken || await getSavedAccessToken();

        switch (action) {
            case 'test': {
                if (!token) {
                    return NextResponse.json(
                        { success: false, error: 'No access token provided' },
                        { status: 400 }
                    );
                }

                const result = await testConnection(token);
                return NextResponse.json(result);
            }

            case 'sync': {
                if (!token) {
                    return NextResponse.json(
                        { success: false, error: 'No access token configured' },
                        { status: 400 }
                    );
                }

                const summary = await syncOrders(token, {
                    dateFrom,
                    dateTo,
                    maxOrders: maxOrders || 500,
                });

                return NextResponse.json({
                    success: true,
                    summary,
                });
            }

            case 'save_token': {
                if (!accessToken) {
                    return NextResponse.json(
                        { success: false, error: 'No access token provided' },
                        { status: 400 }
                    );
                }

                // First test the token
                const testResult = await testConnection(accessToken);
                if (!testResult.success) {
                    return NextResponse.json(
                        { success: false, error: `Invalid token: ${testResult.error}` },
                        { status: 400 }
                    );
                }

                // Save if valid
                const saved = await saveAccessToken(accessToken);
                if (!saved) {
                    return NextResponse.json(
                        { success: false, error: 'Failed to save token' },
                        { status: 500 }
                    );
                }

                return NextResponse.json({
                    success: true,
                    storeName: testResult.storeName,
                    message: 'Token saved successfully',
                });
            }

            case 'remove_token': {
                const removed = await removeAccessToken();
                return NextResponse.json({
                    success: removed,
                    message: removed ? 'Token removed' : 'Failed to remove token',
                });
            }

            case 'status': {
                // Check if connected
                const savedToken = await getSavedAccessToken();
                if (!savedToken) {
                    return NextResponse.json({
                        connected: false,
                    });
                }

                const testResult = await testConnection(savedToken);
                return NextResponse.json({
                    connected: testResult.success,
                    storeName: testResult.storeName,
                    error: testResult.error,
                });
            }

            default:
                return NextResponse.json(
                    { success: false, error: 'Invalid action' },
                    { status: 400 }
                );
        }
    } catch (error) {
        console.error('Lightfunnels sync error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error',
            },
            { status: 500 }
        );
    }
}

/**
 * GET /api/lightfunnels/sync
 * 
 * Get connection status
 */
export async function GET() {
    try {
        const token = await getSavedAccessToken();

        if (!token) {
            return NextResponse.json({
                connected: false,
                message: 'No access token configured',
            });
        }

        const result = await testConnection(token);

        return NextResponse.json({
            connected: result.success,
            storeName: result.storeName,
            error: result.error,
        });
    } catch (error) {
        return NextResponse.json({
            connected: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
