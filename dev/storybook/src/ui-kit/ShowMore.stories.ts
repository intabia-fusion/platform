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
import { ShowMore } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import ShowMoreExample from './show-more/ShowMoreExample.svelte'

const meta = {
  title: 'Menus and lists/ShowMore ⏳',
  id: 'menus-and-lists-showmore',
  component: ShowMore,
  args: { limit: 120, open: false, disabled: false, expandable: true },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** длинный текст (сообщение, описание, комментарий в ленте) показывается на ограниченную высоту, остальное - по кнопке. **Не этот компонент:** раскрыть секцию с заголовком - `AccordionItem`; прокрутка внутри блока - `Scroller` места.\n\nСодержимое выше `limit` (px, по умолчанию 240) обрезается с затуханием, внизу по центру - непрозрачная плашка «Показать больше» в чистой полосе под затуханием (буквы под ней не просвечивают): места под содержимым не занимает. Раскрытое получает место под плашкой «Показать меньше», и она не перекрывает текст. Плашка - нативная кнопка с `aria-expanded`, `aria-controls`; клик не уходит в кликабельное сообщение вокруг. `open` - bindable, `on:toggle` с новым состоянием; фокус с Tab на ссылке ниже обрезки раскрывает сам. `expandable={false}` - обрезка без кнопки (ячейка таблицы), `disabled` - без обрезки (редактор, предпросмотр, который растёт сам). Высоту меряет `resizeObserver`: короткое содержимое не трогается.'
      }
    }
  },
  render: (args) => ({ Component: ShowMoreExample, props: { props: args } })
} satisfies Meta<ShowMore>

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
          title: 'States',
          component: ShowMoreExample,
          rows: [{ title: 'limit 120', props: { props: { limit: 120 } } }],
          columns: [
            { title: 'cropped', props: {} },
            { title: 'open', props: { open: true } },
            { title: 'short content', props: { paragraphs: 1 } }
          ]
        },
        {
          title: 'Without the button',
          component: ShowMoreExample,
          rows: [{ title: 'limit 80', props: { props: { limit: 80 } } }],
          columns: [
            { title: 'expandable=false', props: { expandable: false } },
            { title: 'disabled', props: { disabled: true, paragraphs: 2 } }
          ]
        }
      ]
    }
  })
}
