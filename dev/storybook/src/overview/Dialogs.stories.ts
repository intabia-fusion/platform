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

import type { Meta, StoryObj } from '@storybook/svelte'

import * as Dialog from '../ui-kit/Dialog.stories'
import * as Steps from '../ui-kit/Steps.stories'
import * as WizardDialog from '../ui-kit/WizardDialog.stories'
import StoryStack from './StoryStack.svelte'
import { entry, type StackGroup } from './stack'

const meta = {
  title: 'Overview/Dialogs, modals and wizards',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const kit: StackGroup[] = [
  {
    title: 'Диалоги',
    entries: [entry('Dialog', Dialog, 'Variants', 'ширины, подвал, шапка, тело, встроенный вид')]
  },
  {
    title: 'Мастера',
    entries: [
      entry('WizardDialog', WizardDialog, 'Variants'),
      entry('Steps', Steps, 'Variants', 'шаги в шапке мастера')
    ]
  }
]

export const Components: Story = {
  name: 'Kit',
  render: () => ({
    Component: StoryStack,
    props: {
      intro:
        'Все диалоги, модальные окна и мастера кита на одной странице: окна нарисованы на месте, без затемнения, чтобы сравнить шапки, подвалы и отступы рядом. Заголовок открывает собственную историю компонента.',
      groups: kit
    }
  })
}
