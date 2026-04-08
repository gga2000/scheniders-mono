/**
 * Generate SQL to fix orders with product links
 */
const XLSX = require("xlsx");
const workbook = XLSX.readFile("../resources/excel_imports/jjj.xlsx");
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { raw: true });

// Product mapping from user's database
const products = {
    'بيرسيفيرون': 'eebd1ed9-cbf7-4296-9470-c52fa66e5252',
    'برسيفيرون': 'eebd1ed9-cbf7-4296-9470-c52fa66e5252',
    'ايدنتتي': '02a67e80-4a98-4fb5-91a6-5a866b40b56d',
    'ايدينتتي': '02a67e80-4a98-4fb5-91a6-5a866b40b56d',
    'رفقات': 'd6cb6a8c-8f61-47c3-8bb4-8e653a35e42c',
    'فيوجن': 'c092ad91-c70e-4b0d-a22b-a445126ba783',
    'بستاشيو': '65be51d4-7ac7-411f-b5f4-e2026ba6d9fe',
    'ايسكو': 'f1eb77e9-d9b0-4238-a331-d621fbbc92ec'
};

function findProductId(name) {
    for (const [keyword, id] of Object.entries(products)) {
        if (name.includes(keyword)) {
            return id;
        }
    }
    return null;
}

// Group by order ID
const orderMap = new Map();
data.forEach(row => {
    const orderId = String(row['رقم الوصل'] || '').trim();
    const price = Number(row['سعر المنتج']) || 0;
    const qty = Number(row['الكمية']) || 1;
    const productName = String(row['اسم المنتج'] || '').trim();
    const productId = findProductId(productName);

    if (!orderId) return;

    if (!orderMap.has(orderId)) {
        orderMap.set(orderId, { total: 0, items: [] });
    }
    const order = orderMap.get(orderId);
    order.total += price * qty;
    order.items.push({
        name: productName,
        price,
        quantity: qty,
        product_id: productId
    });
});

console.log("-- Complete SQL to fix orders with prices + product links");
console.log("-- Run this in Supabase SQL Editor\n");

for (const [orderId, orderData] of orderMap) {
    const itemsJson = JSON.stringify(orderData.items).replace(/'/g, "''");
    console.log("UPDATE orders SET price = " + orderData.total + ", items = '" + itemsJson + "'::jsonb WHERE order_id = '" + orderId + "' OR order_id LIKE '%" + orderId + "';");
}

console.log("\n-- Total: " + orderMap.size + " orders fixed with product_id links");
