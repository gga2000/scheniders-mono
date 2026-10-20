#!/usr/bin/env node
// =====================================================================
// Route status check for a running storefront
// =====================================================================
// A loading.tsx boundary makes Next stream the shell, and with it a 200,
// before the page body runs. A notFound() or permanentRedirect() thrown
// after that point can no longer change the status: a missing product
// becomes a soft 404 (200 + an injected noindex meta) and a merchant's 308
// becomes a 200 with a client-side meta refresh. Crawlers and ad
// link-checkers only see the status, so this checks the status.
//
// Needs a production server (`pnpm build && pnpm start`) on a live DB, so
// it is run by hand, not in CI:
//
//   node scripts/route-status-check.mjs --base http://localhost:3001 \
//     --tenant scheniders-iraq --redirect /products/tobacco
//
// --redirect is a path (under the tenant) that a published redirect rule
// covers; it must answer 308 with a Location header. Without it the
// redirect case is skipped and the script says so.

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      console.error(`✗ Expected --name value pairs, got: ${argv.join(" ")}`);
      process.exit(1);
    }
    args.set(key.slice(2), value);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const base = args.get("base");
const tenant = args.get("tenant");
const redirectPath = args.get("redirect");

if (!base || !tenant) {
  console.error("✗ Usage: route-status-check.mjs --base <url> --tenant <slug> [--redirect <path>]");
  process.exit(1);
}

const USER_AGENTS = {
  browser:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  googlebot:
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

// A slug no merchant will ever have, so "missing" stays missing.
const missing = `zz-route-status-${Date.now().toString(36)}`;
const root = `/s/${encodeURIComponent(tenant)}`;

const cases = [
  { name: "missing product", path: `${root}/products/${missing}`, status: 404 },
  { name: "missing category", path: `${root}/categories/${missing}`, status: 404 },
  // Control: a slug route that never had a loading boundary.
  { name: "missing custom page", path: `${root}/p/${missing}`, status: 404 },
];
if (redirectPath) {
  const rel = redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`;
  cases.push({ name: "merchant redirect", path: `${root}${rel}`, status: 308, location: true });
} else {
  console.log("- merchant redirect: skipped (no --redirect path given)");
}

let failures = 0;
for (const c of cases) {
  for (const [uaName, ua] of Object.entries(USER_AGENTS)) {
    const res = await fetch(new URL(c.path, base), {
      redirect: "manual",
      headers: { "user-agent": ua },
    });
    // Drain the body so the stream (and the server's render) completes.
    await res.arrayBuffer();
    const location = res.headers.get("location");
    const okStatus = res.status === c.status;
    const okLocation = !c.location || Boolean(location);
    const label = `${c.name} [${uaName}] ${c.path}`;
    if (okStatus && okLocation) {
      console.log(`✓ ${label} → ${res.status}${location ? ` → ${location}` : ""}`);
    } else {
      failures += 1;
      console.error(
        `✗ ${label} → ${res.status}${location ? ` → ${location}` : " (no Location)"}; expected ${c.status}${c.location ? " with a Location header" : ""}`,
      );
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} route status check(s) failed.`);
  process.exit(1);
}
console.log("\nAll route status checks passed.");
