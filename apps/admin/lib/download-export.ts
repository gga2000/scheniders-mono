import { adminFetch } from "@/lib/admin-fetch";
import { failureOf } from "@/lib/send-json";
/**
 * The shops ticked on the Merchants page, saved as a CSV file. The ids go in
 * a POST body (thousands do not fit in an address), so the browser cannot
 * just open a link: the file comes back to the page and is saved from here,
 * under the name the server gives it.
 */
export async function downloadSelectedShops(ids: readonly string[]): Promise<void> {
  const response = await adminFetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "merchants", format: "csv", ids }),
  });
  if (!response.ok) throw failureOf(response.status, await response.json().catch(() => null), "The export failed.");

  const name = exportFileName(response.headers.get("content-disposition")) ?? "merchants_export.csv";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** The file name in a `Content-Disposition: attachment; filename="…"` header. */
export function exportFileName(header: string | null): string | undefined {
  return header?.match(/filename="([^"]+)"/)?.[1];
}
