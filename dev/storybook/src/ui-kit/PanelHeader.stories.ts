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

import { PanelHeader } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import PanelHeaderExample from './panel-header/PanelHeaderExample.svelte'

const meta = {
  title: 'Panels and dialogs/PanelHeader ⏳',
  id: 'panels-and-dialogs-panelheader',
  component: PanelHeader,
  args: {
    adaptive: 'disabled',
    breakpoint: 768,
    pinActions: false,
    scrollExtra: false,
    divider: true,
    closable: false,
    closeOnEscape: true,
    navigatorToggle: false
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** шапка вида, панели объекта или боковой панели (виджета): заголовок, поиск, фильтры, действия, закрытие. **Не этот компонент:** шапка диалога - `Dialog`; заголовок блока внутри страницы - `Section`; путь к объекту - `Breadcrumbs` (кладётся в заголовок).\n\n' +
          'Слоты по порядку: `before` (кнопки перед заголовком), default - заголовок (разметка места), `description` - вторая строка под заголовком, `presence`, `search`, `extra` (фильтры, режимы), `actions`; слоты получают `let:narrow` - шапка уже `breakpoint`. Между `search` и `actions` - разделитель. `adaptive`: `disabled` (по умолчанию) - одна строка; `auto` - уже `breakpoint` (768px) две строки, поиск, `extra` и действия уходят во вторую; `double` - всегда две; `extra` - две, когда `extra` перестаёт помещаться. `pinActions` - в двух строках действия остаются у заголовка. `scrollExtra` - `extra` прокручивается вбок. `closable` - кнопка закрытия в конце (`on:close`), с `closeOnEscape` - подсказка `Kbd` Esc и сама клавиша (пока открыт попап или поле внутри уже обработало Esc - клавиша не закрывает; из двух закрываемых шапок закрывается последняя появившаяся). `navigatorToggle` - кнопка скрыть / показать навигатор в начале. `divider={false}` - без линии снизу. `on:resize` - ширины шапки, заголовка и `extra`, только когда они изменились (панель подгоняет по ним свой заголовок). Кнопки внутри - кит (`IconButton` ghost small).'
      }
    }
  },
  render: (args) => ({ Component: PanelHeaderExample, props: { props: args } })
} satisfies Meta<PanelHeader>

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
          title: 'One row',
          component: PanelHeaderExample,
          rows: [
            { title: 'view', props: {} },
            { title: 'navigator toggle', props: { navigatorToggle: true } },
            { title: 'description', props: { description: 'Product team · 128 issues', withExtra: false } },
            { title: 'no divider', props: { divider: false, withExtra: false, withSearch: false } }
          ],
          columns: [{ title: '56rem', props: {} }],
          props: {}
        },
        {
          title: 'Aside (closable)',
          component: PanelHeaderExample,
          rows: [
            { title: 'Esc', props: { closable: true } },
            { title: 'no Esc', props: { closable: true, closeOnEscape: false } }
          ],
          columns: [{ title: '24rem', props: {} }],
          props: {
            width: '24rem',
            title: 'Calendar',
            withBefore: false,
            withSearch: false,
            withActions: false
          }
        },
        {
          title: 'Two rows',
          component: PanelHeaderExample,
          rows: [
            { title: 'double', props: { adaptive: 'double' } },
            { title: 'auto, narrow', props: { adaptive: 'auto', width: '40rem' } },
            { title: 'auto + pinActions', props: { adaptive: 'auto', pinActions: true, width: '40rem' } }
          ],
          columns: [{ title: 'layout', props: {} }],
          props: {}
        }
      ]
    }
  })
}
