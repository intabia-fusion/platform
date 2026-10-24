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

import { getEmbeddedLabel } from '@hcengineering/platform'
import { TextArea } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import TextAreaBox from './text-area/TextAreaBox.svelte'

const kinds = ['secondary', 'ghost', 'subtle'] as const

const description = getEmbeddedLabel('Description')
const text =
  'Collect the feedback from the review and update the plan.\nThe second line goes here, and it is long enough to wrap.'

const meta = {
  title: 'Inputs/TextArea',
  component: TextArea,
  args: {
    value: '',
    placeholder: description,
    kind: 'secondary',
    size: 'small',
    rows: 3,
    disabled: false,
    readonly: false,
    error: false
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** несколько строк простого текста без разметки - описание под названием в диалоге, промпт, комментарий к причине изменения.\n\n**Не этот компонент:** одна строка - `TextInput`; текст с форматированием, упоминаниями и вложениями - редактор из `text-editor`.\n\nПоле на всю ширину места. Высота растёт с текстом от `rows` (по умолчанию 3) строк, с `maxRows` - до стольких строк, дальше прокрутка; `rows` = `maxRows` - постоянная высота. Перенос строк всегда включён. Виды как у `TextInput`: `secondary` - залитое поле формы, `ghost` - без заливки и отступов, вровень с заголовком над ним (с `inset` - с отступом, на одной линии с `inset` TextInput); в фокусе ghost чистый, без подложки и кольца; `subtle` - ghost с подложкой на ховер, который в фокусе становится полем: заливка и кольцо. Ошибка у всех видов - полная красная рамка, у ghost без `inset` вынесена наружу на отступ залитого поля, текст не сдвигается. `size="medium"` - 1rem / 400, описание под заголовком `TextInput heading`. Имя поля - `placeholder`, `aria-label` или `aria-labelledby` с id видимой подписи места (обязательно одно по типам).'
      }
    }
  }
} satisfies Meta<TextArea>

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
          title: 'Sizes',
          component: TextAreaBox,
          rows: axis('kind', kinds),
          columns: [
            { title: 'small', props: { size: 'small' } },
            { title: 'small, value', props: { size: 'small', value: text } },
            { title: 'medium', props: { size: 'medium' } },
            { title: 'medium, value', props: { size: 'medium', value: text } }
          ],
          props: { placeholder: description }
        },
        {
          title: 'States',
          component: TextAreaBox,
          rows: axis('kind', kinds),
          columns: [
            { title: 'readonly', props: { value: text, readonly: true } },
            { title: 'disabled', props: { value: text, disabled: true } },
            { title: 'error', props: { value: text, error: true } }
          ],
          props: { placeholder: description }
        },
        {
          title: 'Rows',
          component: TextAreaBox,
          rows: [{ title: 'secondary', props: { kind: 'secondary' } }],
          columns: [
            { title: 'rows 1', props: { rows: 1 } },
            { title: 'rows 2, maxRows 3', props: { rows: 2, maxRows: 3, value: text + '\nThird line.\nFourth line.' } },
            { title: 'rows 6 = maxRows', props: { rows: 6, maxRows: 6 } }
          ],
          props: { placeholder: description }
        }
      ]
    }
  })
}
