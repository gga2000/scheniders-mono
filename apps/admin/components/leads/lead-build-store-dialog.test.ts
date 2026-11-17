// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Lead } from "@/types/leads";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-industries", () => ({ useIndustries: () => ({ data: [] }) }));
const build = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null }));
vi.mock("@/hooks/use-lead-mutations", () => ({ useBuildStore: () => build }));

import { LeadBuildStoreDialog } from "./lead-build-store-dialog";

/*
 * The Build Store form started over whenever the lead page passed a new lead
 * object: a colleague's edit or a refetch when the window regains focus wiped
 * the name and up to ten typed products. It now starts from the lead only
 * when it opens.
 */

const lead = (over: Partial<Lead> = {}): Lead =>
  ({ id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f", merchant_name: "Kawkab", industry_id: null, ...over }) as Lead;

const dialog = (isOpen: boolean, l: Lead) => createElement(LeadBuildStoreDialog, { isOpen, onClose: () => {}, lead: l });
const nameBox = () => screen.getByPlaceholderText("e.g. Zara Baghdad") as HTMLInputElement;

afterEach(() => {
  cleanup();
  build.mutate.mockClear();
  build.isError = false;
  build.error = null;
});

describe("LeadBuildStoreDialog: the form starts from the lead only when it opens", () => {
  it("keeps what was typed when the lead is read again while the dialog is open", () => {
    const view = render(dialog(true, lead()));
    expect(nameBox().value).toBe("Kawkab");

    fireEvent.change(nameBox(), { target: { value: "Kawkab Baghdad" } });
    view.rerender(dialog(true, lead({ merchant_name: "Kawkab (edited by a colleague)" })));

    expect(nameBox().value).toBe("Kawkab Baghdad");
  });

  it("starts again from the lead the next time it opens", () => {
    const view = render(dialog(true, lead()));
    fireEvent.change(nameBox(), { target: { value: "Typed and left" } });

    view.rerender(dialog(false, lead()));
    view.rerender(dialog(true, lead({ merchant_name: "Kawkab Store" })));

    expect(nameBox().value).toBe("Kawkab Store");
  });
});

describe("LeadBuildStoreDialog: a refusal is seen, and a wrong image link is never sent", () => {
  const advanced = (image: string) => {
    render(dialog(true, lead()));
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByPlaceholderText("Product name"), { target: { value: "Abaya" } });
    fireEvent.change(screen.getByPlaceholderText("Image URL (optional)"), { target: { value: image } });
    fireEvent.click(screen.getByText("Create Store"));
  };

  it("points at an image that is not a full link and sends nothing", () => {
    advanced("photo.jpg");
    expect((screen.getByPlaceholderText("Image URL (optional)") as HTMLInputElement).type).toBe("url");
    expect(build.mutate).not.toHaveBeenCalled();
  });

  it("points at a link that is not a web link (ftp, data) and sends nothing, as the server would refuse it", () => {
    advanced("ftp://cdn.example.com/abaya.jpg");
    expect(build.mutate).not.toHaveBeenCalled();
  });

  it("sends a full image link", () => {
    advanced("https://cdn.example.com/abaya.jpg");
    expect(build.mutate).toHaveBeenCalledTimes(1);
    expect(build.mutate.mock.calls[0][0].data.products).toEqual([{ name: "Abaya", price: 0, image_url: "https://cdn.example.com/abaya.jpg" }]);
  });

  it("brings the server's refusal into view, as an alert", () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    build.isError = true;
    build.error = new Error("Each product needs a name.");
    render(dialog(true, lead()));
    expect(screen.getByRole("alert").textContent).toBe("Each product needs a name.");
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("holds each text to what the server takes", () => {
    render(dialog(true, lead()));
    expect(nameBox().maxLength).toBe(200);
  });
});
