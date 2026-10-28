import { providerBaseUrls } from "./env";

/** Anthropic Messages API endpoint; host from `ANTHROPIC_API_BASE_URL` (PKG-00 6a). */
export const ANTHROPIC_MESSAGES_URL = `${providerBaseUrls.ANTHROPIC_API_BASE_URL}/v1/messages`;
