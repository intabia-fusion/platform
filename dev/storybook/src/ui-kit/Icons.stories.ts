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

import IconsKit from './IconsKit.svelte'

const meta = {
  title: 'Overview/Icons',
  tags: ['!autodocs'],
  parameters: { layout: 'fullscreen', controls: { disable: true } }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// The only story of the component: the sidebar shows it as one item, Overview / Icons.
export const Groups: Story = { name: 'Icons', render: () => ({ Component: IconsKit }) }
