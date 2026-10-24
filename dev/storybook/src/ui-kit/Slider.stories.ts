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

import { Slider } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import SliderExample from './slider/SliderExample.svelte'

const time = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`

const meta = {
  title: 'Inputs/Slider',
  component: Slider,
  args: {
    value: 40,
    min: 0,
    max: 100,
    step: 1,
    size: 'medium',
    disabled: false,
    showValue: false,
    'aria-label': 'Zoom'
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** значение, которое пользователь меняет перетаскиванием по диапазону: радиус размытия камеры, громкость, позиция воспроизведения. **Не этот компонент:** показ расхода или прогресса без ввода - `ProgressBar`; точное число с клавиатуры - `NumberInput`.\n\nНативный `input type="range"`: стрелки, PageUp / PageDown, Home / End и роль `slider` - от браузера. `value` между `min` и `max` с шагом `step` (по умолчанию 0…100, шаг 1; `step="any"` - непрерывное значение вроде позиции воспроизведения, стрелки двигают на 1% диапазона), `bind:value` работает. `on:input` - каждое движение при перетаскивании, `on:change` - зафиксированное значение (отпустили бегунок или нажали клавишу); `detail` - число. Заполнение и бегунок - основной акцент, дорожка 0.25rem - нейтральная; `disabled` - серые, как у всех выключенных контролов. `size`: `medium` - бегунок 1rem (по умолчанию), `small` - 0.75rem. `showValue` пишет значение после дорожки, `formatValue` задаёт его текст (`1:05`) и `aria-valuetext`. Ширина - по месту. Имя обязательно: `aria-label` или `aria-labelledby` на подпись места.'
      }
    }
  },
  render: (args) => ({ Component: SliderExample, props: { props: args } })
} satisfies Meta<Slider>

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
          title: 'Sizes and states',
          component: SliderExample,
          rows: axis('size', ['medium', 'small']),
          columns: [
            { title: 'min', props: { value: 0 } },
            { title: '40', props: { value: 40 } },
            { title: 'max', props: { value: 100 } },
            { title: 'showValue', props: { value: 40, showValue: true } },
            { title: 'disabled', props: { value: 40, disabled: true } },
            { title: 'disabled, showValue', props: { value: 40, disabled: true, showValue: true } }
          ],
          props: { width: '12rem' }
        },
        {
          title: 'Ranges',
          component: SliderExample,
          rows: [
            {
              title: 'blur radius: 0.5…10, step 0.5',
              props: { value: 4.5, min: 0.5, max: 10, step: 0.5, 'aria-label': 'Blur radius' }
            },
            {
              title: 'playback: 0…600 s, formatValue',
              props: { value: 65, max: 600, formatValue: time, 'aria-label': 'Position' }
            },
            { title: 'empty range: max = min', props: { value: 0, max: 0 } }
          ],
          columns: [
            { title: 'medium', props: {} },
            { title: 'medium, showValue', props: { showValue: true } },
            { title: 'small, showValue', props: { size: 'small', showValue: true } }
          ],
          props: { width: '16rem' }
        }
      ]
    }
  })
}
