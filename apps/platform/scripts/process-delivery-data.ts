import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Format phone number for matching
function formatPhone(phone: number | string | undefined): string {
    if (!phone) return '';
    let phoneStr = String(phone).replace(/\D/g, '');

    // Iraqi numbers starting with 7 need 964 prefix
    if (phoneStr.length === 10 && phoneStr.startsWith('7')) {
        phoneStr = '964' + phoneStr;
    }

    return '+' + phoneStr;
}

// Extract city from address
function extractCity(address: string): string {
    if (!address || typeof address !== 'string') return 'بغداد';

    const cities = [
        'بغداد', 'البصرة', 'الموصل', 'أربيل', 'كركوك', 'النجف', 'كربلاء',
        'الحلة', 'الديوانية', 'الكوت', 'واسط', 'ذي قار', 'ميسان', 'المثنى',
        'الناصرية', 'السماوة', 'ديالى', 'صلاح الدين', 'الأنبار', 'نينوى'
    ];

    for (const city of cities) {
        if (address.includes(city)) return city;
    }

    // Try to extract from "City - Location" format
    const parts = address.split('-');
    if (parts.length > 0) {
        const firstPart = parts[0].trim();
        if (firstPart.length > 0 && firstPart.length < 30) {
            return firstPart;
        }
    }

    return 'بغداد';
}

// Map delivery status to our app status
function mapStatus(deliveryStatus: string, notes: string = ''): string {
    const status = deliveryStatus?.toLowerCase() || '';
    const notesLower = notes?.toLowerCase() || '';

    // Check for return orders in notes
    if (notesLower.includes('returned order') || notesLower.includes('return')) {
        return 'rejected';
    }

    if (status === 'delivered') return 'delivered';
    if (status === 'partial') return 'delivered'; // Partial delivery is still delivered
    if (status === 'returned' || status === 'rejected') return 'rejected';

    return 'confirmed';
}

