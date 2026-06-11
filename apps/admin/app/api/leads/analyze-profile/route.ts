import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-supabase";

// ── Types ──────────────────────────────────────────────────────────────

interface ProfileResult {
  merchant_name: string;
  handle: string;
  follower_count: number;
  post_count: number;
  avg_view_count: number;
  avg_like_count: number;
  avg_comments_count: number;
  platform_url: string;
  bio: string;
  profile_pic?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY ?? "";

/** Coerce API values (which may arrive as numbers or numeric strings) to a non-negative integer. */
function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

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

/** Upstream (RapidAPI) failure, carrying the HTTP status so the route can map it cleanly. */
class IgApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Instagram API error ${status}: ${detail}`);
    this.name = "IgApiError";
  }
  /** Rate-limit / quota exhaustion (per-second throttle or monthly plan cap). */
  get isRateLimited(): boolean {
    return this.status === 429 || /quota|rate ?limit/i.test(this.detail);
  }
}

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
    throw new IgApiError(res.status, await res.text());
  }
  return res.json();
}

/** Normalize a posts/reels list entry to a single content node (handles `node` and `media` nesting). */
function contentNode(item: unknown): Record<string, unknown> {
  const node = (item as { node?: Record<string, unknown> })?.node ?? (item as Record<string, unknown>) ?? {};
  return (node as { media?: Record<string, unknown> }).media ?? node;
}

/** Per-item engagement. Photos report no views (view_count is null, no play_count); only videos/reels do. */
function itemMetrics(item: unknown): { likes: number; comments: number; views: number } {
  const n = contentNode(item);
  return {
    likes: num(n.like_count),
    comments: num(n.comment_count),
    views: num(n.play_count ?? n.view_count),
  };
}

const mean = (nums: number[]): number =>
  nums.length > 0 ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length) : 0;

async function scrapeInstagram(username: string): Promise<ProfileResult> {
  // Profile endpoint is the source of truth for follower/post counts, name, and bio —
  // the posts/reels endpoints do not carry these. Posts/reels are used only for engagement.
  const [profileJson, postsJson, reelsJson] = await Promise.all([
    igPost("ig_get_fb_profile.php", { username_or_url: username }),
    igPost("get_ig_user_posts.php", { username_or_url: username }).catch(() => ({ posts: [] })),
    igPost("get_ig_user_reels.php", { username_or_url: username }).catch(() => ({ reels: [] })),
  ]);

  // The profile fields sit at the top level of the response; tolerate a `user`/`data` wrapper too.
  const profile =
    (profileJson?.follower_count !== undefined ? profileJson : profileJson?.user ?? profileJson?.data) ?? {};

  if (!profile.username && !profile.follower_count) {
    throw new Error(
      "Could not load this Instagram profile. The username may be incorrect, or the account doesn't exist.",
    );
  }

  const posts = Array.isArray(postsJson?.posts) ? postsJson.posts : [];
  const reels = Array.isArray(reelsJson?.reels) ? reelsJson.reels : [];

  // Pool recent posts + reels for engagement. Likes/comments are present on every item;
  // views exist only on videos/reels, so average views over items that actually have them
  // (averaging in zero-view photos would understate it).
  const items = [...posts.slice(0, 12), ...reels.slice(0, 12)].map(itemMetrics);
  const avgLikes = mean(items.map((m) => m.likes));
  const avgComments = mean(items.map((m) => m.comments));
  const avgViews = mean(items.map((m) => m.views).filter((v) => v > 0));

  const igUsername = (profile.username as string) ?? username;
  const profilePic =
    (profile.hd_profile_pic_url_info as { url?: string })?.url ??
    (profile.profile_pic_url as string) ??
    undefined;

  return {
    merchant_name: (profile.full_name as string) || igUsername,
    handle: igUsername,
    follower_count: num(profile.follower_count),
    post_count: num(profile.media_count),
    avg_view_count: avgViews,
    avg_like_count: avgLikes,
    avg_comments_count: avgComments,
    platform_url: `https://www.instagram.com/${igUsername}/`,
    bio: (profile.biography as string) ?? "",
    profile_pic: profilePic,
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

    // Upstream (RapidAPI) failures: map to a clean message without leaking the vendor URL.
    if (error instanceof IgApiError) {
      if (error.isRateLimited) {
        return NextResponse.json(
          {
            error:
              "Instagram lookup is rate-limited right now (API quota reached). Enter the details manually, or try again later.",
          },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: "Instagram lookup is temporarily unavailable. Enter the details manually, or try again later." },
        { status: 502 },
      );
    }

    // Profile-not-found (and other validation errors) carry a user-friendly message already.
    const message = error instanceof Error ? error.message : "Failed to analyze profile";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
