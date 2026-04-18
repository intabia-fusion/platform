/** @type { import('@storybook/svelte').Preview } */

import '@intabiafusion/theme/styles/global.scss';
import './styles/styles.scss';

import { addStringsLoader } from '@intabiafusion/platform';
import ThemeDecorator from './decorators/ThemeDecorator';

addStringsLoader('ui', async (lang) => {
  return await import(`@intabiafusion/ui/lang/${lang}.json`);
});

const preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    backgrounds: { disable: true },
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/
      }
    },
    themes: {
      target: 'html',
      default: 'Dark',
      list: [
        {
          name: 'Dark',
          class: 'theme-dark',
          color: '#1f2023'
        },
        {
          name: 'Light',
          class: 'theme-light',
          color: '#fff'
        }
      ],
      clearable: false
    },
  },
  decorators: [() => ThemeDecorator]
};

export default preview;
