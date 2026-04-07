import Link from "next/link";
import type { Tenant } from "@/lib/types";

export function StoreFooter({ tenant }: { tenant: Tenant }) {
  const c = tenant.store_config?.contact;
  return (
    <footer className="mt-16 bg-zinc-900 text-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="font-bold text-xl mb-3">{tenant.business_name}</h3>
          <p className="text-sm text-zinc-400">
            {tenant.address && tenant.city
              ? `${tenant.address}, ${tenant.city}`
              : tenant.city ?? ""}
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-3">روابط</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/" className="hover:text-brand-primary">
                الرئيسية
              </Link>
            </li>
            <li>
              <Link href="/cart" className="hover:text-brand-primary">
                السلة
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold mb-3">تواصل معنا</h4>
          <ul className="space-y-2 text-sm">
            {tenant.contact_phone && <li>📞 {tenant.contact_phone}</li>}
            {tenant.contact_email && <li>✉️ {tenant.contact_email}</li>}
            {c?.whatsapp_number && (
              <li>
                <a
                  href={`https://wa.me/${c.whatsapp_number}`}
                  className="hover:text-brand-primary"
                  target="_blank"
                  rel="noreferrer"
                >
                  واتساب
                </a>
              </li>
            )}
            {c?.instagram && (
              <li>
                <a href={c.instagram} className="hover:text-brand-primary" target="_blank" rel="noreferrer">
                  Instagram
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-500">
        مدعوم بواسطة <span className="text-brand-primary">Scheniders</span>
      </div>
    </footer>
  );
}
