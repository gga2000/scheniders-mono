/**
 * The demo store's checkout says it is a demo (Fermi B13): its products,
 * prices and orders are invented for screen recordings, and nothing ordered
 * here is sent or shipped.
 */
export function DemoStoreNote() {
  return (
    <div
      data-testid="demo-store-note"
      className="mx-auto w-full max-w-3xl px-4 pt-3"
    >
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-center text-sm font-semibold text-sky-900">
        <bdi>هذا متجر تجريبي. الطلبات هنا للتجربة فقط وما توصل لأحد.</bdi>
      </p>
    </div>
  );
}