async function processDeliveryDataV2() {
    console.log('📂 Reading delivery company Excel file...');

    const workbook = XLSX.readFile('/Users/ali/Scheniders/please double check if they are correct.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelData = XLSX.utils.sheet_to_json(sheet) as any[];

    console.log(`📊 Found ${excelData.length} orders in delivery data`);

    // Get all existing orders from database
    const { data: existingOrders, error: fetchError } = await supabase
        .from('orders')
        .select('id, order_id, phone, status, price, sequence_number, notes');

    if (fetchError) {
        console.error('❌ Error fetching orders:', fetchError.message);
        return;
    }

    console.log(`📦 Found ${existingOrders?.length || 0} existing orders in database`);

    // Create lookup maps
    const ordersByShipmentId = new Map<string, any>();
    const ordersByPhone = new Map<string, any>();

    existingOrders?.forEach(order => {
        // Match by order_id base number (extract digits)
        const matches = order.order_id.match(/\d+/g);
        if (matches) {
            matches.forEach((num: string) => {
                if (num.length >= 4) { // Only significant numbers
                    ordersByShipmentId.set(num, order);
                }
            });
        }
        // Also match by phone
        if (order.phone) {
            ordersByPhone.set(order.phone, order);
        }
    });

    // Get max sequence number for new orders
    const maxSeq = Math.max(0, ...(existingOrders || []).map(o => o.sequence_number || 0));
    let nextSeqNum = maxSeq + 1;

    const stats = {
        matched: 0,
        updated: 0,
        newOrders: 0,
        skipped: 0,
        errors: 0
    };

    const newOrdersAdded: any[] = [];
    const ordersNeedingAttention: string[] = [];

    for (const row of excelData) {
        const shipmentNo = String(row['Shipment No.'] || '');
        const phone = formatPhone(row['Phone']);
        const address = String(row['Address'] || '');
        const status = row['Status'];
        const notes = String(row['Notes'] || '');
        const totalAmount = Number(row['Total Amount']) || 0;
        const deliveryFee = Number(row['Delivery Fee']) || 0;
        const netToMerchant = Number(row['Net to Merchant']) || 0;

        // Try to find matching order
        let matchedOrder = ordersByShipmentId.get(shipmentNo);
        if (!matchedOrder && phone) {
            matchedOrder = ordersByPhone.get(phone);
        }

        // Check if needs attention (add to notes)
        const attentionFlags: string[] = [];
        if (netToMerchant < 0) attentionFlags.push('⚠️ RETURN');
        if (notes.toLowerCase().includes('check')) attentionFlags.push('⚠️ NEEDS CHECK');
        if (notes.toLowerCase().includes('price change')) attentionFlags.push('⚠️ PRICE CHANGED');

        if (matchedOrder) {
            stats.matched++;

            const newStatus = mapStatus(status, notes);
            const updates: any = {};

            // Update status if it changed to delivered or rejected
            if (matchedOrder.status !== newStatus &&
                (newStatus === 'delivered' || newStatus === 'rejected')) {
                updates.status = newStatus;

                if (newStatus === 'delivered') {
                    updates.delivered_at = new Date().toISOString();
                }
            }

            // Append attention flags to notes if any
            if (attentionFlags.length > 0) {
                const existingNotes = matchedOrder.notes || '';
                const flagsText = attentionFlags.join(' | ');
                if (!existingNotes.includes(flagsText)) {
                    updates.notes = existingNotes ? `${existingNotes} | ${flagsText}` : flagsText;
                    ordersNeedingAttention.push(`${matchedOrder.order_id}: ${flagsText}`);
                }
            }

            if (Object.keys(updates).length > 0) {
                const { error: updateError } = await supabase
                    .from('orders')
                    .update(updates)
                    .eq('id', matchedOrder.id);

                if (updateError) {
                    console.error(`❌ Error updating ${shipmentNo}:`, updateError.message);
                    stats.errors++;
                } else {
                    stats.updated++;
                    console.log(`✅ Updated ${shipmentNo} -> ${newStatus}${attentionFlags.length > 0 ? ' [ATTENTION]' : ''}`);
                }
            } else {
                stats.skipped++;
            }
        } else {
            // Create new order
            const newStatus = mapStatus(status, notes);
            const city = extractCity(address);

            // Generate order ID (just the shipment number, no prefix)
            const orderId = shipmentNo;

            // Build notes with delivery info and attention flags
            let orderNotes = `[Delivery Import] Shipment: ${shipmentNo}`;
            if (notes) orderNotes += ` | Notes: ${notes}`;
            orderNotes += ' | ⚠️ NEEDS REVIEW: Missing customer name and product info';

            const newOrder = {
                order_id: orderId,
                sequence_number: nextSeqNum,
                customer_name: `Customer ${shipmentNo}`, // Placeholder - needs manual entry
                phone: phone || `+964${shipmentNo.slice(-10)}`, // Use shipment as fallback
                city: city,
                address_details: address,
                status: newStatus,
                price: totalAmount,
                delivery_fee: deliveryFee,
                source: 'lightfunnels', // Use existing source type
                notes: orderNotes,
                items: [], // No product info - needs manual entry
                payment_status: notes.toLowerCase().includes('digital') ? 'prepaid' : 'cod',
                priority: 'normal',
                is_return: newStatus === 'rejected',
                is_archived: false,
            };

            if (newStatus === 'delivered') {
                (newOrder as any).delivered_at = new Date().toISOString();
            }

            const { error: insertError } = await supabase
                .from('orders')
                .insert(newOrder);

            if (insertError) {
                console.error(`❌ Error creating ${shipmentNo}:`, insertError.message);
                stats.errors++;
            } else {
                stats.newOrders++;
                nextSeqNum++;
                newOrdersAdded.push({
                    order_id: orderId,
                    shipment_no: shipmentNo,
                    phone,
                    status: newStatus
                });
                console.log(`🆕 Created ${orderId} for shipment ${shipmentNo}`);
            }
        }
    }

    console.log('\n📊 Processing Summary:');
    console.log(`   ✅ Matched existing orders: ${stats.matched}`);
    console.log(`   📝 Updated orders: ${stats.updated}`);
    console.log(`   🆕 New orders created: ${stats.newOrders}`);
    console.log(`   ⏭️ Skipped (no changes): ${stats.skipped}`);
    console.log(`   ❌ Errors: ${stats.errors}`);

    if (newOrdersAdded.length > 0) {
        console.log('\n🆕 New orders added (need manual review):');
        newOrdersAdded.forEach(o => {
            console.log(`   ${o.order_id} | ${o.phone} | ${o.status}`);
        });
    }

    if (ordersNeedingAttention.length > 0) {
        console.log('\n⚠️ Orders flagged for attention:');
        ordersNeedingAttention.forEach(o => console.log(`   ${o}`));
    }
}

processDeliveryDataV2().catch(console.error);
