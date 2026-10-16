//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import '@hcengineering/theme/styles/global.scss'
import { accentColorOptions, AccentColor, ThemeVariant } from '@hcengineering/theme'
import { Popup, TooltipInstance } from '@hcengineering/ui'
import registerUiStrings from '@hcengineering/ui/src/lang'
import type { Preview } from '@storybook/svelte'

import './preview.scss'
import StoryTheme from '../src/decorators/StoryTheme.svelte'
import { hidePassthroughAttributes, organizeProps, prettifyTypeNames } from '../src/helpers/argTypes'
import { systemTheme } from './theme'

registerUiStrings()

// One popup and tooltip host per preview document, as the workbench mounts them: a docs page shows several stories.
const hosts = document.body.appendChild(document.createElement('div'))
new TooltipInstance({ target: hosts }) // eslint-disable-line no-new
new Popup({ target: hosts }) // eslint-disable-line no-new

const languages = ['en', 'ru', 'cs', 'de', 'es', 'fr', 'it', 'ja', 'pt', 'pt-br', 'tr', 'zh']

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: ThemeVariant.Light, title: 'Light' },
          { value: ThemeVariant.Dark, title: 'Dark' }
        ],
        dynamicTitle: true
      }
    },
    accent: {
      description: 'Accent color',
      toolbar: {
        title: 'Accent',
        icon: 'paintbrush',
        items: accentColorOptions.map((option) => ({ value: option.value, title: option.name })),
        dynamicTitle: true
      }
    },
    language: {
      description: 'Language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: languages.map((lang) => ({ value: lang, title: lang })),
        dynamicTitle: true
      }
    }
  },
  initialGlobals: {
    theme: systemTheme().base === 'dark' ? ThemeVariant.Dark : ThemeVariant.Light,
    accent: AccentColor.Intabia,
    language: 'en'
  },
  parameters: {
    backgrounds: { disable: true },
    controls: { expanded: true, sort: 'requiredFirst' },
    layout: 'centered',
    docs: { theme: systemTheme() }
  },
  decorators: [
    (_, context) => ({
      Component: StoryTheme,
      props: {
        theme: context.globals.theme,
        accent: context.globals.accent,
        language: context.globals.language
      }
    })
  ],
  argTypesEnhancers: [prettifyTypeNames, hidePassthroughAttributes, organizeProps],
  tags: ['autodocs']
}

export default preview
