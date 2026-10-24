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

import * as PanelHeader from '../ui-kit/PanelHeader.stories'
import StoryStack from './StoryStack.svelte'
import { entry, type StackGroup } from './stack'

const meta = {
  title: 'Overview/Panels ⏳',
  id: 'overview-panels',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const kit: StackGroup[] = [
  {
    title: 'Панели',
    entries: [entry('PanelHeader ⏳', PanelHeader, 'Variants', 'шапка панели объекта, вида и aside')]
  }
]

export const Components: Story = {
  name: 'Panels ⏳',
  render: () => ({
    Component: StoryStack,
    props: {
      intro: 'Шапки панелей кита на одной странице. Заголовок открывает собственную историю компонента.',
      groups: kit
    }
  })
}
