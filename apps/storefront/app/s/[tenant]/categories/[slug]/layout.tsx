import { requireCategory } from "@/lib/route-guards";

interface Props {
  params: Promise<{ tenant: string; slug: string }>;
  children: React.ReactNode;
}

/**
 * Decides this route's status before the skeleton streams. loading.tsx in this
 * segment wraps the page, not this layout, so a missing category still answers
 * 404 and a merchant's redirect a real 308 with a Location header — thrown
 * from the page, both would arrive after the 200 had already been sent.
 */
export default async function CategoryLayout({ params, children }: Props) {
  const { tenant, slug } = await params;
  await requireCategory(tenant, slug);
  return children;
}
