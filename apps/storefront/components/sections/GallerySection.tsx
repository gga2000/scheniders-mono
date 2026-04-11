"use client";

import { useState } from "react";

interface GallerySectionProps {
  data: Record<string, unknown>;
}

export default function GallerySection({ data }: GallerySectionProps) {
  const images = (data.images as string[]) || [];
  const layout = (data.layout as string) || "grid";
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold mb-8 text-zinc-900">معرض الصور</h2>

        <div
          className={
            layout === "masonry"
              ? "columns-2 md:columns-3 gap-4 space-y-4"
              : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          }
        >
          {images.map((url, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setLightboxIndex(index)}
              className={`overflow-hidden rounded-xl hover:opacity-90 transition ${
                layout === "masonry" ? "break-inside-avoid" : "aspect-square"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className={`w-full ${layout === "masonry" ? "h-auto" : "h-full"} object-cover`}
              />
            </button>
          ))}
        </div>

        {/* Lightbox */}
        {lightboxIndex !== null && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setLightboxIndex(null)}
          >
            <button
              className="absolute top-4 right-4 text-white text-3xl hover:opacity-70 transition"
              onClick={() => setLightboxIndex(null)}
            >
              &times;
            </button>

            {/* Prev/Next */}
            {lightboxIndex > 0 && (
              <button
                className="absolute left-4 text-white text-4xl hover:opacity-70 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(lightboxIndex - 1);
                }}
              >
                &#8249;
              </button>
            )}
            {lightboxIndex < images.length - 1 && (
              <button
                className="absolute right-4 text-white text-4xl hover:opacity-70 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(lightboxIndex + 1);
                }}
              >
                &#8250;
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[lightboxIndex]}
              alt=""
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </section>
  );
}
