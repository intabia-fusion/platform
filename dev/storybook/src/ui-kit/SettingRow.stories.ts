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

import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import SettingRowExample from './setting-row/SettingRowExample.svelte'

const meta = {
  title: 'Inputs/SettingRow',
  component: SettingRowExample,
  args: { sample: 'row', control: 'dropdown', hint: false },
  argTypes: {
    sample: { control: 'inline-radio', options: ['row', 'dialog'] },
    control: { control: 'inline-radio', options: ['dropdown', 'toggle', 'chips', 'textarea'] }
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** одна настройка в форме или диалоге создания: подпись слева, контрол справа, линия под строкой. **Не этот компонент:** переключатель с описанием без линий - `Toggle` с `label`; заголовок блока - `Section`.\n\nПодпись - 12px / 500 капсом, вторичный цвет. `hint` - кнопка-«i» с подсказкой после подписи. `stacked` - подпись над контролом (текстовое поле). Слот `details` - под строкой над линией: выбранные значения чипами. Слот по умолчанию отдаёт `labelId` для `aria-labelledby` контрола. Линия только под строкой: над первой её нет, чтобы не дублировать шапку диалога.'
      }
    }
  }
} satisfies Meta<SettingRowExample>

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
          title: 'Control',
          component: SettingRowExample,
          rows: [
            { title: 'dropdown', props: { control: 'dropdown' } },
            { title: 'toggle', props: { control: 'toggle' } },
            { title: 'chips (details)', props: { control: 'chips' } },
            { title: 'textarea (stacked)', props: { control: 'textarea' } }
          ],
          columns: [
            { title: 'caption', props: {} },
            { title: 'hint', props: { hint: true } }
          ]
        }
      ]
    }
  })
}

export const InDialog: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  args: { sample: 'dialog' }
}
