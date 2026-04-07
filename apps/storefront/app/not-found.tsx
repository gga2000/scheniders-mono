import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-zinc-900 mb-2">404</h1>
        <p className="text-zinc-600">لا توجد صفحة هنا</p>
        <Link href="/" className="text-brand-primary hover:underline mt-4 inline-block">
          العودة للرئيسية
        </Link>
      </div>
    </main>
  );
}
