// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/** The console: what reading the file answers, and every JSON post the run makes. */
const consoleApi = vi.hoisted(() => ({
  readAnswer: null as unknown,
  posts: [] as Array<{ url: string; body: Record<string, unknown> }>,
  refuseImport: null as string | null,
  /** A promise the images call waits on, so a test can leave mid-run. */
  imagesGate: null as Promise<void> | null,
}));
const toasts = vi.hoisted(() => ({ success: [] as unknown[][], error: [] as unknown[][] }));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toasts.success.push(args),
    error: (...args: unknown[]) => toasts.error.push(args),
  },
}));
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: async (url: string, init: RequestInit) => {
    expect(url).toBe("/api/merchants/s1/product-import/read");
    expect(init.body).toBeInstanceOf(FormData);
    return new Response(JSON.stringify(consoleApi.readAnswer), { status: 200 });
  },
}));
vi.mock("@/components/merchants/detail/action-ui", async () => {
  const { useEffect, useRef } = await import("react");
  return {
  AnswerLost: class AnswerLost extends Error {},
  useStillDrawn: () => {
    const drawn = useRef(true);
    useEffect(() => {
      drawn.current = true;
      return () => {
        drawn.current = false;
      };
    }, []);
    return () => drawn.current;
  },
  postJson: async (url: string, body: Record<string, unknown>) => {
    consoleApi.posts.push({ url, body });
    if (url.endsWith("/product-import")) {
      if (consoleApi.refuseImport) throw new Error(consoleApi.refuseImport);
      const products = body.products as Array<{ key: string }>;
      return { created: products.map((p, n) => ({ key: p.key, product_id: `00000000-0000-4000-8000-00000000000${n}` })), skipped: [] };
    }
    if (consoleApi.imagesGate) await consoleApi.imagesGate;
    return { saved: 1, imageUrl: "x", failed: [{ link: "https://a.example/page", reason: "The link is not a JPEG, PNG, WebP or GIF image" }] };
  },
  };
});

import { ProductImportFlow } from "./product-import-flow";

function leaving(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  consoleApi.posts = [];
  consoleApi.refuseImport = null;
  consoleApi.imagesGate = null;
  toasts.success = [];
  toasts.error = [];
  consoleApi.readAnswer = {
    file: {
      sheet: "Sheet1",
      headers: ["الاسم", "السعر", "الحجم", "صورة", "ملاحظة"],
      rows: [
        ["عطر عود", "35,000", "50 مل", "https://a.example/1.jpg https://a.example/page", "x"],
        ["عطر عود", "60,000", "100 مل", "", ""],
        ["مسك", "", "", "", ""],
        ["بخور", "8000", "", "", ""],
      ],
      firstRow: 2,
    },
    mapping: ["name", "price", "size", "images", null],
    shop: { names: ["بخور"], skus: [], barcodes: [], noImages: [] },
  };
});
afterEach(cleanup);

async function readTheFile() {
  const view = render(createElement(ProductImportFlow, { shopId: "s1", shopName: "Kawkab" }));
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  fireEvent.change(input, { target: { files: [new File(["x"], "products.xlsx")] } });
  await screen.findByText("Match the file's columns");
  return view;
}

