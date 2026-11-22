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

import Canvas from '../Canvas.svelte'

// Все четыре экрана раздела на одном полотне, 2x2.
const meta = {
  title: 'Встречи - все экраны',
  component: Canvas,
  tags: ['!autodocs', 'screen'],
  parameters: { layout: 'fullscreen' }
} satisfies Meta<Canvas>

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {
  name: 'Календарь, список, таблица, группы',
  args: { group: 'MeetingsUnified', page: 'Встречи - все экраны' }
}
