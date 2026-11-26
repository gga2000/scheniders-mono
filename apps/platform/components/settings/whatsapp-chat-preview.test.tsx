/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { WhatsAppChatPreview, renderWhatsAppText } from "./whatsapp-chat-preview";

afterEach(cleanup);

describe("WhatsAppChatPreview", () => {
    it("shows the message filled with the sample order, under the shop's name", () => {
        const { container } = render(<WhatsAppChatPreview content="هلا {customer_name}" storeName="متجر لمسة" emptyText="فارغ" />);
        expect(container.textContent).toContain("متجر لمسة");
        expect(container.textContent).toContain("هلا أحمد علي");
        expect(container.textContent).not.toContain("{customer_name}");
    });

    it("says what to do while the message is empty", () => {
        const { container } = render(<WhatsAppChatPreview content="  " storeName="x" emptyText="اكتب رسالتك" />);
        expect(container.textContent).toContain("اكتب رسالتك");
    });
});

describe("renderWhatsAppText", () => {
    it("draws WhatsApp's bold, italic and struck marks", () => {
        const { container } = render(<p>{renderWhatsAppText("*عرض* _اليوم_ ~بس~ 5*3")}</p>);
        expect(container.querySelector("strong")?.textContent).toBe("عرض");
        expect(container.querySelector("em")?.textContent).toBe("اليوم");
        expect(container.querySelector("s")?.textContent).toBe("بس");
        expect(container.textContent).toContain("5*3");
    });
});
