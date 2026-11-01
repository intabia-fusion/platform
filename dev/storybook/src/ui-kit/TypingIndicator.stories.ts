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
import { TypingIndicator } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import TypingIndicatorExample from './typing/TypingIndicatorExample.svelte'
import TypingNavigatorExample from './typing/TypingNavigatorExample.svelte'

const meta = {
  title: 'Display/TypingIndicator',
  component: TypingIndicator,
  args: { typing: true },
  parameters: {
    docs: {
      description: {
        component:
          '**Когда:** кто-то печатает в канале или директе - отметка на иконке строки навигатора чата. **Не этот компонент:** строка «Андрей печатает…» под полем ввода - текст места.\n\n' +
          '`TypingIndicator` оборачивает иконку объекта или аватар (слот по умолчанию); с `typing` из правого нижнего угла выпрыгивает светлая пилюля с тремя точками цвета бренда и закрывает точку присутствия аватара. Отметка декоративная (`aria-hidden`): кто печатает, называет место. При `prefers-reduced-motion` точки только мерцают, пилюля появляется без анимации.'
      }
    }
  },
  render: (args) => ({ Component: TypingIndicatorExample, props: { ...args, kind: 'direct', online: true } })
} satisfies Meta<TypingIndicator>

export default meta
type Story = StoryObj<typeof meta>

export const Playground: Story = {}

export const Variants: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => ({
    Component: Sections,
    props: {
      sections: [
        {
          title: 'Objects',
          component: TypingIndicatorExample,
          rows: [
            { title: 'idle', props: {} },
            { title: 'typing', props: { typing: true } }
          ],
          columns: [
            { title: 'channel', props: { kind: 'channel' } },
            { title: 'private', props: { kind: 'private' } },
            { title: 'direct online', props: { kind: 'direct', online: true } },
            { title: 'direct offline', props: { kind: 'direct' } }
          ]
        },
        {
          title: 'In navigator (rows start and stop typing in turn)',
          component: TypingNavigatorExample,
          rows: [{ title: '', props: {} }],
          columns: [{ title: '', props: { live: true } }]
        }
      ]
    }
  })
}
