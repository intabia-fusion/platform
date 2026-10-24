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
import { StatusIcon } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const tones = ['positive', 'negative', 'error', 'warning', 'info', 'neutral'] as const

const meta = {
  title: 'Feedback/StatusIcon',
  component: StatusIcon,
  args: {
    tone: 'positive',
    kind: 'solid',
    size: 'small',
    dot: false,
    tooltip: { label: getEmbeddedLabel('Connected') }
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** состояние значком: да / нет / неизвестно у булева значения и решения, состояние интеграции, ошибка с подробностями в подсказке. **Не этот компонент:** состояние словом на подложке (статус встречи, версии продукта) - `Chip`; строка с текстом ошибки под формой - `StatusMessage`; иконка вида объекта - `IconBox`.\n\n`tone`: `positive` - зелёный, галочка; `negative` - красный опасного действия, крестик: нет, отклонено; `error` - красный ошибки, крестик: ошибка, сбой; `warning` - оранжевый, восклицательный знак; `info` - основной акцент, «i»; `neutral` - серый, вопрос. `kind`: `solid` - залитый круг (по умолчанию), `outline` - кольцо и знак бледным оттенком тона без заливки, спокойнее внутри плотного содержимого. `size`: `small` 1rem (по умолчанию), `medium` 1.25rem - рядом с заголовком. `dot` - маленькая точка цвета тона вместо значка. `tooltip` - подробности при наведении (текст ошибки, компонент). Рядом с подписью значок декоративный; без подписи имя - `aria-label` (`role="img"`).'
      }
    }
  }
} satisfies Meta<StatusIcon>

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
          title: 'Tones',
          component: StatusIcon,
          rows: [
            { title: 'small', props: { size: 'small' } },
            { title: 'medium', props: { size: 'medium' } },
            { title: 'outline small', props: { kind: 'outline', size: 'small' } },
            { title: 'outline medium', props: { kind: 'outline', size: 'medium' } },
            { title: 'dot', props: { dot: true } }
          ],
          columns: axis('tone', tones)
        }
      ]
    }
  })
}
