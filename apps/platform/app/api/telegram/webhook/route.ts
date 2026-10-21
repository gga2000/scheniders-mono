import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { extractOrderFromImage } from "@/lib/gemini-order-extractor";
import {
    sendMessage,
    editMessageText,
    answerCallbackQuery,
    downloadFile,
} from "@/lib/telegram";
import { createOrderForTenant } from "@/lib/order-service";
import type { Order, OrderItem } from "@/types/order";
import {
    matchProductReply,
    type CatalogProduct,
} from "@/lib/telegram-product-match";

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── Telegram update shapes ──────────────────────────────────────────────────

interface TgUser {
    id: number;
    username?: string;
    first_name?: string;
}

interface TgChat {
    id: number;
}

interface TgPhotoSize {
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
}

interface TgMessage {
    message_id: number;
    from?: TgUser;
    chat: TgChat;
    text?: string;
    photo?: TgPhotoSize[];
    document?: { file_id: string; mime_type?: string };
    caption?: string;
}

interface TgCallbackQuery {
    id: string;
    from: TgUser;
    message?: TgMessage;
    data?: string;
}

interface TgUpdate {
    update_id: number;
    message?: TgMessage;
    callback_query?: TgCallbackQuery;
}

interface ExtractedCustomer {
    customer_name: string;
    phone: string;
    secondary_phone: string;
    city: string;
    address: string;
}

interface EmployeeLink {
    user_profile_id: string;
    tenant_id: string;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected) {
        const got = req.headers.get("x-telegram-bot-api-secret-token");
        if (got !== expected) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    }

    let update: TgUpdate;
    try {
        update = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Telegram retries any non-200 response. We always 200 — failures surface
    // in the chat (so the employee knows) and in server logs (so we know).
    try {
        if (update.callback_query) {
            await handleCallback(update.callback_query);
        } else if (update.message) {
            await handleMessage(update.message);
        }
    } catch (err) {
        console.error("[telegram] handler error", err);
    }

    return NextResponse.json({ ok: true });
}

// ─── Message router ──────────────────────────────────────────────────────────

async function handleMessage(msg: TgMessage) {
    const tgUser = msg.from;
    if (!tgUser) return;

    const text = (msg.text || "").trim();

    // Slash commands take precedence — they can cancel an in-flight pending order.
    if (text.startsWith("/start")) return handleStart(msg, text);
    if (text === "/whoami") return handleWhoami(msg);
    if (text === "/help") return sendMessage(msg.chat.id, helpText());
    if (text === "/cancel") return handleCancel(msg);

    // Auth check before anything else.
    const link = await getLink(tgUser.id);
    if (!link) {
        return sendMessage(
            msg.chat.id,
            "🔒 حسابك مو مربوط. اطلب من الأدمن كود ربط، وبعدها أرسل <code>/start الكود</code>."
        );
    }

    // Tenant membership and the user's profile must both still be active.
    // Suspended/removed employees and deactivated users (F-087) can't drive
    // orders into the tenant.
    const active = await getActiveMembership(link);
    if (!active) {
        return sendMessage(
            msg.chat.id,
            "🚫 حسابك معطّل في هذا المتجر. تواصل مع الأدمن."
        );
    }

    // If there's an awaiting-product pending order for this user, any text
    // reply is interpreted as a product pick.
    const pending = await getActivePending(tgUser.id, link.tenant_id);
    if (pending && text) {
        return handleProductReply(msg, link, pending, text);
    }

    // Otherwise treat it as a new screenshot.
    const fileId = pickImageFileId(msg);
    if (!fileId) {
        return sendMessage(
            msg.chat.id,
            "أرسل صورة لمحادثة الزبون وأنا أستخرج بيانات الطلب.\nاكتب /help للأوامر."
        );
    }

    await startNewOrderFromPhoto(msg, link, fileId);
}

// ─── Photo → Gemini → pending row ────────────────────────────────────────────

