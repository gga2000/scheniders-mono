import { StoreLink } from "@/lib/store-context";
import type { Tenant } from "@/lib/types";
import { MaterialIcon, ZigzagDivider } from "./primitives";

export function SchneidersFooter({ tenant }: { tenant: Tenant }) {
  const c = tenant.store_config?.contact;
  return (
    <footer className="mt-12 pb-32 bg-bk-surface border-t-4 border-bk-ink">
      <ZigzagDivider />
      <div className="px-5 py-8 space-y-6 max-w-md mx-auto">
        <div>
          <h3 className="font-display font-black text-2xl uppercase text-bk-ink mb-2">
            {tenant.business_name || "Schneiders"}
          </h3>
          <p className="font-body text-sm text-bk-ink/70 leading-relaxed">
            {tenant.address && tenant.city
              ? `${tenant.address}, ${tenant.city}`
              : tenant.city ?? "Baghdad, Iraq 🇮🇶"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm font-label font-bold">
          <div className="space-y-2">
            <p className="font-display font-black uppercase text-xs text-bk-ink/60 tracking-wider">
              Shop
            </p>
            <StoreLink href="/" className="block hover:underline">
              Home
            </StoreLink>
            <StoreLink href="/cart" className="block hover:underline">
              Cart
            </StoreLink>
            <StoreLink href="/search" className="block hover:underline">
              Search
            </StoreLink>
          </div>
          <div className="space-y-2">
            <p className="font-display font-black uppercase text-xs text-bk-ink/60 tracking-wider">
              Help
            </p>
            <StoreLink href="/faq" className="block hover:underline">
              FAQ
            </StoreLink>
            <StoreLink href="/contact" className="block hover:underline">
              Contact
            </StoreLink>
            <StoreLink href="/track" className="block hover:underline">
              Track order
            </StoreLink>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm font-label">
          <div className="space-y-2">
            <p className="font-display font-black uppercase text-xs text-bk-ink/60 tracking-wider">
              Policies
            </p>
            <StoreLink href="/policies/shipping" className="block hover:underline">
              Shipping
            </StoreLink>
            <StoreLink href="/policies/returns" className="block hover:underline">
              Returns
            </StoreLink>
            <StoreLink href="/policies/privacy" className="block hover:underline">
              Privacy
            </StoreLink>
            <StoreLink href="/policies/terms" className="block hover:underline">
              Terms
            </StoreLink>
          </div>
          <div className="space-y-2">
            <p className="font-display font-black uppercase text-xs text-bk-ink/60 tracking-wider">
              Contact
            </p>
            {tenant.contact_phone && (
              <a href={`tel:${tenant.contact_phone}`} className="block hover:underline">
                📞 {tenant.contact_phone}
              </a>
            )}
            {c?.whatsapp_number && (
              <a
                href={`https://wa.me/${c.whatsapp_number.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="block hover:underline"
              >
                💬 WhatsApp
              </a>
            )}
            {c?.instagram && (
              <a href={`https://instagram.com/${c.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="block hover:underline">
                <MaterialIcon name="photo_camera" className="text-base mr-1 align-middle" />
                Instagram
              </a>
            )}
            {c?.tiktok && (
              <a href={`https://tiktok.com/@${c.tiktok.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="block hover:underline">
                🎵 TikTok
              </a>
            )}
          </div>
        </div>

        <ZigzagDivider />

        <p className="font-body text-xs text-bk-ink/60 text-center">
          Made with <span className="text-bk-primary">♥</span> in Baghdad 🇮🇶
          <span className="block mt-1">© {new Date().getFullYear()} {tenant.business_name || "Schneiders"}</span>
        </p>
      </div>
    </footer>
  );
}
