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

import { ProgressBar } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import ProgressBarExample from './progress-bar/ProgressBarExample.svelte'

const kinds = ['brand', 'positive', 'warning', 'negative'] as const
const segments = [
  { value: 12, color: '#4CA185' },
  { value: 7, color: '#F6C94E' },
  { value: 4, color: '#E25F8B' },
  { value: 3, color: '#8E99AF' }
]

const meta = {
  title: 'Feedback/ProgressBar',
  component: ProgressBar,
  args: { value: 40, min: 0, max: 100, kind: 'brand', size: 'small', 'aria-label': 'Storage' },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** сколько из диапазона сделано или израсходовано, только показ: хранилище и токены тарифа, распределение задач по статусам. **Не этот компонент:** небольшой счётчик «3/5» рядом с текстом - `ProgressCircle`; значение, которое пользователь меняет перетаскиванием (масштаб камеры, перемотка аудио), - ползунок, отдельный контрол.\n\n`value` между `min` и `max` (за пределами - приводится), пустой диапазон (лимит 0) - пустая полоса. `kind` одиночной полосы: `brand` - базовый цвет бренда (розовый в Intabia, по умолчанию), `positive` / `warning` / `negative` - уровень расхода (хватает, заканчивается, исчерпан). `segments` - составная полоса: части одна за другой, цвет каждой - из данных (цвет статуса), пустые пропускаются, сумма обрезается по длине полосы. `size`: `small` - линия 0.25rem (по умолчанию), `large` - полоса 1.5rem, в частях написаны их значения. Ширина - по месту. Одиночная - `role="progressbar"` с `aria-valuenow`, имя - `aria-label` или подпись места (`aria-labelledby`); составная с именем - `role="img"`, без имени её читают по числам. Не число (`NaN` от деления на 0) - начало диапазона.'
      }
    }
  },
  render: (args) => ({ Component: ProgressBarExample, props: { props: args } })
} satisfies Meta<ProgressBar>

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
          title: 'Kinds',
          component: ProgressBarExample,
          rows: axis('kind', kinds),
          columns: [
            { title: '0', props: { value: 0, 'aria-label': 'Progress' } },
            { title: '40', props: { value: 40, 'aria-label': 'Progress' } },
            { title: '80', props: { value: 80, 'aria-label': 'Progress' } },
            { title: '100', props: { value: 100, 'aria-label': 'Progress' } }
          ]
        },
        {
          title: 'Sizes',
          component: ProgressBarExample,
          rows: axis('size', ['small', 'large']),
          columns: [
            { title: 'single', props: { value: 65, 'aria-label': 'Progress' } },
            { title: 'segments', props: { segments, max: 30, width: '24rem' } },
            {
              title: 'segments, empty part',
              props: { segments: [segments[0], { value: 0, color: 'red' }, segments[2]], max: 30, width: '24rem' }
            }
          ]
        }
      ]
    }
  })
}
