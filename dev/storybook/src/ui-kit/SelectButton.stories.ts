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
import { SelectButton } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'
import type { ComponentProps } from 'svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import ExampleIcon from './select-button/ExampleIcon.svelte'
import SelectButtonContexts from './select-button/SelectButtonContexts.svelte'

const kinds = ['secondary', 'ghost', 'primary', 'brand', 'chip'] as const
const sizes = ['large', 'medium', 'small', 'extra-small'] as const
const high = { icon: ExampleIcon, iconProps: { glyph: 'high' }, label: getEmbeddedLabel('High') }
const noPriority = { icon: ExampleIcon, iconProps: { glyph: 'priority' }, placeholder: getEmbeddedLabel('No priority') }

// Ready-made setups switched by the `example` control.
const examples = {
  'value with icon': high,
  placeholder: noPriority,
  'text only': { label: getEmbeddedLabel('Europe/Tbilisi') },
  'long value': {
    icon: ExampleIcon,
    iconProps: { glyph: 'component' },
    label: getEmbeddedLabel('Very long component name that keeps going')
  },
  'form field': { icon: ui.icon.Calendar, label: getEmbeddedLabel('Oct 24, 2026'), size: 'medium', chevron: true }
} satisfies Record<string, ComponentProps<SelectButton>>

type Args = Partial<ComponentProps<SelectButton>> & { example: keyof typeof examples }

// Every key any example sets: a key missing from the next example would otherwise keep its old value.
const defaults: Partial<ComponentProps<SelectButton>> = {
  icon: undefined,
  iconProps: {},
  label: undefined,
  placeholder: undefined,
  size: undefined,
  chevron: false
}

const meta: Meta<Args> = {
  title: 'Buttons/SelectButton',
  component: SelectButton,
  args: { example: 'value with icon' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** у кнопки есть значение, которое меняют в попапе места: поле атрибута, исполнитель, приоритет, дата в форме. **Не этот компонент:** действие без значения - `Button`; выбор из готового списка вместе с попапом - `Dropdown`; значение только для чтения - презентер.\n\nТолько триггер: попап открывает место по `on:click`, привязывает к `element` и держит `pressed`, пока он открыт (`aria-expanded`). Плейсхолдер - вторичным цветом, у выключенной - цветом disabled. Только иконка без текста и шеврона - квадрат (компактная карточка). `fullWidth`, `justify`, `wrap`, `chevron` (`hover` - стрелка при наведении).'
      }
    }
  },
  argTypes: {
    example: { control: 'select', options: Object.keys(examples), description: 'Ready-made setup of the props below' }
  },
  render: ({ example, ...props }) => ({
    Component: SelectButton,
    props: { ...defaults, ...examples[example], ...props }
  })
}

export default meta
type Story = StoryObj<Args>

export const Playground: Story = {}

export const Variants: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({
    Component: Sections,
    props: {
      sections: [
        {
          title: 'Sizes',
          component: SelectButton,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: high
        },
        {
          title: 'Sizes with chevron',
          component: SelectButton,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { ...high, chevron: true }
        },
        {
          title: 'States',
          component: SelectButton,
          rows: axis('kind', kinds),
          columns: [
            { title: 'value', props: high },
            { title: 'placeholder', props: noPriority },
            { title: 'popup open', props: { ...high, pressed: true } },
            { title: 'disabled', props: { ...high, disabled: true } },
            { title: 'disabled, empty', props: { ...noPriority, disabled: true } },
            { title: 'loading', props: { ...high, loading: true } }
          ],
          props: { chevron: true }
        },
        {
          title: 'Chevron',
          component: SelectButton,
          rows: axis('kind', kinds),
          columns: [
            { title: 'false', props: { chevron: false } },
            { title: 'true', props: { chevron: true } },
            { title: 'hover', props: { chevron: 'hover' } }
          ],
          props: high
        }
      ]
    }
  })
}

/** How the places use it: dialog chips, attribute panel, form field, table cell; the last one opens a popup. */
export const Contexts: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({ Component: SelectButtonContexts })
}
