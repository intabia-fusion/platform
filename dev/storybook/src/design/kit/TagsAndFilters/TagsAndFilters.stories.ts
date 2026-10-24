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

import ChipDemo from '../demo/ChipDemo.svelte'
import FilterChip from './FilterChip.svelte'
import QuickFilter from './QuickFilter.svelte'
import Swatch from './Swatch.svelte'
import Tag from './Tag.svelte'
import FramedSections from '../FramedSections.svelte'

const meta: Meta = {
  title: 'Kit/Tags and filters',
  tags: ['!autodocs'],
  parameters: { layout: 'padded', controls: { disable: true } }
}

export default meta
type Story = StoryObj<typeof meta>

const sections = (list: unknown[]): Story => ({
  render: (_args, { title, name }) => ({
    Component: FramedSections,
    props: { sections: list, title: `${title.replace('Kit/', '')} - ${name}` }
  })
})

export const ChipStates: Story = sections([
  {
    title: 'Chip (slot content)',
    component: ChipDemo,
    rows: [{ title: 'chip', props: {} }],
    columns: [
      { title: 'with text', props: { icon: 'milestone', text: 'Release 1.0' } },
      { title: 'icon only', props: { icon: 'component', text: undefined } }
    ]
  }
])

export const TagStates: Story = sections([
  {
    title: 'Tag',
    component: Tag,
    rows: [{ title: 'label', props: {} }],
    columns: ['Sky', 'Orange', 'Grass', 'Fuchsia'].map((c) => ({ title: c, props: { label: [c.toLowerCase(), c] } }))
  }
])

export const QuickFilterStates: Story = sections([
  {
    title: 'QuickFilter',
    component: QuickFilter,
    rows: [{ title: 'pill', props: { label: 'Only mine' } }],
    columns: axis('on', [false, true])
  }
])

export const FilterChipStates: Story = sections([
  {
    title: 'FilterChip',
    component: FilterChip,
    rows: [{ title: 'condition', props: {} }],
    columns: [{ title: '', props: { attribute: 'Priority', operator: 'in', value: 'Urgent, High' } }]
  }
])

export const SwatchStates: Story = sections([
  {
    title: 'Swatch',
    component: Swatch,
    rows: [{ title: 'color', props: {} }],
    columns: axis('color', ['Orange', 'Firework', 'Grass', '#6B3AD3'])
  }
])