async function startNewOrderFromPhoto(
    msg: TgMessage,
    link: EmployeeLink,
    fileId: string
) {
    const working = await sendMessage(msg.chat.id, "🔍 جاري قراءة الصورة…");

    let buffer: Buffer;
    let mimeType: string;
    try {
        const dl = await downloadFile(fileId);
        buffer = dl.buffer;
        mimeType = dl.mimeType;
    } catch (err) {
        return editMessageText(
            msg.chat.id,
            working.message_id,
            `❌ تعذّر تنزيل الصورة: ${(err as Error).message}`
        );
    }

    let extracted: ExtractedCustomer;
    try {
        extracted = await extractOrderFromImage(buffer, mimeType);
    } catch (err) {
        return editMessageText(
            msg.chat.id,
            working.message_id,
            `❌ فشل التعرف على الصورة عبر Gemini: ${(err as Error).message}`
        );
    }

    const products = await loadProducts(link.tenant_id);
    if (products.length === 0) {
        return editMessageText(
            msg.chat.id,
            working.message_id,
            "❌ لا توجد منتجات متاحة في الكاتلوك حالياً."
        );
    }

    const supabase = createSupabaseServiceClient();

    // At most one in-flight pending per Telegram user. Older ones get cancelled
    // when a new screenshot arrives.
    await supabase
        .from("telegram_pending_orders")
        .update({
            cancelled_at: new Date().toISOString(),
            state: "cancelled",
        })
        .eq("telegram_user_id", msg.from!.id)
        .eq("state", "awaiting_product");

    const { error: insertErr } = await supabase
        .from("telegram_pending_orders")
        .insert({
            tenant_id: link.tenant_id,
            telegram_user_id: msg.from!.id,
            chat_id: msg.chat.id,
            message_id: working.message_id,
            user_profile_id: link.user_profile_id,
            extracted,
            state: "awaiting_product",
        });
    if (insertErr) {
        return editMessageText(
            msg.chat.id,
            working.message_id,
            `❌ تعذّر حفظ النتائج: ${insertErr.message}`
        );
    }

    await editMessageText(
        msg.chat.id,
        working.message_id,
        renderCustomerAndPicker(extracted, products)
    );
}

// ─── Product pick → order create ─────────────────────────────────────────────

async function handleProductReply(
    msg: TgMessage,
    link: EmployeeLink,
    pending: PendingRow,
    reply: string
) {
    const products = await loadProducts(link.tenant_id);
    const match = matchProductReply(reply, products);

    if (!match) {
        return sendMessage(
            msg.chat.id,
            `❓ لم أتمكن من مطابقة "<code>${escapeHtml(reply)}</code>" مع أي منتج. ` +
                `جاوب برقم المنتج من القائمة (مثلاً <code>3</code>) أو جزء من اسمه. ` +
                `أرسل /cancel للإلغاء.`
        );
    }

    const extracted = pending.extracted as ExtractedCustomer;
    const item: OrderItem = {
        name: match.product.name,
        quantity: match.quantity,
        price: match.product.price,
        product_id: match.product.id,
        is_ai_extracted: true,
    };

    const orderInput: Omit<Order, "id" | "created_at" | "updated_at"> = {
        order_id: "",
        customer_name: extracted.customer_name || "",
        phone: extracted.phone || "",
        secondary_phone: extracted.secondary_phone || undefined,
        city: extracted.city || undefined,
        address_details: extracted.address || undefined,
        items: [item],
        price: match.product.price * match.quantity,
        status: "confirmed",
        priority: "normal",
        payment_status: "cod",
        is_return: false,
        is_replacement: false,
        is_archived: false,
        source: "telegram",
    };

    const result = await createOrderForTenant(orderInput, link.tenant_id);
    if (!result.success || !result.data) {
        return sendMessage(
            msg.chat.id,
            `❌ تعذّر إنشاء الطلب: ${result.error || "خطأ غير معروف"}`
        );
    }

    const supabase = createSupabaseServiceClient();
    await supabase
        .from("telegram_pending_orders")
        .update({
            confirmed_at: new Date().toISOString(),
            confirmed_order_id: result.data.id,
            state: "completed",
        })
        .eq("id", pending.id);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "";
    const linkLine = siteUrl ? `\n${siteUrl}/orders/${result.data.id}` : "";

    return sendMessage(
        msg.chat.id,
        `✅ <b>تم تأكيد الطلب ${result.data.order_id}.</b>\n` +
            `${escapeHtml(match.product.name)} ×${match.quantity} — <b>${formatIQD(orderInput.price)}</b>${linkLine}\n\n` +
            `أرسل صورة جديدة لبدء طلب آخر.`
    );
}

// ─── Slash commands ──────────────────────────────────────────────────────────

