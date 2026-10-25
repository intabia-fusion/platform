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
import ui from '@hcengineering/ui'
import { TextInput } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['secondary', 'ghost', 'subtle'] as const
const sizes = ['extra-large', 'large', 'medium', 'small', 'extra-small'] as const

const name = getEmbeddedLabel('Name')
const title = getEmbeddedLabel('Issue title')
const email = getEmbeddedLabel('Email')

const meta = {
  title: 'Inputs/TextInput',
  component: TextInput,
  args: {
    value: '',
    placeholder: name,
    kind: 'secondary',
    size: 'small',
    heading: false,
    clearable: false,
    disabled: false,
    readonly: false,
    error: false,
    required: false,
    fullWidth: false
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** однострочный текст - название объекта, значение поля формы, адрес, пароль, текст, который правят на месте.\n\n**Не этот компонент:** поиск и фильтр списка - `SearchInput` (лупа, задержка `change`, свёрнутый режим); число - `NumberInput` (степперы, диапазон); несколько строк - `TextArea`; код из письма по ячейкам - `CodeInput`; значение из списка - `Dropdown` / `SelectButton`.\n\n`secondary` - залитое поле формы или диалога (заливка и рамка полей ввода), `ghost` - без заливки, рамки и боковых отступов: текст стоит вровень с содержимым вокруг; `inset` - ghost с отступом залитого поля (среди залитых полей, в теле диалога). Ошибка у всех видов - полная красная рамка; у ghost без `inset` это рамка залитого поля той же высоты и скругления, вынесенная на боковой отступ, текст не сдвигается. В фокусе ghost остаётся чистым, без подложки и кольца: фокус видно по каретке; `subtle` - тот же ghost с подложкой на ховер, который в фокусе становится полем: заливка и кольцо, когда границы поля должны быть видны. `heading` - шрифт заголовка (название в диалоге создания или карточке): `large` 1.5rem / 500, `medium` 1.25rem / 400, `small` 1rem / 500. `label` - подпись над полем; у `extra-large` (формы входа и онбординга) - плавающая подпись внутри. Имя поля для чтения с экрана - `label`, иначе `placeholder`, иначе `aria-label`; видимая подпись места рядом - `aria-labelledby` (обязательно одно из них по типам). `input` - на каждую правку, `change` - при фиксации (уход из поля после правки, Enter, очистка). `clearable` - кнопка очистки (`IconButton` кита «Clear» на шаг меньше поля); слоты `before` / `after` - кнопки и индикаторы внутри поля.'
      }
    }
  }
} satisfies Meta<TextInput>

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
          component: TextInput,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { placeholder: name }
        },
        {
          title: 'States',
          component: TextInput,
          rows: axis('kind', kinds),
          columns: [
            { title: 'empty', props: {} },
            { title: 'value', props: { value: 'Design review' } },
            { title: 'clearable', props: { value: 'Design review', clearable: true } },
            { title: 'icon', props: { icon: ui.icon.Search, value: 'Design review' } },
            { title: 'readonly', props: { value: 'Design review', readonly: true } },
            { title: 'disabled', props: { value: 'Design review', disabled: true } },
            { title: 'disabled, empty', props: { disabled: true } },
            { title: 'error', props: { value: 'Design review', error: true } }
          ],
          props: { placeholder: name, size: 'small' }
        },
        {
          title: 'Heading',
          component: TextInput,
          rows: [
            { title: 'empty', props: {} },
            { title: 'value', props: { value: 'Prepare the release notes' } }
          ],
          columns: axis('size', ['large', 'medium', 'small']),
          props: { kind: 'ghost', heading: true, placeholder: title }
        },
        {
          title: 'Label',
          component: TextInput,
          rows: [
            { title: 'small', props: { size: 'small' } },
            { title: 'extra-large', props: { size: 'extra-large' } }
          ],
          columns: [
            { title: 'empty', props: {} },
            { title: 'value', props: { value: 'anna@example.com' } },
            { title: 'required', props: { required: true } },
            { title: 'password', props: { label: getEmbeddedLabel('Password'), type: 'password', value: 'secret12' } },
            { title: 'error', props: { value: 'anna@', error: true } }
          ],
          props: { label: email, placeholder: email, type: 'email' }
        }
      ]
    }
  })
}
