/** Storybook stand-in for @/hooks/use-auth: a signed-in owner, so permission-gated controls render. */
export function useAuth() {
  return { session: { access_token: "storybook-token" }, role: "admin", permissions: [] as string[], isLoading: false };
}
