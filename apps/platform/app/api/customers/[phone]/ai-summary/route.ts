import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { ANTHROPIC_MESSAGES_URL } from "@/lib/anthropic-api";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { normalizePhoneForSearch } from "@/lib/order-utils";

export const dynamic = "force-dynamic";

const CACHE_TTL_DAYS = 7;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ phone: string }> }
) {
    try {
        // Every read below is scoped to the caller's verified tenant: the same
        // phone can be a customer of several tenants.
        const caller = await requireRequestCaller(request, "member");
        if (!caller.ok) return caller.response;

        const { phone } = await params;
        // Stored in the same normalized shape as customer_metadata's key.
        const decodedPhone = normalizePhoneForSearch(decodeURIComponent(phone));

        if (!decodedPhone) {
            return NextResponse.json({ error: "Phone is required" }, { status: 400 });
        }

        const supabase = createSupabaseServiceClient();

        // Check for refresh param
        const refresh = request.nextUrl.searchParams.get("refresh") === "true";

        // Check cache first (unless refresh requested)
        if (!refresh) {
            const { data: cached } = await supabase
                .from("customer_metadata")
                .select("ai_summary, ai_summary_generated_at")
                .eq("customer_phone", decodedPhone)
                .eq("tenant_id", caller.tenantId)
                .maybeSingle();

            if (cached?.ai_summary && cached?.ai_summary_generated_at) {
                const generatedAt = new Date(cached.ai_summary_generated_at);
                const ageMs = Date.now() - generatedAt.getTime();
                const ageDays = ageMs / (1000 * 60 * 60 * 24);

                if (ageDays < CACHE_TTL_DAYS) {
                    return NextResponse.json({
                        summary: cached.ai_summary.summary,
                        generatedAt: cached.ai_summary_generated_at,
                        cached: true,
                    });
                }
            }
        }

        // Fetch customer trust data
        const { data: trustData } = await supabase
            .from("customer_trust")
            .select("*")
            .eq("phone", decodedPhone)
            .eq("tenant_id", caller.tenantId)
            .maybeSingle();

        // Fetch recent orders
        const { data: recentOrders } = await supabase
            .from("orders")
            .select("id, status, price, created_at, city, rejection_reason")
            .in("phone", [decodedPhone, `0${decodedPhone}`, `964${decodedPhone}`, `+964${decodedPhone}`])
            .eq("tenant_id", caller.tenantId)
            .order("created_at", { ascending: false })
            .limit(10);

        // Build the prompt
        const trustInfo = trustData
            ? `Trust Score: ${trustData.trust_score}/100, Tier: ${trustData.trust_tier}, Total Orders: ${trustData.total_orders || 0}, Delivered: ${trustData.delivered_count || 0}, Cancelled (customer): ${trustData.cancelled_customer_count || 0}, Rejected (customer fault): ${trustData.rejected_customer_fault_count || 0}, No Response: ${trustData.no_response_count || 0}, Delivery Success Rate: ${trustData.delivery_success_rate || 0}%`
            : "No trust data available";

        const ordersInfo = recentOrders?.length
            ? recentOrders
                .map(
                    (o: any) =>
                        `- Order ${String(o.id).slice(-6)}: ${o.status}, Price: ${o.price} IQD, City: ${o.city || "N/A"}, Date: ${o.created_at?.slice(0, 10)}${o.rejection_reason ? `, Rejection: ${o.rejection_reason}` : ""}`
                )
                .join("\n")
            : "No recent orders";

        const prompt = `You are a customer intelligence analyst for an Iraqi e-commerce/order-management platform. Summarize this customer's profile in 2-3 concise sentences in English. Focus on reliability, ordering patterns, and any notable risks or strengths.

Customer Phone: ${decodedPhone}
${trustInfo}

Recent Orders (last 10):
${ordersInfo}

Provide a brief, actionable summary that helps an operations team understand this customer at a glance. Do not use bullet points — write flowing sentences.`;

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.error("[AI Summary] ANTHROPIC_API_KEY is not configured");
            return NextResponse.json(
                { error: "Anthropic API key not configured" },
                { status: 500 }
            );
        }

        // Call Anthropic API via fetch
        const response = await fetch(ANTHROPIC_MESSAGES_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 256,
                messages: [{ role: "user", content: prompt }],
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error("[AI Summary] Anthropic API error:", response.status, errBody);
            return NextResponse.json(
                { error: "AI generation failed" },
                { status: 502 }
            );
        }

        const message = await response.json();
        const summaryBlock = message.content?.[0];
        const summary =
            summaryBlock?.type === "text" ? summaryBlock.text : "Unable to generate summary.";

        const generatedAt = new Date().toISOString();

        // Cache the result
        const { error: upsertError } = await supabase.from("customer_metadata").upsert(
            {
                customer_phone: decodedPhone,
                tenant_id: caller.tenantId,
                ai_summary: { summary },
                ai_summary_generated_at: generatedAt,
            },
            { onConflict: "tenant_id,customer_phone" }
        );

        if (upsertError) {
            console.error("[AI Summary] Cache upsert failed:", upsertError.message);
        }

        return NextResponse.json({
            summary,
            generatedAt,
            cached: false,
        });
    } catch (error) {
        const err = error as Error;
        console.error("[AI Summary] Error:", err.message, err.stack);
        return NextResponse.json(
            { error: "Failed to generate AI summary", details: err.message },
            { status: 500 }
        );
    }
}