async function handleCancel(msg: TgMessage) {
    if (!msg.from) return;
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
        .from("telegram_pending_orders")
        .update({
            cancelled_at: new Date().toISOString(),
            state: "cancelled",
        })
        .eq("telegram_user_id", msg.from.id)
        .eq("state", "awaiting_product")
        .select("id");
    const n = data?.length || 0;
    return sendMessage(
        msg.chat.id,
        n > 0
            ? "❌ تم الإلغاء. أرسل صورة أخرى لبدء طلب جديد."
            : "لا يوجد طلب قيد التحضير."
    );
}

async function handleStart(msg: TgMessage, text: string) {
    const tgUser = msg.from!;
    const parts = text.split(/\s+/);
    const code = parts[1]?.trim();

    if (!code) {
        return sendMessage(
            msg.chat.id,
            "👋 مرحباً. لربط حسابك بتليكرام، اطلب من الأدمن كود ربط ثم أرسل:\n\n<code>/start الكود</code>"
        );
    }

    const supabase = createSupabaseServiceClient();
    const { data: codeRow, error: codeErr } = await supabase
        .from("telegram_link_codes")
        .select("code, tenant_id, user_profile_id, expires_at, used_at")
        .eq("code", code.toUpperCase())
        .maybeSingle();

    if (codeErr || !codeRow) {
        return sendMessage(msg.chat.id, "❌ هذا الكود غير صحيح.");
    }
    if (codeRow.used_at) {
        return sendMessage(msg.chat.id, "❌ هذا الكود تم استعماله من قبل.");
    }
    if (new Date(codeRow.expires_at).getTime() < Date.now()) {
        return sendMessage(msg.chat.id, "❌ انتهت صلاحية الكود.");
    }

    // Defence in depth: the employee may have been removed from the tenant, or
    // deactivated (F-087), between when the code was issued and when the bot is
    // used.
    const active = await getActiveMembership({
        tenant_id: codeRow.tenant_id,
        user_profile_id: codeRow.user_profile_id,
    });
    if (!active) {
        return sendMessage(msg.chat.id, "❌ الموظف لم يعد جزءاً من هذا المتجر.");
    }

    const { error: linkErr } = await supabase
        .from("telegram_employee_link")
        .upsert({
            telegram_user_id: tgUser.id,
            tenant_id: codeRow.tenant_id,
            user_profile_id: codeRow.user_profile_id,
            telegram_username: tgUser.username || null,
            linked_at: new Date().toISOString(),
        });
    if (linkErr) {
        return sendMessage(msg.chat.id, `❌ فشلت عملية الربط: ${linkErr.message}`);
    }

    await supabase
        .from("telegram_link_codes")
        .update({ used_at: new Date().toISOString(), used_by_tg_id: tgUser.id })
        .eq("code", codeRow.code);

    return sendMessage(
        msg.chat.id,
        "✅ تم الربط! أرسل صورة لمحادثة الزبون وأنا أحوّلها لطلب."
    );
}

async function handleWhoami(msg: TgMessage) {
    const link = await getLink(msg.from!.id);
    if (!link) {
        return sendMessage(
            msg.chat.id,
            "حسابك مو مربوط. أرسل <code>/start الكود</code>."
        );
    }
    const supabase = createSupabaseServiceClient();
    const [{ data: profile }, { data: tenant }] = await Promise.all([
        supabase
            .from("user_profiles")
            .select("display_name, role")
            .eq("id", link.user_profile_id)
            .maybeSingle(),
        supabase
            .from("tenants")
            .select("business_name")
            .eq("id", link.tenant_id)
            .maybeSingle(),
    ]);
    return sendMessage(
        msg.chat.id,
        `مربوط باسم <b>${profile?.display_name || link.user_profile_id}</b> ` +
            `(${profile?.role || "?"}) في متجر <b>${tenant?.business_name || link.tenant_id}</b>.`
    );
}

// Forward-compat: original used inline Confirm/Cancel buttons; current flow
// is text-driven. We still ack callbacks so the spinner clears.
async function handleCallback(cb: TgCallbackQuery) {
    await answerCallbackQuery(cb.id);
}

// ─── DB helpers (service role) ───────────────────────────────────────────────

