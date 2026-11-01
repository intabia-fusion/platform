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

import CanvasView from '../Canvas.svelte'
import Screen from '../Screen.svelte'

const group = 'Screens'
const page = 'Project boards in issues'

const meta = {
  title: 'Project boards in issues',
  component: Screen,
  tags: ['!autodocs', 'screen'],
  parameters: { layout: 'fullscreen' }
} satisfies Meta<Screen>

export default meta
type Story = StoryObj<typeof meta>

export const Canvas: StoryObj = {
  parameters: { controls: { disable: true } },
  render: () => ({ Component: CanvasView, props: { group, page } })
}
export const Frame1: Story = { name: 'Задачи проекта - 1. сегменты у заголовка', args: { group, page, frame: 0 } }
export const Frame2: Story = { name: 'Задачи проекта - 2. кнопки в строке фильтров', args: { group, page, frame: 1 } }
export const Frame3: Story = { name: 'Задачи проекта - 3. кнопка "Доски (N)"', args: { group, page, frame: 2 } }
export const Frame4: Story = { name: 'Аннотации - кнопки досок проекта', args: { group, page, frame: 3 } }
export const Frame5: Story = { name: 'Вариант 4 - доски на месте заголовка', args: { group, page, frame: 4 } }
export const Frame6: Story = { name: 'Вариант 4 - доски не влезают, меню', args: { group, page, frame: 5 } }
export const Frame7: Story = { name: 'Вариант 4 - меню досок проекта', args: { group, page, frame: 6 } }
