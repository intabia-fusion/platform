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
    sample: { control: 'inline-radio', options: ['row', 'form', 'list', 'page'] },
    control: { control: 'inline-radio', options: ['dropdown', 'toggle', 'chips', 'textarea'] }
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** одна настройка в форме или диалоге создания: подпись слева, контрол справа, линия под строкой. **Не этот компонент:** переключатель с описанием без линий - `Toggle` с `label`; заголовок блока - `Section`.\n\nПодпись - 12px / 500 капсом, вторичный цвет. `hint` - кнопка-«i» с подсказкой после подписи. `stacked` - подпись над контролом (текстовое поле). Слот `details` - под строкой над линией: выбранные значения чипами. Слот по умолчанию отдаёт `labelId` для `aria-labelledby` контрола. Линия только под строкой: над первой её нет, чтобы не дублировать шапку диалога.\n\n`variant="list"` - пункт списка переключателей: `icon` на плашке `IconBox` цвета `color` из палитры, подпись обычным текстом и `description` второй строкой, контрол в конце, линии между пунктами начинаются после иконки. Подпись - `<label>` элемента с `id={controlId}` из слота: клик по тексту переключает `Toggle`; `descriptionId` - для `aria-describedby`. `disabled` гасит подпись и иконку вместе с контролом.\n\n`kind="column"` - страница настроек: подпись обычным регистром в колонке 13.75rem, `hint` текстом под ней (`hintParams`), контрол сразу за колонкой, без линии; промежуток между строками задаёт место. `fullWidth` - контрол занимает остаток строки (поле на всю ширину формы, мастер создания проекта).'
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
          title: 'Form: dropdown, toggle, chips (details), textarea (stacked)',
          component: SettingRowExample,
          rows: [{ title: '', props: { sample: 'form' } }],
          columns: [
            { title: 'caption', props: {} },
            { title: 'hint', props: { hint: true } }
          ]
        },
        {
          title: 'List: icon, description, a value before the switch, disabled, no icon',
          component: SettingRowExample,
          rows: [{ title: '', props: { sample: 'list' } }],
          columns: [{ title: '', props: {} }]
        }
      ]
    }
  })
}

export const SettingsPage: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  args: { sample: 'page' }
}
