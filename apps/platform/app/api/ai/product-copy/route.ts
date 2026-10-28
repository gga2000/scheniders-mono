import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/supabase-server";
import { ANTHROPIC_MESSAGES_URL } from "@/lib/anthropic-api";
import {
    buildProductCopyMessages,
    parseProductCopy,
    PRODUCT_COPY_SCHEMA,
} from "@/lib/product-copy";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().max(120).optional(),
    hints: z.string().trim().max(1000).optional(),
    tone: z.enum(["friendly", "luxury", "playful", "minimal"]).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
    // Auth — same pattern as the customer AI summary route.
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, error: authError } = await verifyAccessToken(token);
    if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return NextResponse.json(
            { error: "Anthropic API key not configured" },
            { status: 500 },
        );
    }

    let res: Response;
    try {
        res = await fetch(ANTHROPIC_MESSAGES_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-opus-4-8",
                max_tokens: 2000,
                output_config: {
                    format: { type: "json_schema", schema: PRODUCT_COPY_SCHEMA },
                },
                messages: buildProductCopyMessages(parsed.data),
            }),
        });
    } catch {
        return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("[AI ProductCopy] Anthropic error", res.status, detail.slice(0, 200));
        return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
    }

    const message = (await res.json().catch(() => null)) as
        | { content?: Array<{ type: string; text?: string }> }
        | null;
    const block = message?.content?.[0];
    const text = block?.type === "text" ? block.text : null;
    const copy = parseProductCopy(text);
    if (!copy) {
        return NextResponse.json({ error: "AI returned malformed copy" }, { status: 502 });
    }

    return NextResponse.json({ copy });
}
