/**
 * Landing page for the storefront root domain (scheniders.com).
 *
 * The actual marketing site lives in the platform repo. This page exists so
 * the storefront responds to requests at the apex domain.
 */
export default function StorefrontRootPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="text-center px-6">
        <h1 className="text-3xl font-bold mb-2">Scheniders Storefront</h1>
        <p className="text-zinc-600 max-w-md">
          هذا النطاق يخدم متاجر سكنيدرز. تفضل بزيارة متجرك على{" "}
          <code className="bg-zinc-200 px-1 rounded">/s/shopname</code>
        </p>
      </div>
    </main>
  );
}
