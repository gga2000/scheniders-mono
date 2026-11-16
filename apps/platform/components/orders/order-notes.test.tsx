import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/types/order";
import { OrderNotes } from "./order-notes";

afterEach(cleanup);

function renderNotes(order: Partial<Order>) {
    localStorage.setItem("schneiders_language", "ar");
    return render(
        <LanguageProvider>
            <OrderNotes isEditing={false} order={order as Order} formData={{}} updateFormData={() => {}} />
        </LanguageProvider>,
    );
}

describe("OrderNotes", () => {
    it("lets each note take its own text direction, so «إعادة طلب من #…» reads words first", () => {
        renderNotes({ notes: "Reorder from #1261008005", internal_notes: "اتصل بعد الظهر" });
        const reorder = screen.getByText(/إعادة طلب من/);
        expect(reorder.tagName).toBe("P");
        expect(reorder.getAttribute("dir")).toBe("auto");
        expect(screen.getByText("اتصل بعد الظهر").getAttribute("dir")).toBe("auto");
    });
});
