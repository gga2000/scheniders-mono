import Link from "next/link";
import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import type { Tenant, Category } from "@/lib/types";
import { CartButton } from "./CartButton";

interface Props {
  tenant: Tenant;
  categories?: Category[];
  variant?: "default" | "minimal" | "elegant";
}

export function StoreHeader({ tenant, categories = [], variant = "default" }: Props) {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3">
            {tenant.branding?.logo_url ? (
              <Image
                src={tenant.branding.logo_url}
                alt={tenant.business_name}
                width={40}
                height={40}
                className="object-contain rounded"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-brand-primary flex items-center justify-center text-white font-bold">
                {tenant.business_name.charAt(0)}
              </div>
            )}
            <span className="font-bold text-lg text-zinc-900">
              {tenant.business_name}
            </span>
          </Link>

          {variant !== "minimal" && categories.length > 0 && (
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="text-zinc-700 hover:text-brand-primary transition">
                الرئيسية
              </Link>
              {categories.slice(0, 5).map((cat) => (
                <Link
                  key={cat.id}
                  href={`/categories/${cat.slug}`}
                  className="text-zinc-700 hover:text-brand-primary transition"
                >
                  {cat.name}
                </Link>
              ))}
            </nav>
          )}

          <CartButton />
        </div>
      </div>
    </header>
  );
}
