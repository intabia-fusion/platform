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

import FormRowDemo from '../demo/FormRowDemo.svelte'
import GridRowDemo from '../demo/GridRowDemo.svelte'
import SectionDemo from '../demo/SectionDemo.svelte'
import SettingRowDemo from '../demo/SettingRowDemo.svelte'
import SettingsDemo from '../demo/SettingsDemo.svelte'
import SectionTitle from './SectionTitle.svelte'
import Table from './Table.svelte'
import FramedSections from '../FramedSections.svelte'

const meta: Meta = {
  title: 'Kit (pen.dev)/Settings',
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

export const SectionTitleStates: Story = sections([
  {
    title: 'SectionTitle',
    component: SectionTitle,
    rows: [
      { title: 'with hint', props: { title: 'General', hint: 'Changes are saved immediately.' } },
      { title: 'title only', props: { title: 'Archive' } }
    ],
    columns: [{ title: '', props: {} }]
  }
])

export const FormRowStates: Story = sections([
  {
    title: 'FormRow',
    component: FormRowDemo,
    rows: [{ title: 'rows', props: {} }],
    columns: [{ title: '', props: {} }]
  }
])

export const TableStates: Story = sections([
  {
    title: 'Table',
    component: Table,
    rows: [
      {
        title: 'text cells',
        props: {
          columns: [
            { title: 'Board', width: 240 },
            { title: 'Projects', width: 130 },
            { title: 'Visibility', width: 160 }
          ],
          rows: [
            ['Main board', 'APP · MKT', 'Everyone'],
            ['Release 1.0', 'APP', 'Everyone'],
            ['My sprint', 'APP', 'Only me']
          ]
        }
      }
    ],
    columns: [{ title: '', props: {} }]
  }
])

export const SettingsLayoutStates: Story = sections([
  {
    title: 'SettingsLayout',
    component: SettingsDemo,
    rows: [
      { title: 'tabs', props: {} },
      { title: 'second-level tabs', props: { subtabs: ['General', 'Columns', 'Swimlanes'] } }
    ],
    columns: [{ title: '', props: {} }]
  }
])

export const GridRowStates: Story = sections([
  {
    title: 'GridRow',
    component: GridRowDemo,
    rows: [{ title: 'form rows', props: {} }],
    columns: [{ title: '', props: {} }]
  }
])

export const SettingRowStates: Story = sections([
  {
    title: 'SettingRow',
    component: SettingRowDemo,
    rows: [
      { title: 'toggle', props: { control: 'toggle' } },
      { title: 'hint', props: { control: 'toggle', hint: 'Visible to members only' } },
      { title: 'input', props: { control: 'input', label: 'Name' } },
      { title: 'stacked', props: { control: 'area', label: 'Description', stacked: true } },
      { title: 'details', props: { control: 'input', label: 'Owners', details: true } }
    ],
    columns: [{ title: '', props: { width: 560 } }]
  }
])

export const SectionStates: Story = sections([
  {
    title: 'Section',
    component: SectionDemo,
    rows: [
      { title: 'level 2', props: {} },
      { title: 'icon', props: { icon: 'setting/settings' } },
      { title: 'actions', props: { actions: true } },
      { title: 'level 3', props: { level: 3 } },
      { title: 'level 4', props: { level: 4 } }
    ],
    columns: [{ title: '', props: { width: 480 } }]
  }
])
