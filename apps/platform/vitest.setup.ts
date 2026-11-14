// The app loads the English dictionary on demand (language-provider.tsx).
// Tests read it at once, as an English user does once the chunk is cached.
import { loadEnglish } from "@/components/providers/language-provider";

await loadEnglish();
