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

import { FilterButton } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import FilterButtonExample from './filter-button/FilterButtonExample.svelte'
import { categories, modeEnabled, typeGroup } from './filter-button/filters'

const kinds = ['secondary', 'ghost'] as const
const sizes = ['large', 'medium', 'small', 'extra-small'] as const

const meta = {
  title: 'Buttons/FilterButton ⏳',
  id: 'buttons-filterbutton',
  component: FilterButton,
  args: {
    categories,
    activeFilters: [typeGroup],
    kind: 'secondary',
    size: 'small',
    indicator: 'count',
    disabled: false
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** фильтры списка по фиксированным категориям (по одному варианту на категорию) в тулбаре рядом с поиском. **Не этот компонент:** фильтры с попапом `FilterTypePopup` у списков view - `FilterButton` из view-resources.\n\nБез фильтров - кнопка «Filter» (на `SelectButton`: у фильтра есть значение, подпись не жирная). С фильтрами кнопка остаётся серой, как весь тулбар, акцент только у индикатора: `indicator="count"` (по умолчанию) - число в светлом квадратике, `indicator="dot"` - точка на воронке, когда число ничего не говорит. Сброс есть всегда - крестик внутри кнопки после индикатора (подпись «Clear»): его плашка размером с квадратик числа, наведение и фокус подсвечивают только её, кнопка «Filter» при этом не темнеет. После сброса фокус переходит на кнопку «Filter»; при `indicator="dot"` число фильтров остаётся в имени кнопки для чтения с экрана.'
      }
    }
  },
  render: (args) => ({ Component: FilterButtonExample, props: args })
} satisfies Meta<FilterButton>

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
          component: FilterButton,
          rows: axis('kind', kinds),
          columns: axis('size', sizes),
          props: { categories, activeFilters: [typeGroup, modeEnabled] }
        },
        {
          title: 'Indicators',
          component: FilterButton,
          rows: axis('indicator', ['count', 'dot']),
          columns: [
            { title: 'no filters', props: {} },
            { title: 'one', props: { activeFilters: [typeGroup] } },
            { title: 'two', props: { activeFilters: [typeGroup, modeEnabled] } },
            { title: 'disabled, two', props: { disabled: true, activeFilters: [typeGroup, modeEnabled] } }
          ],
          props: { categories, size: 'small' }
        },
        {
          title: 'States',
          component: FilterButton,
          rows: axis('kind', kinds),
          columns: [
            { title: 'no filters', props: {} },
            { title: 'one', props: { activeFilters: [typeGroup] } },
            { title: 'two', props: { activeFilters: [typeGroup, modeEnabled] } },
            { title: 'disabled', props: { disabled: true } },
            { title: 'disabled, two', props: { disabled: true, activeFilters: [typeGroup, modeEnabled] } }
          ],
          props: { categories, size: 'small' }
        }
      ]
    }
  })
}
