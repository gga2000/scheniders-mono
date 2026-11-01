import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/nextjs';

const config: StorybookConfig = {
  "stories": [
    "../stories/**/*.mdx",
    "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding"
  ],
  "framework": "@storybook/nextjs",
  "staticDirs": [
    "../public"
  ],
  // lib/env.ts validates the Supabase client vars at import, so any story that
  // reaches the Supabase client needs them. Stories never talk to Supabase:
  // a local placeholder is enough when none is set.
  env: (config) => ({
    ...config,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://storybook-placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "storybook-placeholder",
  }),
  // The @scheniders/shared barrel re-exports preview-token.ts, which
  // imports node:crypto. Next tree-shakes it out of client bundles, but
  // Storybook's webpack build doesn't — stub the scheme so browser-only
  // stories can import shared types/components through the barrel.
  webpackFinal: async (config) => {
    // Webpack handles the "node:" scheme before alias resolution, so
    // rewrite the request first, then stub the bare builtin.
    const webpack = (await import("webpack")).default;
    const { NormalModuleReplacementPlugin } = webpack;
    config.plugins = config.plugins ?? [];
    config.plugins.push(
      new NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
      // Stories render dialogs that read the signed-in session; they have no
      // AuthProvider, so the hook resolves to a signed-in stub.
      new NormalModuleReplacementPlugin(/^@\/hooks\/use-auth$/, fileURLToPath(new URL("./use-auth.stub.ts", import.meta.url))),
    );
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...(config.resolve.fallback as Record<string, unknown>),
      crypto: false,
    };
    return config;
  },
};
export default config;