import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-supabase";

// ── Types ──────────────────────────────────────────────────────────────

interface ProfileResult {
  merchant_name: string;
  follower_count: number;
  avg_view_count: number;
  avg_like_count: number;
  avg_comments_count: number;
  platform_url: string;
  bio: string;
  profile_pic?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? "";

function extractUsername(input: string): string {
  // Handle @username, full URLs, or plain username
  let cleaned = input.trim();
  // Remove @
  if (cleaned.startsWith("@")) cleaned = cleaned.slice(1);
  // Extract from URL path
  try {
    const url = new URL(cleaned);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1].replace(/\?.*$/, "");
  } catch {
    // Not a URL, use as-is
  }
  return cleaned.split("?")[0].split("/").filter(Boolean).pop() ?? cleaned;
}

// ── Instagram Scraper ───────────────────────────────────────────────────

const IG_HOST = "instagram-scraper-stable-api.p.rapidapi.com";

async function igPost(endpoint: string, body: Record<string, string>) {
  const res = await fetch(
    `https://${IG_HOST}/${endpoint}`,
    {
      method: "POST",
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": IG_HOST,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instagram API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function scrapeInstagram(username: string): Promise<ProfileResult> {
  // Fetch posts and reels in parallel for user info + engagement metrics
  const [postsJson, reelsJson] = await Promise.all([
    igPost("get_ig_user_posts.php", { username_or_url: username }),
    igPost("get_ig_user_reels.php", { username_or_url: username }).catch(() => ({ reels: [] })),
  ]);

  const posts = postsJson.posts ?? [];
  const reels = reelsJson.reels ?? [];

  if (posts.length === 0 && reels.length === 0) {
    throw new Error("No posts or reels found for this account. The username may be incorrect or the account is private.");
  }

  // Extract user info from the first post
  const firstPost = posts[0]?.node ?? posts[0] ?? {};
  const user = firstPost.user ?? firstPost.owner ?? {};

  // Calculate engagement from posts (likes, comments, views)
  const postMetrics = posts.slice(0, 12).map((p: Record<string, unknown>) => {
    const node = (p as { node?: Record<string, unknown> }).node ?? p;
    return {
      likes: (node as { like_count?: number }).like_count ?? 0,
      comments: (node as { comment_count?: number }).comment_count ?? 0,
      views: (node as { view_count?: number }).view_count ?? (node as { play_count?: number }).play_count ?? 0,
    };
  });

  // Calculate engagement from reels (better view counts via play_count)
  const reelMetrics = reels.slice(0, 12).map((r: Record<string, unknown>) => {
    const node = (r as { node?: Record<string, unknown> }).node ?? r;
    const media = (node as { media?: Record<string, unknown> }).media ?? node;
    return {
      likes: (media as { like_count?: number }).like_count ?? 0,
      comments: (media as { comment_count?: number }).comment_count ?? 0,
      views: (media as { play_count?: number }).play_count ?? (media as { view_count?: number }).view_count ?? 0,
    };
  });

  // Combine all metrics (reels are better for views)
  const allMetrics = [...postMetrics, ...reelMetrics];
  const viewMetrics = reelMetrics.length > 0 ? reelMetrics : postMetrics; // prefer reels for views

  const avgLikes = allMetrics.length > 0
    ? Math.round(allMetrics.reduce((s, p) => s + p.likes, 0) / allMetrics.length)
    : 0;
  const avgComments = allMetrics.length > 0
    ? Math.round(allMetrics.reduce((s, p) => s + p.comments, 0) / allMetrics.length)
    : 0;
  const avgViews = viewMetrics.length > 0
    ? Math.round(viewMetrics.reduce((s, p) => s + p.views, 0) / viewMetrics.length)
    : 0;

  return {
    merchant_name: user.full_name ?? user.username ?? username,
    follower_count: 0, // not available from this API — employee can enter manually
    avg_view_count: avgViews,
    avg_like_count: avgLikes,
    avg_comments_count: avgComments,
    platform_url: `https://www.instagram.com/${user.username ?? username}/`,
    bio: "", // not available from this API
    profile_pic: user.hd_profile_pic_url_info?.url ?? user.profile_pic_url ?? undefined,
  };
}

// ── TikTok & Facebook ───────────────────────────────────────────────────
// Not yet subscribed on RapidAPI — can be added later when APIs are set up

// ── Route Handler ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await requireAdmin(token);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!RAPIDAPI_KEY) {
      return NextResponse.json(
        { error: "RAPIDAPI_KEY is not configured. Add it to your environment variables." },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { platform, handle } = body as { platform: string; handle: string };

    if (!handle || !platform) {
      return NextResponse.json({ error: "platform and handle are required" }, { status: 400 });
    }

    const username = extractUsername(handle);

    let profile: ProfileResult;

    switch (platform) {
      case "instagram":
        profile = await scrapeInstagram(username);
        break;
      default:
        return NextResponse.json(
          { error: `Profile analysis is currently available for Instagram only. "${platform}" is not yet supported.` },
          { status: 400 },
        );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Analyze profile error:", error);
    const message = error instanceof Error ? error.message : "Failed to analyze profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
