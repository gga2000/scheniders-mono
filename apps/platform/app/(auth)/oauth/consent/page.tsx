import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, ShieldCheck, X } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { hasMcpAccess } from "@/lib/mcp/caller";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import { decideAuthorization } from "./actions";

export const metadata: Metadata = {
    title: "Connect Claude | Schenider",
};

export const dynamic = "force-dynamic";

const CAN = [
    { en: "Read orders, customers, products, stock and sales", ar: "قراءة الطلبات والعملاء والمنتجات والمخزون والمبيعات" },
    { en: "Change order status, edit orders and add notes", ar: "تغيير حالة الطلبات وتعديلها وإضافة ملاحظات" },
    { en: "Create new orders with catalog prices", ar: "إنشاء طلبات جديدة بأسعار المنتجات" },
];

const CANNOT = [
    { en: "Delete anything", ar: "حذف أي شيء" },
    { en: "Touch team, permissions, wallet, billing or salaries", ar: "تعديل الفريق أو الصلاحيات أو المحفظة أو الاشتراك أو الرواتب" },
];

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <main className="min-h-screen flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-md rounded-3xl bg-white/90 backdrop-blur shadow-[0_20px_60px_-20px_rgba(30,30,30,0.25)] border border-black/5 p-6 sm:p-8">
                {children}
            </div>
        </main>
    );
}

function Message({ title, titleAr, body }: { title: string; titleAr: string; body: string }) {
    return (
        <Shell>
            <h1 className="text-xl font-semibold text-[#1E1E1E]">{title}</h1>
            <p className="mt-1 text-base text-[#1E1E1E]/80" lang="ar">{titleAr}</p>
            <p className="mt-4 text-sm text-[#1E1E1E]/60">{body}</p>
        </Shell>
    );
}

export default async function OAuthConsentPage({
    searchParams,
}: {
    searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
    const { authorization_id: authorizationId, error: errorParam } = await searchParams;
    if (!authorizationId) {
        return <Message title="This link is incomplete" titleAr="الرابط غير مكتمل" body="Start the connection again from Claude." />;
    }

    const supabase = await createSupabaseServerClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        redirect(`/login?returnTo=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);
    }

    if (!(await hasMcpAccess(user.id))) {
        return (
            <Message
                title="Claude isn't available for your account yet"
                titleAr="ربط Claude غير متاح لحسابك بعد"
                body="Connecting Claude to Schenider is in early access. You can close this page."
            />
        );
    }

    const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error || !details) {
        return (
            <Message
                title="This request has expired"
                titleAr="انتهت صلاحية الطلب"
                body="Start the connection again from Claude."
            />
        );
    }
    // Already approved before: Supabase hands back the redirect straight away.
    if (!("authorization_id" in details)) redirect(details.redirect_url);

    const active = await resolveActiveTenant(user.id);
    let storeName = "your store";
    if (active.ok) {
        const { data: tenant } = await supabase.from("tenants").select("business_name").eq("id", active.tenantId).maybeSingle();
        storeName = (tenant?.business_name as string | undefined) ?? storeName;
    }

    return (
        <Shell>
            <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1E1E1E] text-white">
                    <ShieldCheck className="h-5 w-5" aria-hidden />
                </span>
                <div>
                    <h1 className="text-xl font-semibold text-[#1E1E1E]">Connect {details.client.name}</h1>
                    <p className="text-sm text-[#1E1E1E]/60">to {storeName}</p>
                </div>
            </div>
            <p className="mt-4 text-base text-[#1E1E1E]/80" lang="ar">
                ربط {details.client.name} بمتجر {storeName}
            </p>

            {errorParam === "decision" && (
                <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                    That didn&apos;t go through. Try again. · لم تكتمل العملية، حاول مرة أخرى.
                </p>
            )}

            <section className="mt-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1E1E1E]/50">Claude will be able to</h2>
                <ul className="mt-2 space-y-2">
                    {CAN.map((item) => (
                        <li key={item.en} className="flex gap-2 text-sm text-[#1E1E1E]">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                            <span>
                                {item.en}
                                <span className="block text-[#1E1E1E]/60" lang="ar">{item.ar}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="mt-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[#1E1E1E]/50">Claude can never</h2>
                <ul className="mt-2 space-y-2">
                    {CANNOT.map((item) => (
                        <li key={item.en} className="flex gap-2 text-sm text-[#1E1E1E]">
                            <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
                            <span>
                                {item.en}
                                <span className="block text-[#1E1E1E]/60" lang="ar">{item.ar}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <p className="mt-5 text-xs text-[#1E1E1E]/50">
                Signed in as {user.email}. Every change Claude makes is saved in the activity log as &quot;via Claude&quot;.
            </p>

            <form action={decideAuthorization} className="mt-6 grid grid-cols-2 gap-3">
                <input type="hidden" name="authorization_id" value={authorizationId} />
                <button
                    type="submit"
                    name="decision"
                    value="deny"
                    className="h-11 rounded-xl border border-black/10 bg-white text-sm font-medium text-[#1E1E1E] transition-colors hover:bg-black/5"
                >
                    Cancel · إلغاء
                </button>
                <button
                    type="submit"
                    name="decision"
                    value="approve"
                    className="h-11 rounded-xl bg-[#1E1E1E] text-sm font-medium text-white transition-colors hover:bg-black"
                >
                    Allow · سماح
                </button>
            </form>
        </Shell>
    );
}
