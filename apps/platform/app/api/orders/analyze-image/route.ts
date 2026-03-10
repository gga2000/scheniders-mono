import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      );
    }

    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Get the image from the request
    const formData = await request.formData();
    const file = formData.get("image") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No image provided" },
        { status: 400 }
      );
    }

    console.log("Processing image:", file.name, file.type, file.size);

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString("base64");

    // Try models in order of preference (fallback if one is unavailable)
    const models = ["gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"];
    let model;
    let lastError;

    // Create the prompt
    const prompt = `
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

    // Try each model until one succeeds
    let result;
    for (const modelName of models) {
      try {
        console.log(`Trying model: ${modelName}`);
        model = genAI.getGenerativeModel({ model: modelName });

        result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Image,
              mimeType: file.type,
            },
          },
        ]);

        console.log(`✓ Model ${modelName} succeeded`);
        break; // Success! Exit the loop
      } catch (error) {
        const err = error as Error;
        console.log(`✗ Model ${modelName} failed:`, err.message);
        lastError = error;

        // If this is the last model, throw the error
        if (modelName === models[models.length - 1]) {
          throw error;
        }
        // Otherwise, try the next model
        continue;
      }
    }

    if (!result) {
      throw lastError || new Error("All models failed");
    }

    const response = await result.response;
    const text = response.text();

    // Parse the JSON response
    let extractedData;
    try {
      // Remove markdown code blocks if present
      const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      console.log("Gemini response:", cleanedText);
      extractedData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", text);
      console.error("Parse error:", parseError);
      return NextResponse.json(
        { error: "Failed to parse AI response", rawResponse: text },
        { status: 500 }
      );
    }

    console.log("Successfully extracted data:", extractedData);

    return NextResponse.json({
      success: true,
      data: extractedData,
    });
  } catch (error) {
    const err = error as Error;
    console.error("Error analyzing image:", error);
    console.error("Error details:", err.message, err.stack);
    return NextResponse.json(
      { error: "Failed to analyze image", details: err.message },
      { status: 500 }
    );
  }
}
