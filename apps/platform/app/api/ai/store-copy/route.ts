import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAccessToken } from "@/lib/supabase-server";
import { buildStoreCopyMessages, parseStoreCopy, STORE_COPY_SCHEMA } from "@/lib/store-copy";
import { resolveContentPack } from "@/lib/store-templates/content-packs";

export const dynamic = "force-dynamic";

// Raw fetch rather than the Anthropic SDK, matching the two AI routes this
// app already has (ai/product-copy, customers/ai-summary) — one way of
// calling Anthropic here, no new dependency for a third caller.
const bodySchema = z.object({
    business_name: z.string().trim().min(1).max(120),
    sells: z.string().trim().min(3).max(600),
    pack_id: z.string().trim().max(40).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
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
        return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
    }

    const pack = resolveContentPack(parsed.data.pack_id);

    let res: Response;
    try {
        res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: "claude-opus-5",
                max_tokens: 16000,
                output_config: {
                    format: { type: "json_schema", schema: STORE_COPY_SCHEMA },
                },
                messages: buildStoreCopyMessages({
                    businessName: parsed.data.business_name,
                    sells: parsed.data.sells,
                    packId: pack.id,
                }),
            }),
        });
    } catch {
        return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("[AI StoreCopy] Anthropic error", res.status, detail.slice(0, 200));
        return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
    }

    const message = (await res.json().catch(() => null)) as
        | { content?: Array<{ type: string; text?: string }>; stop_reason?: string }
        | null;
    const block = message?.content?.find((b) => b.type === "text");
    const copy = parseStoreCopy(block?.text ?? null);
    // parseStoreCopy returns null for a malformed shape AND for copy that
    // broke the no-invented-claims rule — neither may reach a store.
    if (!copy) {
        return NextResponse.json({ error: "AI returned unusable copy" }, { status: 502 });
    }

    return NextResponse.json({ copy, pack_id: pack.id });
}
