
import { fraudDetector } from "../lib/fraud-detector";
import { supabase } from "../lib/supabase";

async function testRisk() {
    const phone = "07812346938";
    console.log(`Testing risk for phone: ${phone}`);

    // Manual Logic Replication
    const normalizePhone = (p: string) => {
        let normalized = p.replace(/\D/g, "");
        if (normalized.startsWith("964")) normalized = normalized.slice(3);
        if (normalized.startsWith("0")) normalized = normalized.slice(1);
        return normalized;
    };

    const normalizedPhone = normalizePhone(phone);
    const phoneVariations = [
        normalizedPhone,
        `0${normalizedPhone}`,
        `964${normalizedPhone}`
    ];
    // Format for Supabase query: (val1,val2,val3)
    const variationString = `(${phoneVariations.join(',')})`;
    console.log(`Generated Variations: ${variationString}`);

    try {
        console.log("Running Query...");
        const { data: orders, error } = await supabase
            .from("orders")
            .select("id, status, created_at, order_id, phone")
            .or(`phone.in.${variationString},secondary_phone.in.${variationString}`)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Query Error:", error);
        } else {
            console.log(`Found ${orders?.length} orders.`);
            orders?.forEach(o => console.log(`- #${o.order_id} (${o.status}) - Phone: ${o.phone}`));
        }

    } catch (error) {
        console.error("Test failed:", error);
    }
}

testRisk();
