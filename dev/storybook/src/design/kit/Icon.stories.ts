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
import type { Meta, StoryObj } from '@storybook/svelte'

import FramedSections from './FramedSections.svelte'
import Icon from './Icon.svelte'

const meta: Meta = {
  title: 'Kit (pen.dev)/Icon',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
}

export default meta
type Story = StoryObj<typeof meta>

const names = [
  'plus',
  'chevronR',
  'list',
  'board',
  'filter',
  'search',
  'gear',
  'tick',
  'tracker/issues',
  'tracker/home',
  'task/kanban',
  'time/calendar',
  'ui/Add',
  'ui/Search',
  'ui/MoreH'
]

export const IconStates: Story = {
  render: (_args, { title, name }) => ({
    Component: FramedSections,
    props: {
      title: `${title.slice(title.lastIndexOf('/') + 1)} - ${name}`,
      sections: [
        {
          title: 'Icon - kit, sprite and ui names',
          component: Icon,
          rows: [16, 24].map((size) => ({ title: String(size), props: { size } })),
          columns: names.map((name) => ({ title: name, props: { name } }))
        }
      ]
    }
  })
}
