import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { readMerchantsList } from "@/lib/merchants-list";

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const answer = await readMerchantsList(request.nextUrl.searchParams);
    if ("badRequest" in answer) return NextResponse.json({ error: answer.badRequest }, { status: 400 });
    return NextResponse.json(answer);
  } catch (error) {
    console.error("Merchants API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch merchants" },
      { status: 500 }
    );
  }
}
