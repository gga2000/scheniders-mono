import Link from "next/link";
import { BentoCard, ChunkyLink, MaterialIcon, Sticker } from "@/components/schneiders/primitives";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-candy-cream px-4 py-12">
      <div className="max-w-md w-full space-y-6">
        <BentoCard bg="pink" rotate={-3} className="p-10 text-white text-center relative overflow-hidden">
          <div className="absolute top-3 left-3">
            <Sticker bg="butter" rotate={-8} size="xs">Oops!</Sticker>
          </div>
          <h1 className="font-display font-black text-[120px] leading-[0.85] tracking-tight">
            404
          </h1>
          <p className="font-display font-black text-xl uppercase mt-3">
            This page is on vacation 🏖️
          </p>
          <p className="font-body text-sm text-white/90 mt-2">
            Maybe it moved. Maybe it never existed. Either way, let's get you somewhere better.
          </p>
        </BentoCard>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/"
            className="bento-card bg-candy-mint p-4 text-center rotate-[-1deg] hover:-translate-y-0.5 transition-transform"
          >
            <div className="text-3xl mb-1">🏠</div>
            <p className="font-display font-black uppercase text-sm">Go home</p>
          </Link>
          <Link
            href="search"
            className="bento-card bg-candy-butter p-4 text-center rotate-1 hover:-translate-y-0.5 transition-transform"
          >
            <div className="text-3xl mb-1">🔍</div>
            <p className="font-display font-black uppercase text-sm">Search</p>
          </Link>
          <Link
            href="cart"
            className="bento-card bg-candy-sky p-4 text-center rotate-1 hover:-translate-y-0.5 transition-transform"
          >
            <div className="text-3xl mb-1">🛍️</div>
            <p className="font-display font-black uppercase text-sm">Your cart</p>
          </Link>
          <Link
            href="contact"
            className="bento-card bg-candy-lilac p-4 text-center rotate-[-1deg] hover:-translate-y-0.5 transition-transform"
          >
            <div className="text-3xl mb-1">💬</div>
            <p className="font-display font-black uppercase text-sm">Contact</p>
          </Link>
        </div>

        <ChunkyLink href="/" bg="pink" size="lg" fullWidth>
          Back to shopping <MaterialIcon name="arrow_forward" className="text-xl" />
        </ChunkyLink>
      </div>
    </main>
  );
}
