import type { Preview } from '@storybook/nextjs'
// The app's stylesheet, so stories render with the real design tokens and
// Tailwind utilities rather than as unstyled markup.
import '../app/globals.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
};

export default preview;