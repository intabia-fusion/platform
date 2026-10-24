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
import { IconFile, IconFolder } from '@hcengineering/ui'
import { EmptyState } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import EmptyStateExample from './empty-state/EmptyStateExample.svelte'

const description = getEmbeddedLabel('Issues of the project will appear here')

const meta = {
  title: 'Feedback/EmptyState',
  component: EmptyState,
  args: { label: getEmbeddedLabel('No issues yet'), description, icon: IconFolder, size: 'large' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** показать, что данных нет и что с этим сделать: пустой вид целиком (`large` - нет задач, сообщений, сохранённого) или пустой блок внутри секции (`small` - нет откликов, участников). **Не этот компонент:** загрузка - `Spinner` / `Loading`; ошибка - уведомление места.\n\n`large` - по центру места, до 30rem: иконка на плашке 3.5rem, сообщение `label` (полужирное), пояснение `description`, под ними действия (default slot, кнопки). Вид плашки - `kind`: `brand` (по умолчанию, круг тона выбора), `plate` (мягкий нейтральный квадрат). `small` - два вида: с действием «добавить» (`action`) вся плашка - пунктирная кнопка с плюсом (`on:click`), `label` озвучивается как её пояснение; без действия (нельзя добавить) - светлая сплошная рамка, мелкий вторичный текст, иконка 1rem на мягком квадрате 2rem. Иконка декоративная (`aria-hidden`).'
      }
    }
  },
  render: (args) => ({ Component: EmptyStateExample, props: { props: args } })
} satisfies Meta<EmptyState>

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
          title: 'large',
          component: EmptyStateExample,
          rows: axis('kind', ['brand', 'plate']),
          props: { size: 'large' },
          columns: [
            { title: 'icon + description', props: { icon: IconFolder, description } },
            { title: 'with action', props: { icon: IconFolder, description, actions: 'button' } },
            { title: 'label only', props: { icon: IconFolder } }
          ]
        },
        {
          title: 'small',
          component: EmptyStateExample,
          rows: axis('size', ['small']),
          columns: [
            { title: 'add plate (action)', props: { action: getEmbeddedLabel('Create an application') } },
            { title: 'readonly', props: { icon: IconFile } }
          ],
          props: { label: getEmbeddedLabel('No applications for this talent yet'), width: '22rem' }
        }
      ]
    }
  })
}
