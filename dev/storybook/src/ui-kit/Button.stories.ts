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

import { getEmbeddedLabel } from '@hcengineering/platform'
import { IconAdd } from '@hcengineering/ui'
import { Button } from '@hcengineering/ui/kit'
import type { Meta, StoryObj } from '@storybook/svelte'

import Sections from '../helpers/Sections.svelte'
import { axis } from '../helpers/matrix'

const kinds = ['primary', 'secondary', 'tertiary', 'negative'] as const
const sizes = ['large', 'medium', 'small', 'extra-small', 'min'] as const
const label = getEmbeddedLabel('Button')

const meta = {
  title: 'UI Kit/Button',
  component: Button,
  args: { label, icon: IconAdd, kind: 'secondary', size: 'large' }
} satisfies Meta<Button>

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
          title: 'Sizes',
          component: Button,
          rows: axis('kind', kinds),
          columns: axis(
            'size',
            sizes.filter((size) => size !== 'min')
          ),
          props: { label, icon: IconAdd }
        },
        {
          title: 'Round',
          component: Button,
          rows: axis('kind', kinds),
          columns: axis(
            'size',
            sizes.filter((size) => size !== 'min')
          ),
          props: { label, icon: IconAdd, shape: 'round' }
        },
        {
          title: 'States',
          component: Button,
          rows: axis('kind', kinds),
          columns: [
            { title: 'default', props: {} },
            { title: 'pressed', props: { pressed: true } },
            { title: 'menu open', props: { hasMenu: true, pressed: true } },
            { title: 'loading', props: { loading: true } },
            { title: 'disabled', props: { disabled: true } }
          ],
          props: { label, icon: IconAdd }
        }
      ]
    }
  })
}
