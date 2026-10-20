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

/** The slice of the Messages API reply this route reads. */
const anthropicMessageSchema = z.object({
    content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
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

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
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

    let payload: unknown;
    try {
        payload = res.ok ? await res.json() : await res.text();
    } catch (err) {
        console.error("[AI StoreCopy] unreadable Anthropic response", res.status, err);
        return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
    }
    if (!res.ok) {
        console.error("[AI StoreCopy] Anthropic error", res.status, String(payload).slice(0, 200));
        return NextResponse.json({ error: "AI generation failed" }, { status: 502 });
    }

    const message = anthropicMessageSchema.safeParse(payload);
    const block = message.success ? message.data.content.find((b) => b.type === "text") : undefined;
    const copy = parseStoreCopy(block?.text ?? null);
    // parseStoreCopy returns null for a malformed shape AND for copy that
    // broke the no-invented-claims rule — neither may reach a store.
    if (!copy) {
        return NextResponse.json({ error: "AI returned unusable copy" }, { status: 502 });
    }

    return NextResponse.json({ copy, pack_id: pack.id });
}