interface PendingRow {
    id: number;
    telegram_user_id: number;
    chat_id: number;
    message_id: number;
    user_profile_id: string;
    tenant_id: string;
    extracted: unknown;
    state: string;
}

async function getActivePending(
    telegramUserId: number,
    tenantId: string
): Promise<PendingRow | null> {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
        .from("telegram_pending_orders")
        .select(
            "id, telegram_user_id, chat_id, message_id, user_profile_id, tenant_id, extracted, state"
        )
        .eq("telegram_user_id", telegramUserId)
        .eq("tenant_id", tenantId)
        .eq("state", "awaiting_product")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    return (data as PendingRow | null) || null;
}

async function getLink(telegramUserId: number): Promise<EmployeeLink | null> {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
        .from("telegram_employee_link")
        .select("user_profile_id, tenant_id")
        .eq("telegram_user_id", telegramUserId)
        .maybeSingle();
    return (data as EmployeeLink | null) || null;
}

/**
 * True only when the linked user is an active member of the tenant AND their
 * profile is active: the same rule as get_user_tenant_ids() and
 * is_tenant_admin() in the database (coalesce(user_profiles.is_active, true)).
 * A missing membership or profile, or a failed read, refuses.
 */
async function getActiveMembership(link: EmployeeLink): Promise<boolean> {
    const supabase = createSupabaseServiceClient();
    const [membership, profile] = await Promise.all([
        supabase
            .from("tenant_members")
            .select("status")
            .eq("tenant_id", link.tenant_id)
            .eq("user_id", link.user_profile_id)
            .eq("status", "active")
            .maybeSingle(),
        supabase
            .from("user_profiles")
            .select("is_active")
            .eq("id", link.user_profile_id)
            .maybeSingle(),
    ]);
    if (membership.error || profile.error) return false;
    if (!membership.data || !profile.data) return false;
    return profile.data.is_active !== false;
}

async function loadProducts(tenantId: string): Promise<CatalogProduct[]> {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("tenant_id", tenantId)
        .eq("is_archived", false)
        .or("is_supply.is.null,is_supply.eq.false")
        .order("name");
    if (error || !data) return [];
    return data.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price) || 0,
    }));
}

// ─── Misc helpers ────────────────────────────────────────────────────────────

function pickImageFileId(msg: TgMessage): string | null {
    if (msg.photo && msg.photo.length > 0) {
        const largest = [...msg.photo].sort(
            (a, b) => b.width * b.height - a.width * a.height
        )[0];
        return largest.file_id;
    }
    if (msg.document && msg.document.mime_type?.startsWith("image/")) {
        return msg.document.file_id;
    }
    return null;
}

function formatIQD(n: number): string {
    return new Intl.NumberFormat("en-US").format(Math.round(n)) + " IQD";
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
    );
}

function renderCustomerAndPicker(
    e: ExtractedCustomer,
    products: CatalogProduct[]
): string {
    const row = (label: string, val: string) =>
        `<b>${label}:</b> ${escapeHtml(val) || "—"}`;
    const list = products
        .map((p, i) => `${i + 1}. ${escapeHtml(p.name)} — <b>${formatIQD(p.price)}</b>`)
        .join("\n");
    return [
        "📋 <b>بيانات الزبون</b>",
        row("الاسم", e.customer_name),
        row("الهاتف", e.phone),
        row("هاتف ثاني", e.secondary_phone),
        row("المحافظة", e.city),
        row("العنوان", e.address),
        "",
        "🛒 <b>اختر المنتج</b> (جاوب برقم، مثل <code>3</code>، أو اسم المنتج. للكميات: <code>3 x 2</code>)",
        "",
        list,
        "",
        "أرسل /cancel للإلغاء.",
    ].join("\n");
}

function helpText(): string {
    return [
        "📸 أرسل صورة لمحادثة الزبون وأنا أحوّلها لطلب.",
        "",
        "<b>الأوامر</b>",
        "<code>/start الكود</code> — ربط حسابك بتليكرام",
        "<code>/whoami</code> — معرفة الحساب المربوط",
        "<code>/cancel</code> — إلغاء الطلب الحالي",
        "<code>/help</code> — هذه الرسالة",
        "",
        "<b>بعد إرسال الصورة</b>، جاوب برقم المنتج (مثلاً <code>3</code>)، أو اسم المنتج، أو <code>3 x 2</code> للكميات.",
    ].join("\n");
}
