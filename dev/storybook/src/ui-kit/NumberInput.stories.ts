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
import { NumberInput } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const sizes = ['large', 'medium', 'small', 'extra-small'] as const

const meta = {
  title: 'Inputs/NumberInput',
  component: NumberInput,
  args: { value: 5, min: 1, max: 100, step: 1, fractionDigits: 0, size: 'small', disabled: false, fullWidth: false },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** небольшое число с понятным шагом - число мест, интервал повтора, срок в днях, границы числового атрибута.\n\n**Не этот компонент:** номер, код, телефон - `TextInput` (`inputmode="numeric"`); код из письма по ячейкам - `CodeInput`.\n\nЧисловое поле между кнопками `−` и `+` (`IconButton` кита на шаг меньше поля). Ввод обновляет `value` сразу, а в `min`..`max` и `fractionDigits` приводится при фиксации - уход из поля, Enter, шаг кнопкой или стрелкой; тогда же приходит `change` (`null` - поле пустое), если значение изменилось. С клавиатуры шаг - стрелками вверх / вниз, поэтому кнопки `−` / `+` вне порядка Tab. Ширина поля - по значению или плейсхолдеру, `fullWidth` - на всю ширину места. Имя поля - `aria-label` или, лучше, `aria-labelledby` с id видимой подписи места.'
      }
    }
  }
} satisfies Meta<NumberInput>

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
          component: NumberInput,
          rows: [{ title: 'value', props: { value: 12 } }],
          columns: axis('size', sizes),
          props: { min: 1, max: 100 }
        },
        {
          title: 'States',
          component: NumberInput,
          rows: axis('size', ['small', 'extra-small']),
          columns: [
            { title: 'value', props: { value: 3 } },
            { title: 'at min', props: { value: 1 } },
            { title: 'at max', props: { value: 100 } },
            { title: 'wide value', props: { value: 10000, max: 10000 } },
            { title: 'empty', props: { value: undefined } },
            { title: 'placeholder', props: { value: undefined, placeholder: getEmbeddedLabel('Default value') } },
            { title: 'disabled', props: { value: 3, disabled: true } }
          ],
          props: { min: 1, max: 100 }
        }
      ]
    }
  })
}
