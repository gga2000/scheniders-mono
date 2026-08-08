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