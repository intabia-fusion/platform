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
const page = 'Task boards'

const meta = {
  title: 'Screens/Task boards',
  component: Screen,
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen' }
} satisfies Meta<Screen>

export default meta
type Story = StoryObj<typeof meta>

export const Canvas: StoryObj = {
  parameters: { controls: { disable: true } },
  render: () => ({ Component: CanvasView, props: { group, page } })
}
export const Frame1: Story = { name: 'Доска - вид', args: { group, page, frame: 0 } }
export const Frame2: Story = { name: 'Доска - выбор доски', args: { group, page, frame: 1 } }
export const Frame3: Story = { name: 'Доска - вход в настройки', args: { group, page, frame: 2 } }
export const Frame4: Story = { name: 'Доска - статусы без колонки', args: { group, page, frame: 3 } }
export const Frame5: Story = { name: 'Доска - статусы колонки', args: { group, page, frame: 4 } }
export const Frame6: Story = { name: 'Стало - канбан', args: { group, page, frame: 5 } }
export const Frame7: Story = { name: 'Стало - канбан с дорожками', args: { group, page, frame: 6 } }
