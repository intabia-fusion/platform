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
import { WizardDialog } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import WizardDialogExample from './dialog/WizardDialogExample.svelte'

const steps = [
  { id: 'file', label: getEmbeddedLabel('Select file') },
  { id: 'statuses', label: getEmbeddedLabel('Map statuses') },
  { id: 'review', label: getEmbeddedLabel('Review') }
]

const meta = {
  title: 'Panels and dialogs/WizardDialog',
  component: WizardDialog,
  args: {
    label: getEmbeddedLabel('Import task types'),
    steps,
    submitLabel: getEmbeddedLabel('Import'),
    width: 'large',
    canProceed: true,
    canSubmit: true,
    earlySubmit: false,
    loading: false
  },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** создание или импорт в несколько шагов: слева `Steps`, справа тело текущего шага, в футере справа вместе «Назад», «Далее» (`brand`) и на последнем шаге главное действие (`positive`). Отмены нет - закрывает крестик (отменяемое `cancel`, затем `close`, как у `Dialog`). **Не этот компонент:** диалог в один экран - `Dialog`; только индикатор шагов - `Steps`.\n\n`steps` - `StepsItem` (`id`, `label`); `selected` - текущий шаг, bindable, по умолчанию первый; «Назад» / «Далее» меняют его сами и шлют `select` с id шага - проверку шага место делает через `canProceed`. `loading` блокирует «Назад» и «Далее», у главного действия - спиннер. Тело шага - default slot, подсказка или ошибка шага - слот `footerStart` (слева в футере). С `earlySubmit` (мастер, у которого следующие шаги необязательны) главное действие есть на каждом шаге, после «Далее»: вторичное до последнего шага, `positive` на последнем. Ширина по умолчанию `x-large`. Новый шаг открывается с начала (прокрутка тела сбрасывается); если кнопка под фокусом выключилась («Назад» на первом шаге) или пропала («Далее» на последнем), фокус переходит на главную кнопку. «Назад» на первом шаге выключена, а не скрыта: кнопки не прыгают. Escape и клик мимо в попапе спрашивают `canClose()`, как у `Dialog`.'
      }
    }
  },
  render: (args) => ({ Component: WizardDialogExample, props: { props: args } })
} satisfies Meta<WizardDialog>

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
          title: 'Steps',
          component: WizardDialogExample,
          rows: [
            { title: 'first', props: { selected: 'file' } },
            { title: 'middle + footerStart', props: { selected: 'statuses', withFooterStart: true } },
            { title: 'last', props: { selected: 'review' } }
          ],
          columns: [{ title: 'large', props: {} }],
          props: { width: 'large' }
        },
        {
          title: 'States',
          component: WizardDialogExample,
          rows: [
            { title: 'canProceed=false', props: { selected: 'file', canProceed: false } },
            { title: 'canSubmit=false', props: { selected: 'review', canSubmit: false } },
            { title: 'earlySubmit', props: { selected: 'statuses', earlySubmit: true } },
            { title: 'earlySubmit, last', props: { selected: 'review', earlySubmit: true } },
            { title: 'loading', props: { selected: 'review', loading: true } }
          ],
          columns: [{ title: 'large', props: {} }],
          props: { width: 'large' }
        }
      ]
    }
  })
}
