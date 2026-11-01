import { describe, expect, it } from "vitest";
import { fulfillLabelHTML } from "@/lib/fulfill-label";
import type { Order } from "@/lib/supabase";

const attack = `<img src=x onerror="alert(1)">`;

const order = {
    id: "o1",
    order_id: "122658090",
    customer_name: attack,
    phone: "07701234567",
    secondary_phone: `0770<script>x</script>`,
    city: `بغداد</div><script>steal()</script>`,
    items: [{ name: `<svg onload=alert(2)>`, quantity: 2, price: 1000 }],
} as unknown as Order;

describe("fulfillLabelHTML", () => {
    const html = fulfillLabelHTML(order);

    it("escapes every customer-supplied field", () => {
        expect(html).not.toContain("<img");
        expect(html).not.toContain("<script");
        expect(html).not.toContain("<svg");
        expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
        expect(html).toContain("&lt;svg onload=alert(2)&gt; ×2");
        expect(html).toContain("بغداد&lt;/div&gt;&lt;script&gt;steal()&lt;/script&gt;");
    });

    it("keeps the order number and Arabic text readable", () => {
        expect(html).toContain("#122658090");
        expect(html).toContain("بغداد");
    });
});
