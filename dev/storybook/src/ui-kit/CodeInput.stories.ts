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

import { CodeInput } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const sizes = ['large', 'medium', 'small'] as const

const meta = {
  title: 'Inputs/CodeInput',
  component: CodeInput,
  args: {
    value: '',
    length: 6,
    size: 'small',
    numeric: true,
    separator: true,
    disabled: false,
    error: false,
    'aria-label': 'Confirmation code'
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** код подтверждения из письма или сообщения - ячейка на символ.\n\n**Не этот компонент:** пароль, токен, ключ API - `TextInput` (`type="password"`); число со степперами - `NumberInput`.\n\n`role="group"` с обязательным `aria-label` / `aria-labelledby`, ячейка подписана «N / M». Ввод переводит фокус на следующую ячейку, Backspace в пустой - на предыдущую и стирает её, стрелки, Home и End - по ячейкам. Вставка и автозаполнение (`autocomplete="one-time-code"`) раскладывают код по ячейкам. `input` - код после каждого изменения, `complete` - когда заполнены все ячейки (тогда место проверяет код). Отклонённый код - `error` и метод `clear()`. `numeric` (по умолчанию) - только цифры и цифровая клавиатура; `separator` - тире между половинами кода чётной длины.'
      }
    }
  }
} satisfies Meta<CodeInput>

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
          component: CodeInput,
          rows: [
            { title: 'empty', props: {} },
            { title: 'partly', props: { value: '482' } },
            { title: 'complete', props: { value: '482913' } }
          ],
          columns: axis('size', sizes),
          props: { 'aria-label': 'Confirmation code' }
        },
        {
          title: 'States',
          component: CodeInput,
          rows: [{ title: 'small', props: { size: 'small' } }],
          columns: [
            { title: 'error', props: { value: '482913', error: true } },
            { title: 'disabled', props: { value: '482913', disabled: true } },
            { title: '4 cells, no separator', props: { length: 4, separator: false, value: '73' } },
            { title: 'letters', props: { numeric: false, length: 5, value: 'K7Q' } }
          ],
          props: { 'aria-label': 'Confirmation code' }
        }
      ]
    }
  })
}
