import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(request: Request) {
    try {
        const { business_name, industry, template, language } = await request.json();

        if (!business_name) {
            return NextResponse.json({ error: "business_name is required" }, { status: 400 });
        }

        const lang = language === "en" ? "English" : "Arabic";
        const prompt = `You are an expert copywriter for e-commerce stores in the Iraqi market.

Generate compelling store copy for a ${industry || "general"} store named "${business_name}".
Template style: ${template || "general"}.
Write ALL copy in ${lang}.

Return a JSON object with these exact keys (no markdown, no code blocks, just raw JSON):
{
  "hero_title": "A catchy hero headline (max 60 characters)",
  "hero_subtitle": "A supporting subtitle that encourages visitors to shop (max 120 characters)",
  "hero_cta": "A call-to-action button text (max 20 characters)",
  "about_title": "An about section title (max 40 characters)",
  "about_body": "An about section paragraph describing the store and its values (max 300 characters)"
}

${lang === "Arabic" ? "Make the Arabic sound natural and conversational, not formal or translated. Use Iraqi Arabic tone where appropriate." : ""}`;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Parse JSON from response (handle potential markdown wrapping)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
        }

        const copy = JSON.parse(jsonMatch[0]);

        return NextResponse.json(copy);
    } catch (error) {
        console.error("AI copy generation error:", error);
        return NextResponse.json({ error: "Failed to generate copy" }, { status: 500 });
    }
}
