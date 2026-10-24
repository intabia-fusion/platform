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
import { Loading } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'
import LoadingExample from './loading/LoadingExample.svelte'

const meta = {
  title: 'Feedback/Loading',
  component: Loading,
  args: { size: 'medium', delay: true },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** область ждёт своё содержимое - панель, вкладка, попап, список, экран приложения при подключении. **Не этот компонент:** признак занятости рядом с элементом (строка, вложение, заголовок) - `Spinner`; спиннер в кнопке - `loading` у `Button`.\n\nЗанимает всё место, которое ему дали, спиннер (`Spinner`, по умолчанию `medium`) посередине. Появляется через 0.25 с с плавным проявлением (`delay`, включён по умолчанию), чтобы быстрая загрузка не мигала. `label` - подпись после спиннера; без неё скринридер слышит скрытый статус «Loading» (`ui.string.Loading`), вид тот же; default slot - ещё текст в той же строке (процент создания воркспейса), slot `actions` - кнопки под строкой (повторить, выйти). Рамка в истории - место, сам компонент без рамки.'
      }
    }
  },
  render: (args) => ({ Component: LoadingExample, props: { props: args } })
} satisfies Meta<Loading>

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
          component: LoadingExample,
          rows: [{ title: 'area', props: { delay: false } }],
          columns: axis('size', ['large', 'medium', 'small'])
        },
        {
          title: 'Content',
          component: LoadingExample,
          rows: [{ title: 'medium', props: { delay: false } }],
          columns: [
            { title: 'label', props: { label: getEmbeddedLabel('Connecting') } },
            {
              title: 'label + slot',
              props: { label: getEmbeddedLabel('Workspace is being created'), extra: '42 %', width: '24rem' }
            },
            { title: 'actions', props: { label: getEmbeddedLabel('No connection'), withActions: true, width: '24rem' } }
          ]
        }
      ]
    }
  })
}
