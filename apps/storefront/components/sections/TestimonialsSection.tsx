interface TestimonialItem {
  name: string;
  photo: string | null;
  rating: number;
  quote: string;
}

interface TestimonialsSectionProps {
  data: Record<string, unknown>;
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`w-4 h-4 ${star <= value ? "text-amber-400 fill-amber-400" : "text-gray-300"}`}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          />
        </svg>
      ))}
    </div>
  );
}

export default function TestimonialsSection({ data }: TestimonialsSectionProps) {
  const items = (data.items as TestimonialItem[]) || [];
  const visibleItems = items.filter((item) => item.name && item.quote);

  if (visibleItems.length === 0) return null;

  return (
    <section className="py-16 bg-zinc-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold mb-8 text-center text-zinc-900">
          آراء عملائنا
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleItems.map((item, index) => (
            <div
              key={index}
              className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100"
            >
              <div className="flex items-center gap-3 mb-4">
                {item.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photo}
                    alt={item.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center text-lg font-bold">
                    {item.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-zinc-900">{item.name}</p>
                  <StarRating value={item.rating} />
                </div>
              </div>
              <p className="text-zinc-600 leading-relaxed">&ldquo;{item.quote}&rdquo;</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
