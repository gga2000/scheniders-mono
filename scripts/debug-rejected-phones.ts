
import { supabase } from "../lib/supabase";

async function checkRejectedPhones() {
    const { data: orders, error } = await supabase
        .from("orders")
        .select("id, order_id, phone, status, created_at")
        .eq("status", "rejected")
        .order("created_at", { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error:", error);
        return;
    }

    console.log("Last 10 Rejected Orders:");
    orders?.forEach(o => {
        console.log(`- Order #${o.order_id}: Phone '${o.phone}'`);
    });
}

checkRejectedPhones();
