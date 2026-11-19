import Link from "next/link";

/**
 * A shop's name, linked to its page, with its "#id" beside it, for a table
 * cell. Most shop names here are Arabic. Drawn inline in one run, the browser
 * laid the name and the number out right to left together, so "#100095" landed
 * inside "متجر تجريبي Claude للأزياء" or on the left of a plain Arabic name
 * (round 18). The name now takes its own direction (dir="auto") and the number
 * is its own item, as on Support.
 */
export function ShopNameLink({ id, name, displayId }: { id: string; name: string | null; displayId: number | null }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <Link href={`/merchants/${id}`} dir="auto" className="font-medium text-foreground hover:underline">
        {name ?? "Shop"}
      </Link>
      {displayId !== null && <span className="text-xs text-foreground/70 tabular-nums">#{displayId}</span>}
    </span>
  );
}
