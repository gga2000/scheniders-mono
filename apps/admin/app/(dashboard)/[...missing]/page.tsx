import { notFound } from "next/navigation";

/**
 * Any address the console has no page for. Without this, a wrong link showed
 * the framework's bare "404" with no menu; now it gets the console's own
 * not-found page (../not-found.tsx) inside the menu, still as a 404.
 */
export default function MissingPage(): never {
  notFound();
}
