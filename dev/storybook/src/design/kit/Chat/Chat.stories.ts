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

import FramedSections from '../FramedSections.svelte'
import SizedDemo from '../demo/SizedDemo.svelte'
import DateSeparator from './DateSeparator.svelte'
import Message from './Message.svelte'
import MessageInput from './MessageInput.svelte'
import NewMarker from './NewMarker.svelte'

const meta: Meta = {
  title: 'Kit/Chat',
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

const one = [{ title: '', props: {} }]
const sized = (
  component: unknown,
  width: number,
  height: number,
  props: Record<string, unknown>
): Record<string, unknown> => ({ component, width, height, nav: false, props })

export const MessageStates: Story = sections([
  {
    title: 'Message',
    component: SizedDemo,
    rows: [
      {
        title: 'person',
        props: sized(Message, 640, 64, {
          author: 'Anna Smith',
          time: '10:12 AM',
          text: 'The new column is in, please check the order.',
          person: { initials: 'SA', color: 'Mauve' }
        })
      },
      {
        title: 'system',
        props: sized(Message, 640, 64, {
          author: 'System',
          time: '5:47 PM',
          text: 'Created this channel on Mar 29, 2022'
        })
      }
    ],
    columns: one
  }
])

export const DateSeparatorStates: Story = sections([
  {
    title: 'DateSeparator and NewMarker',
    component: SizedDemo,
    rows: [
      { title: 'date', props: sized(DateSeparator, 640, 36, { label: 'Tuesday March 29' }) },
      { title: 'new messages', props: sized(NewMarker, 640, 20, { label: 'New' }) }
    ],
    columns: one
  }
])

export const MessageInputStates: Story = sections([
  {
    title: 'MessageInput',
    component: SizedDemo,
    rows: [{ title: 'empty', props: sized(MessageInput, 640, 90, {}) }],
    columns: one
  }
])
