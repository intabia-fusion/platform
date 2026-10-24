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
import { Spinner } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const sizes = ['large', 'medium', 'small', 'extra-small'] as const
const kinds = ['neutral', 'brand'] as const

const meta = {
  title: 'Feedback/Spinner',
  component: Spinner,
  args: { size: 'medium', kind: 'neutral', inheritColor: false },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** показать, что занято что-то рядом: строка списка, вложение, поле, заголовок панели («Очищаем»). **Не этот компонент:** область, чьё содержимое ещё грузится целиком (панель, вкладка, попап), - `Loading` (спиннер посередине места с задержкой появления); кнопка в работе - `loading` у `Button`.\n\nРазмеры: `large` 2rem, `medium` 1.5rem (по умолчанию), `small` 1rem - рядом с обычным текстом, `extra-small` 0.75rem - в мелком тексте. Цвет: `neutral` - основной цвет текста, `brand` - базовый цвет бренда (розовый в Intabia), `inheritColor` - цвет текста места (внутри цветного контрола). `label` - видимая подпись после спиннера шрифтом и цветом места, она же имя статуса (`role="status"`); без подписи имя - `aria-label`, без обоих спиннер декоративный (`aria-hidden`).'
      }
    }
  }
} satisfies Meta<Spinner>

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
          component: Spinner,
          rows: axis('kind', kinds),
          columns: axis('size', sizes)
        },
        {
          title: 'Label',
          component: Spinner,
          rows: axis('size', ['small', 'extra-small']),
          columns: [
            { title: 'label', props: { label: getEmbeddedLabel('Clearing') } },
            { title: 'long label', props: { label: getEmbeddedLabel('Transcribing the voice message') } },
            { title: 'brand', props: { label: getEmbeddedLabel('Clearing'), kind: 'brand' } }
          ]
        }
      ]
    }
  })
}
