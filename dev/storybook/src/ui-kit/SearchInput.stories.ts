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
import { SearchInput } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['secondary', 'ghost'] as const
const sizes = ['large', 'medium', 'small', 'extra-small'] as const

const meta = {
  title: 'Inputs/SearchInput',
  component: SearchInput,
  args: {
    value: '',
    kind: 'secondary',
    size: 'small',
    collapsed: false,
    delay: 500,
    fullWidth: false,
    loading: false
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** поиск и фильтр списка - в тулбаре над списком, в шапке панели, над списком попапа выбора.\n\n**Не этот компонент:** текст, который сохраняется, - `TextInput`; поле поиска с кнопками внутри (фильтр, параметры) - `TextInput` с `icon` и слотом `after`.\n\nПоле поиска с лупой; боковой отступ как у `TextInput` того же размера, поэтому лупа и текст встают вровень с полями формы. `change` приходит через `delay` мс после ввода, по Enter и при очистке - сразу; `delay={0}` - попап фильтрует на каждый ввод. Очистка - `IconButton` кита «Clear» на шаг меньше поля. `collapsed` - пустое и не в фокусе поле сжато до квадратной кнопки с лупой, как соседние кнопки панели; клик раскрывает его. `loading` - спиннер на месте лупы, пока грузятся результаты. В фокусе у обоих видов кольцо и заливка поля; `ghost` - это `subtle` TextInput: на ховер подложка. Свёрнутый `secondary` в покое - в цветах secondary-кнопки, как соседние кнопки панели. `on:keydown` уходит месту (стрелки и Enter по списку под полем); Enter при этом тоже даёт `change`. Плейсхолдер по умолчанию `ui.string.Search`, он же доступное имя поля; видимая подпись места - `aria-labelledby`.'
      }
    }
  }
} satisfies Meta<SearchInput>

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
          component: SearchInput,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: {}
        },
        {
          title: 'States',
          component: SearchInput,
          rows: axis('kind', kinds),
          columns: [
            { title: 'empty', props: {} },
            { title: 'query', props: { value: 'design review' } },
            { title: 'placeholder', props: { placeholder: getEmbeddedLabel('Search emoji...') } },
            { title: 'collapsed, query', props: { collapsed: true, value: 'design' } },
            { title: 'loading', props: { value: 'ann', loading: true } }
          ],
          props: { size: 'small' }
        },
        {
          title: 'Collapsed',
          component: SearchInput,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { collapsed: true }
        }
      ]
    }
  })
}