describe("ProductImportFlow", () => {
  it("reads the file, shows the guessed columns, and checks every row before anything is saved", async () => {
    await readTheFile();
    expect((screen.getByLabelText('What "الاسم" holds') as HTMLSelectElement).value).toBe("name");
    expect((screen.getByLabelText('What "ملاحظة" holds') as HTMLSelectElement).value).toBe("");

    fireEvent.click(screen.getByText("Check the rows"));
    const strip = screen.getByLabelText("What the import adds");
    expect(within(strip).getByText("Products to add").nextSibling?.textContent).toBe("1");
    expect(within(strip).getByText("Rows with a problem: left out").nextSibling?.textContent).toBe("1");
    expect(within(strip).getByText("Already in the shop: left out").nextSibling?.textContent).toBe("1");
    expect(screen.getByText("35,000 to 60,000")).toBeTruthy();
    expect(screen.getByText("No price")).toBeTruthy();
    expect(consoleApi.posts).toHaveLength(0);
  });

  it("asks for a name and a price column before the check", async () => {
    await readTheFile();
    fireEvent.change(screen.getByLabelText('What "السعر" holds'), { target: { value: "" } });
    expect((screen.getByText("Check the rows") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Choose the column that holds the price.")).toBeTruthy();
  });

  it("imports, then saves the images and names the links that gave none; leaving asks while it runs", async () => {
    await readTheFile();
    fireEvent.click(screen.getByText("Check the rows"));
    fireEvent.click(screen.getByText("Import 1 product"));
    expect(leaving()).toBe(true);

    await screen.findByText("Images: 1 of 2 saved.");
    expect(leaving()).toBe(false);
    expect(screen.getByText("Added 1 of 1 product.")).toBeTruthy();
    expect(screen.getByText(/The link is not a JPEG, PNG, WebP or GIF image/)).toBeTruthy();
    expect(consoleApi.posts.map((p) => p.url)).toEqual([
      "/api/merchants/s1/product-import",
      "/api/merchants/s1/product-import/images",
    ]);
    expect(consoleApi.posts[0]?.body).toMatchObject({ fileName: "products.xlsx" });
    expect(consoleApi.posts[1]?.body).toEqual({
      productId: "00000000-0000-4000-8000-000000000000",
      links: ["https://a.example/1.jpg", "https://a.example/page"],
    });
    expect(screen.queryByText("Import 1 product")).toBeNull();
    expect(screen.getByText("Import another file")).toBeTruthy();
  });

  it("keeps going after staff leave by the sidebar, and says how it ended where they are", async () => {
    let open = () => {};
    consoleApi.imagesGate = new Promise((resolve) => {
      open = resolve;
    });
    const view = await readTheFile();
    fireEvent.click(screen.getByText("Check the rows"));
    fireEvent.click(screen.getByText("Import 1 product"));
    await waitFor(() => expect(consoleApi.posts.map((p) => p.url)).toContain("/api/merchants/s1/product-import/images"));
    view.unmount();
    open();
    await waitFor(() => expect(toasts.error).toHaveLength(1));
    expect(toasts.error[0]?.[0]).toBe("Kawkab: import done. Added 1 of 1 product. Images: 1 of 2 saved.");
    expect(toasts.success).toHaveLength(0);
  });

  it("gives the file's photos to a product the shop has with none, with nothing new to add", async () => {
    consoleApi.readAnswer = {
      file: { sheet: null, headers: ["الاسم", "السعر", "صورة"], rows: [["بخور", "8000", "https://a.example/b.jpg"]], firstRow: 2 },
      mapping: ["name", "price", "images"],
      shop: { names: ["بخور"], skus: [], barcodes: [], noImages: [{ id: "00000000-0000-4000-8000-0000000000b1", name: "بخور" }] },
    };
    await readTheFile();
    fireEvent.click(screen.getByText("Check the rows"));
    expect(screen.getByText("Already in the shop with no photo: only its photos are added")).toBeTruthy();
    fireEvent.click(screen.getByText("Add photos to 1 product"));
    await screen.findByText("Images: 1 of 1 saved.");
    expect(consoleApi.posts).toEqual([
      { url: "/api/merchants/s1/product-import/images", body: { productId: "00000000-0000-4000-8000-0000000000b1", links: ["https://a.example/b.jpg"] } },
    ]);
  });

  it("says why the shop refused a batch", async () => {
    consoleApi.refuseImport = "This shop is paused for new products. Lift the pause first.";
    await readTheFile();
    fireEvent.click(screen.getByText("Check the rows"));
    fireEvent.click(screen.getByText("Import 1 product"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Batch 1 of 1 was not added\. This shop is paused/));
  });
});
