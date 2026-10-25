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
import { axis } from '../../../helpers/matrix'

import { people } from '../sample'
import Avatar from './Avatar.svelte'
import FramedSections from '../FramedSections.svelte'

const meta: Meta = {
  title: 'Kit (pen.dev)/People',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
}

export default meta
type Story = StoryObj<typeof meta>

const sections = (list: unknown[]): Story => ({
  render: (_args, { title, name }) => ({
    Component: FramedSections,
    props: { sections: list, title: `${title.slice(title.lastIndexOf('/') + 1)} - ${name}` }
  })
})

export const AvatarStates: Story = sections([
  {
    title: 'Sizes',
    component: Avatar,
    rows: people.map((person) => ({ title: person.initials, props: { person } })),
    columns: axis('size', [20, 24, 32, 40])
  },
  {
    title: 'No assignee and status',
    component: Avatar,
    rows: [
      { title: 'empty', props: {} },
      { title: 'status', props: { person: people[0], size: 32, status: true } }
    ],
    columns: [{ title: '', props: {} }]
  }
])
