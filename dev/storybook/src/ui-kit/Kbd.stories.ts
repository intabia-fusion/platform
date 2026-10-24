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
import { Kbd } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import KbdInButton from './kbd/KbdInButton.svelte'

const meta = {
  title: 'Display/Kbd',
  component: Kbd,
  args: { keys: ['shift', 'Enter'] },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** подсказка сочетания клавиш рядом с действием: номер слота, `Shift + Enter` на кнопке «Добавить». **Не этот компонент:** подсказка с описанием действия - `tooltip` кнопки.\n\n`<kbd>` с вложенным `<kbd>` на каждую клавишу; `shift`, `option`, `command` - значками, их имя читается скринридером, остальные клавиши - своим текстом (`Enter`, `1`). Один размер (1rem), цвет текста - от места.'
      }
    }
  }
} satisfies Meta<Kbd>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const Variants: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({
    Component: Sections,
    props: {
      sections: [
        {
          title: 'Keys',
          component: Kbd,
          rows: [{ title: 'keys', props: {} }],
          columns: [
            { title: 'digit', props: { keys: ['1'] } },
            { title: 'text', props: { keys: ['Enter'] } },
            { title: 'symbols', props: { keys: ['command', 'option', 'shift'] } },
            { title: 'combination', props: { keys: ['shift', 'Enter'] } }
          ]
        },
        {
          title: 'In place',
          component: KbdInButton,
          rows: [{ title: 'button', props: {} }],
          columns: [{ title: 'Add slot', props: {} }]
        }
      ]
    }
  })
}
