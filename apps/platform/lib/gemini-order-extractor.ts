import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ExtractedOrder {
    customer_name: string;
    phone: string;
    secondary_phone: string;
    city: string;
    address: string;
}

const PROMPT = `
You are analyzing a customer chat screenshot from Instagram or TikTok in Arabic.
Extract the following information:

1. Customer name/username - The person's name or Instagram/TikTok username
2. Customer phone number(s) - Look for Iraqi phone numbers (07XXXXXXXXX format)
3. Customer address - Full address including city/governorate and detailed location

Please respond ONLY in this exact JSON format (no markdown, no code blocks):
{
  "customer_name": "customer's name or username in Arabic/English",
  "phone": "primary phone number in 07XXXXXXXXX format",
  "secondary_phone": "secondary phone if available, otherwise empty string",
  "city": "governorate/city name in Arabic",
  "address": "full detailed address in Arabic"
}

Important:
- Extract the customer name from the chat (could be a real name like "علي محمد" or username like "nu90ha")
- Extract phone numbers even if they have spaces, dashes, or are in Arabic numerals
- Convert Arabic numerals (٠١٢٣...) to English (0123...)
- Remove all formatting from phone numbers (spaces, dashes, +964)
- If multiple phone numbers exist, put the first one in "phone" and second in "secondary_phone"
- For the city, extract only the governorate name (e.g., بغداد, واسط, البصرة, ديالى)
- Include the full detailed address

If you cannot find certain information, use empty strings for those fields.
`;

// The 1.5 family was deprecated by Google in late 2025; *-latest aliases auto-
// track the current stable release. We fall back through the list if any one
// model is briefly unavailable.
const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];

export async function extractOrderFromImage(
    buffer: Buffer,
    mimeType: string
): Promise<ExtractedOrder> {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured");
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const base64Image = buffer.toString("base64");

    let result;
    const errors: string[] = [];
    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            result = await model.generateContent([
                PROMPT,
                { inlineData: { data: base64Image, mimeType } },
            ]);
            console.log(`[gemini] used ${modelName}`);
            break;
        } catch (error) {
            const msg = (error as Error).message || String(error);
            errors.push(`${modelName}: ${msg}`);
            console.warn(`[gemini] ${modelName} failed: ${msg}`);
        }
    }

    if (!result) {
        throw new Error(`All Gemini models failed.\n${errors.join("\n")}`);
    }

    const text = (await result.response).text();
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned) as ExtractedOrder;
}
