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
import { Callout } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'

const text = getEmbeddedLabel('Fields of the current type will be lost.')
const title = getEmbeddedLabel('Task type changes')
const long = getEmbeddedLabel(
  'Fields of the current type will be lost: Severity, Steps to reproduce and Environment have no place in the new type and are removed from the task.'
)

const meta = {
  title: 'Feedback/Callout',
  component: Callout,
  args: { tone: 'warning', label: text },
  argTypes: { tone: { control: 'inline-radio', options: ['info', 'positive', 'warning', 'error'] } },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** плашка с пояснением внутри формы или диалога - что сделает действие (данные будут потеряны, настройка переопределена), что не получилось. **Не этот компонент:** результат действия строкой под формой - `StatusMessage`; всплывающее уведомление - `Toast`; состояние словом - `Chip`.\n\n`tone`: `info` (по умолчанию, текст основного цвета), `positive`, `warning` (текст и рамка оранжевые), `error` (красные, `role="alert"`). Подложка - 12% тона, рамка - 30%, значок - `StatusIcon` outline того же тона. Текст - `label` или слот, `title` - жирная первая строка, слот `actions` - кнопки справа.'
      }
    }
  }
} satisfies Meta<Callout>

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
          title: 'Tone',
          component: Callout,
          rows: [
            { title: 'text', props: { label: text } },
            { title: 'title + text', props: { title, label: text } },
            { title: 'long text', props: { label: long } }
          ],
          columns: [
            { title: 'info', props: { tone: 'info' } },
            { title: 'positive', props: { tone: 'positive' } },
            { title: 'warning', props: { tone: 'warning' } },
            { title: 'error', props: { tone: 'error' } }
          ]
        }
      ]
    }
  })
}
